import {
	DbConference,
} from "./types";

import {
	parseTopics,
} from "./conferences";

import {
	PAGE_SIZE,
} from "./config";

/**
 * Rendering helpers that turn conference rows into
 * the plain-text messages the bot sends to Telegram.
 */

export function formatDate(
	value: string | null
): string {

	if (!value) {
		return "TBA";
	}

	const date =
		new Date(value);

	if (
		Number.isNaN(
			date.getTime()
		)
	) {
		return value;
	}

	return new Intl.DateTimeFormat(
		"en-US",
		{
			year: "numeric",
			month: "short",
			day: "numeric",
			timeZone: "UTC",
		}
	).format(date);
}

export function remaining(
	deadlineUtc: string | null
): string {

	if (!deadlineUtc) {
		return "";
	}

	const difference =
		new Date(
			deadlineUtc
		).getTime() -
		Date.now();

	const days =
		Math.ceil(
			difference /
			(1000 * 60 * 60 * 24)
		);

	if (days < 0) {
		return "expired";
	}

	if (days === 0) {
		return "today";

	}

	if (days === 1) {
		return "1 day left";
	}

	return `${days} days left`;
}

export function deadlineBadge(
	deadlineUtc: string | null
): string {

	if (!deadlineUtc) {
		return "⚪";
	}

	const difference =
		new Date(
			deadlineUtc
		).getTime() -
		Date.now();

	const days =
		difference /
		(1000 * 60 * 60 * 24);

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

export function conferenceText(
	conference: DbConference
): string {

	const topics =
		parseTopics(
			conference.topics
		);

	const badge =
		deadlineBadge(
			conference.deadline_utc
		);

	const remainingText =
		remaining(
			conference.deadline_utc
		);

	let text =
		`${badge} ${conference.title} ${conference.year}\n\n`;

	if (conference.full_name) {
		text +=
			`${conference.full_name}\n\n`;
	}

	text +=
		`📅 Paper deadline: ` +
		`${formatDate(conference.deadline_utc)}`;

	if (remainingText) {
		text +=
			` (${remainingText})`;
	}

	text +=
		`\n`;

	if (conference.abstract_deadline_utc) {

		text +=
			`📝 Abstract deadline: ` +
			`${formatDate(
				conference.abstract_deadline_utc
			)}\n`;
	}

	text +=
		`🌍 Location: ` +
		`${conference.place || "TBA"}\n`;

	text +=
		`🏷 Topics: ` +
		`${topics.length
			? topics.join(", ")
			: "Unknown"}\n`;

	if (conference.date) {

		text +=
			`📆 Conference: ` +
			`${conference.date}\n`;
	}

	if (conference.timezone) {

		text +=
			`🕐 Deadline timezone: ` +
			`${conference.timezone}\n`;
	}

	if (conference.note) {

		const cleanNote =
			conference.note
				.replace(
					/<[^>]*>/g,
					""
				)
				.slice(0, 700);

		text +=
			`\nℹ️ ${cleanNote}\n`;
	}

	if (
		conference.note
			?.toLowerCase()
			.includes("predicted")
	) {

		text +=
			`\n⚠️ This deadline is predicted. ` +
			`Verify it on the official website.`;
	}

	return text;
}

export function listText(
	title: string,
	rows: DbConference[],
	page: number,
	total: number
): string {

	const pages =
		Math.max(
			1,
			Math.ceil(
				total / PAGE_SIZE
			)
		);

	let text =
		`${title}\n\n`;

	text +=
		`Showing ` +
		`${rows.length ? ((page - 1) * PAGE_SIZE) + 1 : 0}` +
		`–` +
		`${Math.min(
			page * PAGE_SIZE,
			total
		)}` +
		` of ${total}\n\n`;

	rows.forEach(
		(conference, index) => {

			const number =
				((page - 1) * PAGE_SIZE) +
				index +
				1;

			text +=
				`${number}. ` +
				`${deadlineBadge(
					conference.deadline_utc
				)} ` +
				`${conference.title} ` +
				`${conference.year}\n`;

			text +=
				`   📅 ${formatDate(
					conference.deadline_utc
				)}`;

			const rem =
				remaining(
					conference.deadline_utc
				);

			if (rem) {
				text += ` (${rem})`;
			}

			text +=
				`\n`;

			text +=
				`   📍 ${conference.place ||
				"TBA"
				}\n`;

			const topics =
				parseTopics(
					conference.topics
				);

			if (topics.length) {
				text +=
					`   🏷 ${topics.join(", ")}\n`;
			}

			text += "\n";
		});

	text +=
		`Page ${page} / ${pages}`;

	return text;
}
