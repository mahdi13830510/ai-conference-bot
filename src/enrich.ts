import {
	ConferenceFormat,
} from "./types";

import coreRanks from "../data/core-ranks.json";

/**
 * Derives the structured fields that the raw feed does not
 * provide: presentation format, country/city, and the CORE
 * ranking for the venue.
 */

/* =========================================================
	 FORMAT
	 ========================================================= */

const VIRTUAL_PATTERN =
	/\b(online|virtual|remote)\b/i;

const HYBRID_PATTERN =
	/\bhybrid\b/i;

const UNKNOWN_PLACE_PATTERN =
	/^\s*(tba|tbd|tbu|to be (announced|determined)|n\/?a|-|)\s*$/i;

export function detectFormat(
	place: string | null | undefined,
	note: string | null | undefined
): ConferenceFormat {

	const haystack =
		`${place ?? ""} ${note ?? ""}`;

	if (HYBRID_PATTERN.test(haystack)) {
		return "hybrid";
	}

	/*
	 * "Seattle, USA; and virtual" is hybrid in practice: a
	 * physical venue plus an online option.
	 */
	if (VIRTUAL_PATTERN.test(haystack)) {

		const withoutVirtual =
			(place ?? "")
				.replace(VIRTUAL_PATTERN, "")
				.replace(/[;,]+/g, " ")
				.trim();

		return withoutVirtual.length > 2
			? "hybrid"
			: "virtual";
	}

	if (UNKNOWN_PLACE_PATTERN.test(place ?? "")) {
		return "tba";
	}

	return place
		? "in-person"
		: "tba";
}

/* =========================================================
	 GEOGRAPHY
	 ========================================================= */

/**
 * Feed spellings that do not match the country_info table.
 */
const COUNTRY_ALIASES: Record<string, string> = {
	"UNITED STATES": "USA",
	"UNITED STATES OF AMERICA": "USA",
	"U.S.A.": "USA",
	"US": "USA",
	"AMERICA": "USA",
	"UNITED KINGDOM": "UK",
	"GREAT BRITAIN": "UK",
	"ENGLAND": "UK",
	"SCOTLAND": "UK",
	"WALES": "UK",
	"NORTHERN IRELAND": "UK",
	"THE NETHERLANDS": "Netherlands",
	"HOLLAND": "Netherlands",
	"KOREA": "South Korea",
	"REPUBLIC OF KOREA": "South Korea",
	"S. KOREA": "South Korea",
	"CZECHIA": "Czech Republic",
	"CZECH": "Czech Republic",
	"UAE": "UAE",
	"UNITED ARAB EMIRATES": "UAE",
	"HONG KONG S.A.R.": "Hong Kong",
	"S.A.R.": "Hong Kong",
	"VIET NAM": "Vietnam",
	"TURKIYE": "Turkey",
	"TÜRKIYE": "Turkey",
};

/**
 * Cities and regions that appear without their country.
 */
const PLACE_TO_COUNTRY: Record<string, string> = {
	"ARIZONA": "USA",
	"HAWAII": "USA",
	"HAWAI'I": "USA",
	"SEATTLE": "USA",
	"MARYLAND": "USA",
	"CALIFORNIA": "USA",
	"NEW YORK": "USA",
	"TEXAS": "USA",
	"PRAGUE": "Czech Republic",
	"MALLORCA": "Spain",
	"BASQUE COUNTRY": "Spain",
	"VILNIUS": "Lithuania",
	"BARCELONA": "Spain",
	"VIENNA": "Austria",
	"PARIS": "France",
	"BERLIN": "Germany",
	"TOKYO": "Japan",
	"SEOUL": "South Korea",
	"SYDNEY": "Australia",
	"TORONTO": "Canada",
	"VANCOUVER": "Canada",
	"MONTREAL": "Canada",
};

