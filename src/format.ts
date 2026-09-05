import {
	DbConference,
	AcceptanceRate,
	CountryInfo,
	VenueHistoryRow,
} from "./types";

import {
	parseTopics,
} from "./conferences";

import {
	rankBadge,
} from "./enrich";

import {
	PAGE_SIZE,
	FORMAT_LABELS,
	MAX_MESSAGE_LENGTH,
} from "./config";

import {
	escapeHtml,
} from "./telegram";

export {
	escapeHtml,
};

const DAY_MS =
	1000 * 60 * 60 * 24;

/* =========================================================
	 DATES
	 ========================================================= */

/**
 * Renders a UTC instant in the viewer's own timezone, which is
 * the only reading that answers "how long do I actually have".
 */
export function formatDate(
	value: string | null,
	timeZone = "UTC",
	withTime = false
): string {

	if (!value) {
		return "TBA";
	}

	const date =
		new Date(value);

	if (Number.isNaN(date.getTime())) {
		return value;
	}

	try {

		return new Intl.DateTimeFormat(
			"en-GB",
			{
				year: "numeric",
				month: "short",
				day: "numeric",

				...(withTime
					? {
						hour: "2-digit",
						minute: "2-digit",
						timeZoneName: "short",
					}
					: {}),

				timeZone,
			}
		).format(date);

	} catch {

		/*
		 * An invalid stored timezone must not break rendering.
		 */
		return formatDate(value, "UTC", withTime);
	}
}

export function remaining(
	deadlineUtc: string | null
): string {

	if (!deadlineUtc) {
		return "";
	}

	const difference =
		new Date(deadlineUtc).getTime() - Date.now();

	if (difference < 0) {
		return "expired";
	}

	const hours =
		difference / (1000 * 60 * 60);

	if (hours < 1) {

		const minutes =
			Math.max(1, Math.round(difference / (1000 * 60)));

		return `${minutes} min left`;
	}

	if (hours < 24) {
		return `${Math.floor(hours)}h left`;
	}

	const days =
		Math.ceil(difference / DAY_MS);

	return days === 1
		? "1 day left"
		: `${days} days left`;
}

export function deadlineBadge(
	deadlineUtc: string | null
): string {

	if (!deadlineUtc) {
		return "⚪";
	}

	const days =
		(new Date(deadlineUtc).getTime() - Date.now()) / DAY_MS;

	if (days < 0) {
		return "⚫";
	}

	if (days <= 7) {
		return "🔴";
	}

	if (days <= 30) {
		return "🟠";
	}

	if (days <= 90) {
		return "🟡";
	}

	return "🟢";
}

/* =========================================================
	 MESSAGE SPLITTING
	 ========================================================= */

/**
 * Splits a long message on paragraph boundaries so nothing is
 * silently truncated at Telegram's 4096-character limit.
 */
export function chunkMessage(
	text: string,
	limit = MAX_MESSAGE_LENGTH
): string[] {

	if (text.length <= limit) {
		return [text];
	}

	const chunks: string[] = [];

	let current = "";

	for (const block of text.split("\n\n")) {

		const candidate =
			current
				? `${current}\n\n${block}`
				: block;

		if (candidate.length <= limit) {
			current = candidate;
			continue;
		}

		if (current) {
			chunks.push(current);
			current = "";
		}

		/*
		 * A single paragraph over the limit still has to be cut.
		 */
		let rest = block;

		while (rest.length > limit) {
			chunks.push(rest.slice(0, limit));
			rest = rest.slice(limit);
		}

		current = rest;
	}

	if (current) {
		chunks.push(current);
	}

	return chunks;
}

/* =========================================================
	 CONFERENCE DETAIL
	 ========================================================= */

export interface ConferenceContext {
	timezone?: string;
	rates?: AcceptanceRate[];
	country?: CountryInfo | null;
	history?: VenueHistoryRow[];
	saved?: boolean;
	muted?: boolean;
}

function ratesLine(
	rates: AcceptanceRate[]
): string {

	const recent =
		rates.slice(0, 5);

	if (!recent.length) {
		return "";
	}

	const parts =
		recent.map(rate => {

			const value =
				rate.rate === null
					? "?"
					: `${rate.rate}%`;

			return `${rate.year}: ${value}`;
		});

	const latest =
		recent[0];

	let text =
		`\n📊 <b>Acceptance rate</b>\n` +
		`${escapeHtml(parts.join(" · "))}\n`;

	if (latest.accepted && latest.submitted) {

		text +=
			`<i>${latest.year}: ` +
			`${latest.accepted.toLocaleString()} accepted of ` +
			`${latest.submitted.toLocaleString()} submitted</i>\n`;
	}

	return text;
}

