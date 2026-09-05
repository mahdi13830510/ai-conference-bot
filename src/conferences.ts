import {
	Conference,
	DbConference,
} from "./types";

const AI_DEADLINES_URL =
	"https://mlciv.com/ai-deadlines/api/upcoming.json";

/*
 * Convert strings like:
 *
 * 2026-10-02 23:59:59
 *
 * into:
 *
 * 2026-10-02T23:59:59
 */
function normalizeLocalDate(
	value: string
): string {
	return value
		.trim()
		.replace(" ", "T");
}

/*
 * Normalize special fixed-offset names used by
 * ai-deadlines so Intl accepts them.
 */

function normalizeTimezone(
	timezone: string
): string {

	if (timezone === "AoE") {
		return "Etc/GMT+12";
	}

	if (timezone === "UTC-12") {
		return "Etc/GMT+12";
	}

	if (timezone === "UTC+12") {
		return "Etc/GMT-12";
	}

	const match =
		timezone.match(
			/^UTC([+-])(\d{1,2})(?::(\d{2}))?$/
		);

	if (!match) {
		return timezone;
	}

	const sign = match[1];

	const hours =
		Number(match[2]);

	/*
	 * Etc/GMT uses reversed signs.
	 */
	const reversedSign =
		sign === "+" ? "-" : "+";

	return `Etc/GMT${reversedSign}${hours}`;
}

/*
 * Convert a local date/time in an IANA timezone
 * into UTC.
 *
 * We use Intl.DateTimeFormat instead of adding
 * another timezone dependency to the Worker.
 */
export function zonedTimeToUtc(
	localDateTime: string,
	timezone = "UTC"
): Date | null {

	const normalized =
		normalizeLocalDate(localDateTime);

	const match =
		normalized.match(
			/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/
		);

	if (!match) {
		return null;
	}

	const [
		,
		year,
		month,
		day,
		hour,
		minute,
		second = "0",
	] = match;

	const targetMs =
		Date.UTC(
			Number(year),
			Number(month) - 1,
			Number(day),
			Number(hour),
			Number(minute),
			Number(second)
		);

	const zone =
		normalizeTimezone(timezone);

	let guess =
		targetMs;

	const formatter =
		new Intl.DateTimeFormat(
			"en-US",
			{
				timeZone: zone,
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
				hourCycle: "h23",
			}
		);

	/*
	 * Two iterations are enough for normal timezone
	 * and DST offsets.
	 */
	for (let i = 0; i < 3; i++) {

		const parts =
			formatter.formatToParts(
				new Date(guess)
			);

		const values: Record<
			string,
			number
		> = {};

		for (const part of parts) {
			if (
				part.type !== "literal"
			) {
				values[part.type] =
					Number(part.value);
			}
		}

		const observedMs =
			Date.UTC(
				values.year,
				values.month - 1,
				values.day,
				values.hour,
				values.minute,
				values.second
			);

		const difference =
			targetMs - observedMs;

		guess += difference;

		if (difference === 0) {
			break;
		}
	}

	return new Date(guess);
}

export function deadlineToUtc(
	deadline?: string,
	timezone?: string
): string | null {

	if (!deadline) {
		return null;
	}

	const date =
		zonedTimeToUtc(
			deadline,
			timezone || "UTC"
		);

	return date
		? date.toISOString()
		: null;
}

export function isPredicted(
	conference: Conference
): boolean {

	const note =
		conference.note?.toLowerCase() ||
		"";

	return (
		note.includes("predicted") ||
		note.includes("estimated") ||
		note.includes("please verify")
	);
}

export async function fetchConferences()
	: Promise<Conference[]> {

	const response =
		await fetch(
			AI_DEADLINES_URL,
			{
				headers: {
					Accept:
						"application/json",

					"User-Agent":
						"ai-conference-telegram-bot/1.0",
				},
			}
		);

	if (!response.ok) {
		throw new Error(
			`ai-deadlines returned ${response.status}`
		);
	}

	const data =
		await response.json();

	if (!Array.isArray(data)) {
		throw new Error(
			"Invalid ai-deadlines response"
		);
	}

	return data as Conference[];
}

/*
 * Only keep conferences whose paper deadline
 * is still in the future.
 */
export function getFutureConferences(
	conferences: Conference[]
): Conference[] {

	const now =
		Date.now();

	return conferences
		.filter((conference) => {

			const deadline =
				deadlineToUtc(
					conference.deadline,
					conference.timezone
				);

			if (!deadline) {
				return false;
			}

			return (
				new Date(deadline).getTime() >
				now
			);
		})
		.sort((a, b) => {

			const deadlineA =
				deadlineToUtc(
					a.deadline,
					a.timezone
				);

			const deadlineB =
				deadlineToUtc(
					b.deadline,
					b.timezone
				);

			return (
				new Date(
					deadlineA || "9999-01-01"
				).getTime() -
				new Date(
					deadlineB || "9999-01-01"
				).getTime()
			);
		});
}

/*
 * Prepare a conference for D1.
 */
export function toDbConference(
	conference: Conference,
	existingFirstSeen?: string
): DbConference {

	const now =
		new Date().toISOString();

	return {
		id: conference.id,

		title: conference.title,

		year: conference.year,

		full_name:
			conference.full_name ??
			null,

		link:
			conference.link ??
			null,

		deadline:
			conference.deadline ??
			null,

		abstract_deadline:
			conference.abstract_deadline ??
			null,

		deadline_utc:
			deadlineToUtc(
				conference.deadline,
				conference.timezone
			),

		abstract_deadline_utc:
			deadlineToUtc(
				conference.abstract_deadline,
				conference.timezone
			),

		timezone:
			conference.timezone ??
			null,

		place:
			conference.place ??
			null,

		date:
			conference.date ??
			null,

		start:
			conference.start ??
			null,

		end:
			conference.end ??
			null,

		topics:
			conference.sub
				? JSON.stringify(
					conference.sub
				)
				: null,

		note:
			conference.note ??
			null,

		hindex:
			conference.hindex ??
			null,

		paperslink:
			conference.paperslink ??
			null,

		pwclink:
			conference.pwclink ??
			null,

		first_seen_at:
			existingFirstSeen ??
			now,

		updated_at:
			now,
	};
}

export function parseTopics(
	value: string | null
): string[] {

	if (!value) {
		return [];
	}

	try {
		const parsed =
			JSON.parse(value);

		return Array.isArray(parsed)
			? parsed
			: [];

	} catch {
		return [];
	}
}
