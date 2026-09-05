import { describe, it, expect, vi, afterEach } from "vitest";

import {
	formatDate,
	remaining,
	deadlineBadge,
	chunkMessage,
	escapeHtml,
} from "../src/format";

afterEach(() => {
	vi.useRealTimers();
});

function at(
	iso: string
): void {

	vi.useFakeTimers();
	vi.setSystemTime(new Date(iso));
}

describe("escapeHtml", () => {

	it("escapes the characters Telegram's HTML mode reserves", () => {
		expect(escapeHtml('<b>A & B</b>'))
			.toBe("&lt;b&gt;A &amp; B&lt;/b&gt;");
	});
});

describe("formatDate", () => {

	it("renders in the requested timezone", () => {

		/* 07:59 UTC is already the next day in Seoul. */
		expect(formatDate("2027-01-29T07:59:59Z", "UTC"))
			.toBe("29 Jan 2027");

		expect(formatDate("2027-01-29T23:30:00Z", "Asia/Seoul"))
			.toBe("30 Jan 2027");
	});

	it("says TBA for a missing value", () => {
		expect(formatDate(null)).toBe("TBA");
	});

	it("falls back to UTC for an invalid timezone", () => {
		expect(formatDate("2027-01-29T07:59:59Z", "Not/AZone"))
			.toBe("29 Jan 2027");
	});

	it("returns the raw value when unparseable", () => {
		expect(formatDate("not a date")).toBe("not a date");
	});
});

describe("remaining", () => {

	it("counts whole days ahead", () => {
		at("2027-01-01T00:00:00Z");
		expect(remaining("2027-01-11T00:00:00Z")).toBe("10 days left");
	});

	it("switches to hours inside a day", () => {
		at("2027-01-01T00:00:00Z");
		expect(remaining("2027-01-01T06:00:00Z")).toBe("6h left");
	});

	it("switches to minutes inside an hour", () => {
		at("2027-01-01T00:00:00Z");
		expect(remaining("2027-01-01T00:30:00Z")).toBe("30 min left");
	});

	it("reports an elapsed deadline as expired", () => {
		at("2027-01-02T00:00:00Z");
		expect(remaining("2027-01-01T00:00:00Z")).toBe("expired");
	});

	it("is empty without a deadline", () => {
		expect(remaining(null)).toBe("");
	});
});

describe("deadlineBadge", () => {

	it("escalates as the deadline approaches", () => {
		at("2027-01-01T00:00:00Z");

		expect(deadlineBadge("2027-01-04T00:00:00Z")).toBe("🔴");
		expect(deadlineBadge("2027-01-20T00:00:00Z")).toBe("🟠");
		expect(deadlineBadge("2027-02-20T00:00:00Z")).toBe("🟡");
		expect(deadlineBadge("2027-09-01T00:00:00Z")).toBe("🟢");
		expect(deadlineBadge("2026-12-01T00:00:00Z")).toBe("⚫");
		expect(deadlineBadge(null)).toBe("⚪");
	});
});

describe("chunkMessage", () => {

	it("leaves a short message alone", () => {
		expect(chunkMessage("hello")).toEqual(["hello"]);
	});

	it("splits on paragraph boundaries", () => {

		const text =
			["a".repeat(60), "b".repeat(60), "c".repeat(60)]
				.join("\n\n");

		const chunks =
			chunkMessage(text, 130);

		expect(chunks.length).toBeGreaterThan(1);

		chunks.forEach(chunk => {
			expect(chunk.length).toBeLessThanOrEqual(130);
		});
	});

	it("hard-splits a single oversized paragraph", () => {

		const chunks =
			chunkMessage("x".repeat(250), 100);

		expect(chunks).toHaveLength(3);
		expect(chunks.join("")).toBe("x".repeat(250));
	});

	it("never loses content", () => {

		const text =
			Array.from({ length: 40 }, (_, i) => `para ${i} ${"y".repeat(30)}`)
				.join("\n\n");

		expect(chunkMessage(text, 200).join("\n\n")).toBe(text);
	});
});