export function conferenceText(
	conference: DbConference,
	context: ConferenceContext = {}
): string {

	const timezone =
		context.timezone ?? "UTC";

	const topics =
		parseTopics(conference.topics);

	const badge =
		deadlineBadge(conference.deadline_utc);

	const rank =
		rankBadge(conference.core_rank);

	const title =
		escapeHtml(`${conference.title} ${conference.year}`);

	let text =
		`${badge} <b>${title}</b>`;

	if (rank) {
		text += `  ${escapeHtml(rank)}`;
	}

	text += `\n`;

	if (conference.full_name) {
		text +=
			`<i>${escapeHtml(conference.full_name)}</i>\n`;
	}

	text += `\n`;

	/*
	 * Deadlines, in the user's own timezone.
	 */
	const remainingText =
		remaining(conference.deadline_utc);

	text +=
		`📅 <b>Paper deadline</b>\n` +
		`<code>${escapeHtml(
			formatDate(conference.deadline_utc, timezone, true)
		)}</code>`;

	if (remainingText) {
		text += `  ·  <b>${escapeHtml(remainingText)}</b>`;
	}

	text += `\n`;

	if (conference.abstract_deadline_utc) {

		text +=
			`📝 <b>Abstract deadline</b>\n` +
			`<code>${escapeHtml(
				formatDate(
					conference.abstract_deadline_utc,
					timezone,
					true
				)
			)}</code>`;

		const abstractRemaining =
			remaining(conference.abstract_deadline_utc);

		if (abstractRemaining) {
			text += `  ·  ${escapeHtml(abstractRemaining)}`;
		}

		text += `\n`;
	}

	if (timezone !== "UTC") {
		text +=
			`<i>Times shown in ${escapeHtml(timezone)}</i>\n`;
	}

	text += `\n`;

	text +=
		`🌍 <b>Location</b>  ` +
		`${escapeHtml(conference.place || "TBA")}\n`;

	text +=
		`${FORMAT_LABELS[conference.format] ?? "❔ TBA"}\n`;

	if (conference.date) {
		text +=
			`📆 <b>Dates</b>  ${escapeHtml(conference.date)}\n`;
	}

	text +=
		`🏷 <b>Topics</b>  ` +
		`${escapeHtml(topics.length ? topics.join(", ") : "Unknown")}\n`;

	if (conference.core_rank) {

		text +=
			`🏅 <b>CORE rank</b>  ` +
			`${escapeHtml(conference.core_rank)}`;

		if (conference.core_name) {
			text +=
				`  <i>(${escapeHtml(conference.core_name)})</i>`;
		}

		text += `\n`;
	}

	if (context.rates?.length) {
		text += ratesLine(context.rates);
	}

	/*
	 * Past editions, built up from previous syncs.
	 */
	if (context.history?.length) {

		text += `\n🕰 <b>Past editions</b>\n`;

		for (const row of context.history.slice(0, 4)) {

			text +=
				`${row.year}: ` +
				`${escapeHtml(
					formatDate(row.deadline_utc, timezone)
				)}`;

			if (row.place) {
				text += ` · ${escapeHtml(row.place)}`;
			}

			text += `\n`;
		}
	}

	/*
	 * Travel. The bot links to the official portal and never
	 * states requirements, which depend on nationality.
	 */
	if (context.country) {

		text += `\n🛂 <b>Travel · ${escapeHtml(
			context.country.country
		)}</b>\n`;

		if (context.country.visa_note) {
			text += `${escapeHtml(context.country.visa_note)}\n`;
		}

		if (context.country.currency) {
			text +=
				`Local currency: ` +
				`${escapeHtml(context.country.currency)}\n`;
		}

		text +=
			`<i>Requirements depend on your nationality — ` +
			`always check the official portal.</i>\n`;
	}

	if (conference.deadline_changed_at &&
		conference.previous_deadline_utc) {

		text +=
			`\n⚠️ <b>Deadline moved</b> from ` +
			`${escapeHtml(
				formatDate(conference.previous_deadline_utc, timezone)
			)}\n`;
	}

	if (conference.note) {

		const cleanNote =
			conference.note
				.replace(/<[^>]*>/g, "")
				.slice(0, 600);

		text += `\nℹ️ ${escapeHtml(cleanNote)}\n`;
	}

	if (conference.note?.toLowerCase().includes("predicted")) {

		text +=
			`\n⚠️ <i>This deadline is predicted. Verify it on ` +
			`the official website.</i>`;
	}

	if (conference.source !== "ai-deadlines") {
		text +=
			`\n<i>Source: ${escapeHtml(conference.source)}</i>`;
	}

	return text;
}

/* =========================================================
	 LISTS
	 ========================================================= */

