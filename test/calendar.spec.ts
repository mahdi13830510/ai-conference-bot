import { describe, it, expect } from "vitest";

import {
	buildIcs,
	googleCalendarUrl,
} from "../src/calendar";

import type { DbConference } from "../src/types";

function conference(
	overrides: Partial<DbConference> = {}
): DbConference {

	return {
		id: "icml27",
		title: "ICML",
		year: 2027,
		full_name: "International Conference on Machine Learning",
		link: "https://icml.cc",
		deadline: "2027-01-28 23:59:59",
		abstract_deadline: null,
		deadline_utc: "2027-01-29T07:59:59.000Z",
		abstract_deadline_utc: null,
		timezone: "America/Los_Angeles",
		place: "Seoul, South Korea",
		date: "July 11-17, 2027",
		start: "2027-07-11",
		end: "2027-07-17",
		topics: '["ML"]',
		note: null,
		hindex: null,
		paperslink: null,
		pwclink: null,
		core_rank: "A*",
		core_name: null,
		format: "in-person",
		country: "South Korea",
		city: "Seoul",
		cfp_link: null,
		source: "ai-deadlines",
		previous_deadline_utc: null,
		deadline_changed_at: null,
		first_seen_at: "2026-01-01T00:00:00.000Z",
		updated_at: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

describe("googleCalendarUrl", () => {

	it("builds a template link with UTC times", () => {

		const url =
			googleCalendarUrl(conference())!;

		expect(url).toContain("calendar.google.com");
		expect(url).toContain("action=TEMPLATE");
		expect(url).toContain("20270129T075959Z%2F20270129T085959Z");
		expect(url).toContain("ICML+2027+paper+deadline");
	});

	it("returns null without a deadline", () => {
		expect(
			googleCalendarUrl(conference({ deadline_utc: null }))
		).toBeNull();
	});
});

describe("buildIcs", () => {

	const ics =
		buildIcs([conference()]);

	it("produces a well-formed calendar", () => {
		expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
		expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
		expect(ics).toContain("VERSION:2.0");
	});

	it("uses CRLF line endings as the spec requires", () => {
		expect(ics.includes("\r\n")).toBe(true);
	});

	it("emits both the deadline and the event", () => {

		const events =
			ics.match(/BEGIN:VEVENT/g) ?? [];

		expect(events).toHaveLength(2);
		expect(ics).toContain("DTSTART:20270129T075959Z");
		expect(ics).toContain("DTSTART;VALUE=DATE:20270711");
	});

	it("makes the all-day end date exclusive", () => {
		/* Conference runs 11–17 July, so DTEND is the 18th. */
		expect(ics).toContain("DTEND;VALUE=DATE:20270718");
	});

	it("escapes commas in text fields", () => {
		expect(ics).toContain("Seoul\\, South Korea");
	});

	it("skips a conference with no dates at all", () => {

		const empty =
			buildIcs([
				conference({ deadline_utc: null, start: null }),
			]);

		expect(empty).not.toContain("BEGIN:VEVENT");
	});
});
