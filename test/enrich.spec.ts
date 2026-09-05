import { describe, it, expect } from "vitest";

import {
	detectFormat,
	parsePlace,
	lookupCoreRank,
	normalizeVenue,
} from "../src/enrich";

describe("detectFormat", () => {

	it("treats a plain city as in person", () => {
		expect(detectFormat("Vienna, Austria", null))
			.toBe("in-person");
	});

	it("detects a purely virtual event", () => {
		expect(detectFormat("Online", null)).toBe("virtual");
		expect(detectFormat("Virtual", null)).toBe("virtual");
	});

	it("treats a venue plus an online option as hybrid", () => {
		expect(detectFormat("Seattle, USA; and virtual", null))
			.toBe("hybrid");
	});

	it("honours an explicit hybrid marker in the note", () => {
		expect(detectFormat("Tokyo, Japan", "This is a hybrid event"))
			.toBe("hybrid");
	});

	it("reports TBA for unknown placeholders", () => {
		expect(detectFormat("TBA", null)).toBe("tba");
		expect(detectFormat("", null)).toBe("tba");
		expect(detectFormat(null, null)).toBe("tba");
	});
});

describe("parsePlace", () => {

	it("reads a trailing country", () => {
		expect(parsePlace("Vienna, Austria"))
			.toEqual({ city: "Vienna", country: "Austria" });
	});

	it("normalises country spellings", () => {
		expect(parsePlace("Seattle, United States").country).toBe("USA");
		expect(parsePlace("Amsterdam, the Netherlands").country)
			.toBe("Netherlands");
		expect(parsePlace("Seoul, Republic of Korea").country)
			.toBe("South Korea");
		expect(parsePlace("Rio, BRAZIL").country).toBe("Brazil");
		expect(parsePlace("Edinburgh, Scotland").country).toBe("UK");
	});

	it("reads a country nested in parentheses", () => {
		expect(parsePlace("Vilnius (Lithuania)").country)
			.toBe("Lithuania");
	});

	it("reads a country written inline", () => {
		expect(parsePlace("Baltimore, Maryland USA").country)
			.toBe("USA");
	});

	it("ignores a trailing virtual qualifier", () => {
		expect(parsePlace("Seattle, USA; and virtual").country)
			.toBe("USA");
	});

	it("falls back to a known city", () => {
		expect(parsePlace("Prague").country).toBe("Czech Republic");
	});

	it("returns nothing for a placeholder", () => {
		expect(parsePlace("TBA"))
			.toEqual({ city: null, country: null });
	});

	it("keeps the city but no country when unknown", () => {
		const parsed = parsePlace("Atlantis, Nowhereland");
		expect(parsed.city).toBe("Atlantis");
		expect(parsed.country).toBeNull();
	});
});

describe("normalizeVenue", () => {

	it("strips track suffixes", () => {
		expect(normalizeVenue("NeurIPS [Dataset and Benchmarks Track]"))
			.toBe("NEURIPS");

		expect(normalizeVenue("SIGMOD-2")).toBe("SIGMOD");
	});
});

describe("lookupCoreRank", () => {

	it("finds a top venue", () => {
		expect(lookupCoreRank("ICML")?.rank).toBe("A*");
		expect(lookupCoreRank("NeurIPS")?.rank).toBe("A*");
	});

	it("resolves a track back to its parent venue", () => {
		expect(lookupCoreRank("NeurIPS [Datasets]")?.rank).toBe("A*");
	});

	it("returns null for an unranked venue", () => {
		expect(lookupCoreRank("NotARealConference")).toBeNull();
	});
});
