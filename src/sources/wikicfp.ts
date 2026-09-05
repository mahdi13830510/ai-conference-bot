import {
	Conference,
} from "../types";

import {
	ConferenceSource,
} from "./types";

const RSS_URL =
	"https://www.wikicfp.com/cfp/rss";

const EVENT_URL =
	"https://www.wikicfp.com/cfp/servlet/event.showcfp";

const USER_AGENT =
	"ai-conference-telegram-bot/1.0";

/**
 * Categories to pull. WikiCFP is far broader than the curated
 * ai-deadlines list, so this stays deliberately narrow.
 */
const CATEGORIES = [
	"machine learning",
	"artificial intelligence",
	"computer vision",
	"natural language processing",
	"data mining",
	"robotics",
];

/**
 * WikiCFP's RSS carries no submission deadline, so each event
 * page has to be fetched. That is the expensive part, and it
 * is bounded to keep the sync inside the Worker CPU budget.
 */
const MAX_EVENT_FETCHES = 40;

const MONTHS: Record<string, number> = {
	jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
	jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function decodeEntities(
	value: string
): string {

	return value
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&");
}

function stripTags(
	value: string
): string {

	return decodeEntities(
		value.replace(/<[^>]+>/g, " ")
	)
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * "Dec 10, 2026" -> "2026-12-10 23:59:59"
 *
 * WikiCFP publishes dates without a time or timezone. Treating
 * them as end-of-day UTC is the only honest reading, and the
 * record is flagged so the UI can say so.
 */
function parseDate(
	value: string
): string | null {

	const match =
		value.match(/([A-Za-z]{3})\w*\s+(\d{1,2}),?\s+(\d{4})/);

	if (!match) {
		return null;
	}

	const month =
		MONTHS[match[1].toLowerCase()];

	if (!month) {
		return null;
	}

	const day =
		Number(match[2]);

	const year =
		Number(match[3]);

	return (
		`${year}-` +
		`${String(month).padStart(2, "0")}-` +
		`${String(day).padStart(2, "0")} 23:59:59`
	);
}

interface RssItem {
	title: string;
	link: string;
	description: string;
}

function parseRss(
	xml: string
): RssItem[] {

	const items: RssItem[] = [];

	const itemPattern =
		/<item>([\s\S]*?)<\/item>/g;

	let match;

	while ((match = itemPattern.exec(xml)) !== null) {

		const field = (name: string) => {

			const found =
				match![1].match(
					new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)
				);

			return found
				? decodeEntities(found[1]).trim()
				: "";
		};

		const title =
			field("title");

		const link =
			field("link");

		if (title && link) {

			items.push({
				title,
				link,
				description: field("description"),
			});
		}
	}

	return items;
}

/**
 * "ICMLT--EI 2027 : 2027 12th International Conference on ..."
 */
function parseTitle(
	raw: string
): { acronym: string; year: number; fullName: string } | null {

	const [left, ...rest] =
		raw.split(" : ");

	const match =
		left.match(/^(.+?)\s+(\d{4})\s*$/);

	if (!match) {
		return null;
	}

	const acronym =
		match[1]
			.replace(/--.*$/, "")
			.trim();

	if (!acronym || acronym.length > 24) {
		return null;
	}

	return {
		acronym,
		year: Number(match[2]),
		fullName: rest.join(" : ").trim() || acronym,
	};
}

/**
 * "Name [Stockholm, Sweden] [May 21, 2027 - May 23, 2027]"
 */
function parseDescription(
	description: string
): { place: string | null; date: string | null } {

	const brackets =
		[...description.matchAll(/\[([^\]]+)\]/g)]
			.map(group => group[1].trim());

	return {
		place: brackets[0] ?? null,
		date: brackets[1] ?? null,
	};
}

function eventId(
	link: string
): string | null {

	return link.match(/eventid=(\d+)/)?.[1] ?? null;
}

async function fetchDeadline(
	id: string
): Promise<string | null> {

	const response =
		await fetch(
			`${EVENT_URL}?eventid=${id}`,
			{
				headers: {
					"User-Agent": USER_AGENT,
				},
			}
		);

	if (!response.ok) {
		return null;
	}

	const html =
		await response.text();

	const cell =
		html.match(
			/<th>\s*Submission Deadline\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/
		);

	return cell
		? parseDate(stripTags(cell[1]))
		: null;
}

async function fetchCategory(
	category: string
): Promise<RssItem[]> {

	const response =
		await fetch(
			`${RSS_URL}?cat=${encodeURIComponent(category)}`,
			{
				headers: {
					"User-Agent": USER_AGENT,
				},
			}
		);

	if (!response.ok) {
		throw new Error(
			`WikiCFP returned ${response.status} for "${category}"`
		);
	}

	return parseRss(await response.text());
}

/**
 * Secondary source, for venues the curated feed does not
 * cover. Off by default because it costs one HTTP request per
 * event to recover a deadline.
 */
export const wikicfp: ConferenceSource = {

	name: "wikicfp",

	label: "WikiCFP",

	enabledByDefault: false,

	async fetch(): Promise<Conference[]> {

		const seen =
			new Set<string>();

		const candidates: {
			id: string;
			acronym: string;
			year: number;
			fullName: string;
			link: string;
			place: string | null;
			date: string | null;
		}[] = [];

		for (const category of CATEGORIES) {

			let items: RssItem[];

			try {
				items = await fetchCategory(category);

			} catch (error) {

				console.error(
					"WikiCFP category failed:",
					category,
					error
				);

				continue;
			}

			for (const item of items) {

				const id =
					eventId(item.link);

				const parsed =
					parseTitle(item.title);

				if (!id || !parsed || seen.has(id)) {
					continue;
				}

				seen.add(id);

				const { place, date } =
					parseDescription(item.description);

				candidates.push({
					id,
					acronym: parsed.acronym,
					year: parsed.year,
					fullName: parsed.fullName,
					link: item.link,
					place,
					date,
				});
			}
		}

		/*
		 * Nearest events first, then take as many deadlines as
		 * the budget allows.
		 */
		candidates.sort(
			(a, b) => a.year - b.year
		);

		const conferences: Conference[] = [];

		for (const candidate of candidates.slice(0, MAX_EVENT_FETCHES)) {

			let deadline: string | null = null;

			try {
				deadline = await fetchDeadline(candidate.id);

			} catch (error) {

				console.error(
					"WikiCFP event failed:",
					candidate.id,
					error
				);
			}

			if (!deadline) {
				continue;
			}

			conferences.push({
				id: `wikicfp-${candidate.id}`,

				title: candidate.acronym,

				year: candidate.year,

				full_name: candidate.fullName,

				link: candidate.link,

				cfp_link: candidate.link,

				deadline,

				/*
				 * WikiCFP dates have no timezone; UTC end-of-day
				 * is the safe reading and the note says so.
				 */
				timezone: "UTC",

				place: candidate.place ?? undefined,

				date: candidate.date ?? undefined,

				note:
					"Imported from WikiCFP. The deadline has no " +
					"published timezone and is treated as 23:59 UTC. " +
					"Please verify on the official website.",

				source: "wikicfp",
			});
		}

		return conferences;
	},
};
