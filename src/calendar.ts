import {
	DbConference,
} from "./types";

/**
 * Calendar interop: Google Calendar deep links and RFC 5545
 * .ics files for the deadline and the event itself.
 */

function pad(
	value: number
): string {

	return String(value).padStart(2, "0");
}

/**
 * "2027-04-06T13:00:00Z" -> "20270406T130000Z"
 */
function toIcsUtc(
	value: string
): string | null {

	const date =
		new Date(value);

	if (Number.isNaN(date.getTime())) {
		return null;
	}

	return (
		`${date.getUTCFullYear()}` +
		`${pad(date.getUTCMonth() + 1)}` +
		`${pad(date.getUTCDate())}T` +
		`${pad(date.getUTCHours())}` +
		`${pad(date.getUTCMinutes())}` +
		`${pad(date.getUTCSeconds())}Z`
	);
}

/**
 * "2027-04-06" -> "20270406" for all-day entries.
 */
function toIcsDate(
	value: string
): string | null {

	const match =
		value.match(/^(\d{4})-(\d{2})-(\d{2})/);

	return match
		? `${match[1]}${match[2]}${match[3]}`
		: null;
}

/**
 * Google Calendar's event-creation URL. Times must be UTC.
 */
export function googleCalendarUrl(
	conference: DbConference
): string | null {

	if (!conference.deadline_utc) {
		return null;
	}

	const start =
		toIcsUtc(conference.deadline_utc);

	if (!start) {
		return null;
	}

	/*
	 * A deadline is a moment, but Google wants a range; one
	 * hour ending at the deadline reads correctly in a grid.
	 */
	const end =
		toIcsUtc(
			new Date(
				new Date(conference.deadline_utc).getTime() +
				60 * 60 * 1000
			).toISOString()
		)!;

	const details = [
		conference.full_name ?? conference.title,
		conference.link ? `Website: ${conference.link}` : "",
		conference.place ? `Location: ${conference.place}` : "",
		"",
		"Added by the AI Conference Deadlines bot.",
	]
		.filter(Boolean)
		.join("\n");

	const params =
		new URLSearchParams({
			action: "TEMPLATE",

			text:
				`${conference.title} ${conference.year} ` +
				`paper deadline`,

			dates: `${start}/${end}`,

			details,

			location: conference.place ?? "",
		});

	return `https://calendar.google.com/calendar/render?${params}`;
}

function escapeIcs(
	value: string
): string {

	return value
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\;")
		.replace(/,/g, "\\,")
		.replace(/\r?\n/g, "\\n");
}

/**
 * Folds a content line to the 75-octet limit in RFC 5545.
 */
function fold(
	line: string
): string {

	if (line.length <= 73) {
		return line;
	}

	const parts = [line.slice(0, 73)];

	let rest = line.slice(73);

	while (rest.length > 72) {
		parts.push(` ${rest.slice(0, 72)}`);
		rest = rest.slice(72);
	}

	if (rest) {
		parts.push(` ${rest}`);
	}

	return parts.join("\r\n");
}

function event(
	uid: string,
	stamp: string,
	summary: string,
	description: string,
	location: string,
	start: string,
	end: string,
	allDay: boolean
): string[] {

	return [
		"BEGIN:VEVENT",
		fold(`UID:${uid}`),
		`DTSTAMP:${stamp}`,

		allDay
			? `DTSTART;VALUE=DATE:${start}`
			: `DTSTART:${start}`,

		allDay
			? `DTEND;VALUE=DATE:${end}`
			: `DTEND:${end}`,

		fold(`SUMMARY:${escapeIcs(summary)}`),
		fold(`DESCRIPTION:${escapeIcs(description)}`),
		fold(`LOCATION:${escapeIcs(location)}`),
		"END:VEVENT",
	];
}

/**
 * Builds a calendar containing, for each conference, its paper
 * deadline and (when known) the conference dates.
 */
export function buildIcs(
	conferences: DbConference[],
	calendarName = "AI Conference Deadlines"
): string {

	const stamp =
		toIcsUtc(new Date().toISOString())!;

	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//ai-conference-bot//EN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		fold(`X-WR-CALNAME:${escapeIcs(calendarName)}`),
	];

	for (const conference of conferences) {

		const title =
			`${conference.title} ${conference.year}`;

		const description = [
			conference.full_name ?? "",
			conference.link ?? "",
		]
			.filter(Boolean)
			.join("\n");

		if (conference.deadline_utc) {

			const start =
				toIcsUtc(conference.deadline_utc);

			if (start) {

				const end =
					toIcsUtc(
						new Date(
							new Date(conference.deadline_utc).getTime() +
							60 * 60 * 1000
						).toISOString()
					)!;

				lines.push(
					...event(
						`deadline-${conference.id}@ai-conference-bot`,
						stamp,
						`${title} paper deadline`,
						description,
						conference.place ?? "",
						start,
						end,
						false
					)
				);
			}
		}

		if (conference.start) {

			const start =
				toIcsDate(conference.start);

			/*
			 * DTEND is exclusive for all-day events, so the day
			 * after the last day is the correct value.
			 */
			const endSource =
				conference.end ?? conference.start;

			const endDate =
				new Date(`${endSource}T00:00:00Z`);

			endDate.setUTCDate(endDate.getUTCDate() + 1);

			const end =
				toIcsDate(endDate.toISOString());

			if (start && end) {

				lines.push(
					...event(
						`event-${conference.id}@ai-conference-bot`,
						stamp,
						title,
						description,
						conference.place ?? "",
						start,
						end,
						true
					)
				);
			}
		}
	}

	lines.push("END:VCALENDAR");

	return lines.join("\r\n");
}