const KNOWN_COUNTRIES = new Set([
	"USA", "Canada", "UK", "Ireland", "Italy", "Spain", "France",
	"Germany", "Austria", "Netherlands", "Greece", "Portugal",
	"Czech Republic", "Hungary", "Malta", "Denmark", "Norway",
	"Sweden", "Finland", "Switzerland", "Belgium", "Poland",
	"Lithuania", "Croatia", "Cyprus", "Romania", "Turkey",
	"Japan", "China", "South Korea", "Singapore", "India",
	"Australia", "New Zealand", "Brazil", "Mexico", "UAE",
	"Israel", "Taiwan", "Hong Kong", "Thailand", "Vietnam",
	"Indonesia", "Malaysia", "Morocco", "Rwanda", "Ukraine",
]);

function clean(
	value: string
): string {

	return value
		.replace(/[()]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function canonicalCountry(
	candidate: string
): string | null {

	const trimmed =
		clean(candidate);

	if (!trimmed) {
		return null;
	}

	const alias =
		COUNTRY_ALIASES[trimmed.toUpperCase()];

	if (alias) {
		return alias;
	}

	/*
	 * Match the canonical list case-insensitively so that
	 * "BRAZIL" and "Brazil" collapse to one country.
	 */
	for (const country of KNOWN_COUNTRIES) {

		if (country.toLowerCase() === trimmed.toLowerCase()) {
			return country;
		}
	}

	return null;
}

export interface ParsedPlace {
	city: string | null;
	country: string | null;
}

export function parsePlace(
	place: string | null | undefined
): ParsedPlace {

	if (!place || UNKNOWN_PLACE_PATTERN.test(place)) {
		return { city: null, country: null };
	}

	/*
	 * Drop trailing qualifiers such as "; and virtual".
	 */
	const primary =
		place
			.split(/;/)[0]
			.trim();

	const parts =
		primary
			.split(",")
			.map(part => clean(part))
			.filter(Boolean);

	if (!parts.length) {
		return { city: null, country: null };
	}

	/*
	 * Scan from the right: the country is normally last, but
	 * "Vilnius (Lithuania)" and "Maryland USA" put it inline.
	 */
	for (let index = parts.length - 1; index >= 0; index -= 1) {

		const direct =
			canonicalCountry(parts[index]);

		if (direct) {

			return {
				city: index > 0 ? parts[0] : null,
				country: direct,
			};
		}

		/*
		 * Try each word group inside the segment.
		 */
		const words =
			parts[index].split(/\s+/);

		for (let start = 0; start < words.length; start += 1) {

			for (let end = words.length; end > start; end -= 1) {

				const phrase =
					words.slice(start, end).join(" ");

				const nested =
					canonicalCountry(phrase);

				if (nested) {

					return {
						city:
							index > 0
								? parts[0]
								: words.slice(0, start).join(" ") || null,
						country: nested,
					};
				}
			}
		}
	}

	/*
	 * No country token: fall back to a known city or region.
	 */
	for (const part of parts) {

		const inferred =
			PLACE_TO_COUNTRY[part.toUpperCase()];

		if (inferred) {
			return { city: parts[0], country: inferred };
		}
	}

	return {
		city: parts[0] ?? null,
		country: null,
	};
}

/* =========================================================
	 CORE RANKINGS
	 ========================================================= */

interface CoreRankEntry {
	rank: string;
	name: string;
	for_code: string;
}

const RANKS =
	(coreRanks as {
		ranks: Record<string, CoreRankEntry>;
	}).ranks;

export const CORE_SOURCE =
	(coreRanks as { source: string }).source;

/**
 * Track suffixes such as "NeurIPS [Datasets]" and "SIGMOD-2"
 * inherit the parent venue's rank.
 */
export function normalizeVenue(
	title: string
): string {

	return title
		.replace(/\s*[[(].*$/, "")
		.replace(/-\d+$/, "")
		.trim()
		.toUpperCase();
}

export function lookupCoreRank(
	title: string
): CoreRankEntry | null {

	return RANKS[normalizeVenue(title)] ?? null;
}

export const RANK_ORDER: Record<string, number> = {
	"A*": 0,
	"A": 1,
	"B": 2,
	"C": 3,
};

export function rankBadge(
	rank: string | null
): string {

	if (!rank) {
		return "";
	}

	return rank === "A*"
		? "🏅 A*"
		: `🎖 ${rank}`;
}