export function listText(
	title: string,
	rows: DbConference[],
	page: number,
	total: number,
	timezone = "UTC",
	footnote?: string
): string {

	const pages =
		Math.max(1, Math.ceil(total / PAGE_SIZE));

	let text =
		`<b>${escapeHtml(title)}</b>\n\n`;

	if (!total) {

		return (
			text +
			`No conferences matched.\n\n` +
			`Try a different filter, or /upcoming for everything.`
		);
	}

	const from =
		rows.length
			? ((page - 1) * PAGE_SIZE) + 1
			: 0;

	const to =
		Math.min(page * PAGE_SIZE, total);

	text +=
		`<i>Showing ${from}–${to} of ${total}</i>\n\n`;

	rows.forEach((conference, index) => {

		const number =
			((page - 1) * PAGE_SIZE) + index + 1;

		const rank =
			rankBadge(conference.core_rank);

		text +=
			`${number}. ${deadlineBadge(conference.deadline_utc)} ` +
			`<b>${escapeHtml(
				`${conference.title} ${conference.year}`
			)}</b>`;

		if (rank) {
			text += `  ${escapeHtml(rank)}`;
		}

		text += `\n`;

		text +=
			`    📅 <code>${escapeHtml(
				formatDate(conference.deadline_utc, timezone)
			)}</code>`;

		const rem =
			remaining(conference.deadline_utc);

		if (rem) {
			text += ` · ${escapeHtml(rem)}`;
		}

		text += `\n`;

		text +=
			`    📍 ${escapeHtml(conference.place || "TBA")}\n`;

		const topics =
			parseTopics(conference.topics);

		if (topics.length) {
			text +=
				`    🏷 ${escapeHtml(topics.join(", "))}\n`;
		}

		text += `\n`;
	});

	if (footnote) {
		text += `<i>${escapeHtml(footnote)}</i>\n\n`;
	}

	text += `<i>Page ${page} / ${pages}</i>`;

	return text;
}

/* =========================================================
	 PLANNING TIMELINE
	 ========================================================= */

/**
 * A month-bucketed view of what is due when, for deciding
 * where the next paper should go.
 */
export function timelineText(
	rows: DbConference[],
	timezone = "UTC",
	heading = "🗓 Your submission timeline"
): string {

	if (!rows.length) {

		return (
			`<b>${escapeHtml(heading)}</b>\n\n` +
			`Nothing scheduled yet.\n\n` +
			`Save conferences or set topic preferences, then ` +
			`open this again.`
		);
	}

	let text =
		`<b>${escapeHtml(heading)}</b>\n\n`;

	let currentMonth = "";

	for (const conference of rows) {

		if (!conference.deadline_utc) {
			continue;
		}

		const month =
			new Intl.DateTimeFormat("en-GB", {
				month: "long",
				year: "numeric",
				timeZone: "UTC",
			}).format(new Date(conference.deadline_utc));

		if (month !== currentMonth) {

			currentMonth = month;

			text += `\n<b>${escapeHtml(month)}</b>\n`;
		}

		const day =
			new Intl.DateTimeFormat("en-GB", {
				day: "2-digit",
				timeZone: timezone,
			}).format(new Date(conference.deadline_utc));

		const rank =
			rankBadge(conference.core_rank);

		text +=
			`  <code>${day}</code>  ` +
			`${deadlineBadge(conference.deadline_utc)} ` +
			`${escapeHtml(
				`${conference.title} ${conference.year}`
			)}`;

		if (rank) {
			text += ` ${escapeHtml(rank)}`;
		}

		const rem =
			remaining(conference.deadline_utc);

		if (rem) {
			text += ` <i>(${escapeHtml(rem)})</i>`;
		}

		text += `\n`;
	}

	const gaps =
		describeGaps(rows);

	if (gaps) {
		text += `\n${gaps}`;
	}

	return text;
}

/**
 * Flags deadlines that land within three days of each other,
 * which is the thing a planner most wants to see.
 */
function describeGaps(
	rows: DbConference[]
): string {

	const dated =
		rows
			.filter(row => row.deadline_utc)
			.sort(
				(a, b) =>
					new Date(a.deadline_utc!).getTime() -
					new Date(b.deadline_utc!).getTime()
			);

	const clashes: string[] = [];

	for (let index = 1; index < dated.length; index += 1) {

		const gap =
			(new Date(dated[index].deadline_utc!).getTime() -
				new Date(dated[index - 1].deadline_utc!).getTime()) /
			DAY_MS;

		if (gap <= 3) {

			clashes.push(
				`${dated[index - 1].title} and ${dated[index].title} ` +
				`are ${gap < 1 ? "on the same day" : `${Math.round(gap)} days apart`}`
			);
		}
	}

	if (!clashes.length) {
		return "";
	}

	return (
		`⚠️ <b>Tight spots</b>\n` +
		clashes
			.slice(0, 4)
			.map(clash => `• ${escapeHtml(clash)}`)
			.join("\n")
	);
}
