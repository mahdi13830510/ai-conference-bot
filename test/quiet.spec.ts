import { describe, it, expect } from "vitest";

import {
	isQuiet,
	localHour,
	localWeekday,
	localDate,
} from "../src/quiet";

/* 2026-09-06T23:30:00Z is a Sunday evening in UTC. */
const NIGHT = new Date("2026-09-06T23:30:00Z");

/* 2026-09-07T12:00:00Z is a Monday midday in UTC. */
const NOON = new Date("2026-09-07T12:00:00Z");

describe("localHour", () => {

	it("converts into the target timezone", () => {
		expect(localHour("UTC", NOON)).toBe(12);
		expect(localHour("Europe/Amsterdam", NOON)).toBe(14);
		expect(localHour("America/Los_Angeles", NOON)).toBe(5);
	});

	it("falls back to UTC for an invalid timezone", () => {
		expect(localHour("Not/AZone", NOON)).toBe(12);
	});
});

describe("localWeekday", () => {

	it("uses the local day, not the UTC one", () => {
		/* Still Sunday in UTC, already Monday in Tokyo. */
		expect(localWeekday("UTC", NIGHT)).toBe(0);
		expect(localWeekday("Asia/Tokyo", NIGHT)).toBe(1);
	});
});

describe("localDate", () => {

	it("uses the local calendar date", () => {
		expect(localDate("UTC", NIGHT)).toBe("2026-09-06");
		expect(localDate("Asia/Tokyo", NIGHT)).toBe("2026-09-07");
	});
});

describe("isQuiet", () => {

	it("is off when unset", () => {
		expect(isQuiet("UTC", null, null, NIGHT)).toBe(false);
	});

	it("handles a window that wraps past midnight", () => {
		/* 22:00–08:00, and it is 23:30 UTC. */
		expect(isQuiet("UTC", 22, 8, NIGHT)).toBe(true);
		expect(isQuiet("UTC", 22, 8, NOON)).toBe(false);
	});

	it("handles a same-day window", () => {
		expect(isQuiet("UTC", 9, 17, NOON)).toBe(true);
		expect(isQuiet("UTC", 9, 17, NIGHT)).toBe(false);
	});

	it("evaluates the window in the user's timezone", () => {
		/* 23:30 UTC is 08:30 in Tokyo, outside a 22–08 window. */
		expect(isQuiet("Asia/Tokyo", 22, 8, NIGHT)).toBe(false);
	});

	it("treats an empty window as off", () => {
		expect(isQuiet("UTC", 5, 5, NOON)).toBe(false);
	});
});
