import {
	Conference,
} from "../types";

import {
	normalizeVenue,
} from "../enrich";

import {
	ConferenceSource,
} from "./types";

import {
	aiDeadlines,
} from "./ai-deadlines";

import {
	wikicfp,
} from "./wikicfp";

export type {
	ConferenceSource,
} from "./types";

/**
 * Registered adapters, in priority order. When two sources
 * describe the same venue-year, the earlier one wins.
 */
export const SOURCES: ConferenceSource[] = [
	aiDeadlines,
	wikicfp,
];

export function getSource(
	name: string
): ConferenceSource | undefined {

	return SOURCES.find(
		source => source.name === name
	);
}

export interface SourceResult {
	source: string;
	fetched: number;
	error?: string;
}

export interface FetchAllResult {
	conferences: Conference[];
	results: SourceResult[];
}

/**
 * A venue-year is the identity that matters: the same event is
 * often listed under slightly different ids across sources.
 */
function identity(
	conference: Conference
): string {

	return `${normalizeVenue(conference.title)}|${conference.year}`;
}

/**
 * Fetches every requested source and merges the results.
 *
 * One failing source never fails the whole sync; the caller
 * gets a per-source report instead.
 */
export async function fetchAllSources(
	options: {
		include?: string[];
	} = {}
): Promise<FetchAllResult> {

	const selected =
		options.include
			? SOURCES.filter(
				source => options.include!.includes(source.name)
			)
			: SOURCES.filter(
				source => source.enabledByDefault
			);

	const settled =
		await Promise.allSettled(
			selected.map(source => source.fetch())
		);

	const results: SourceResult[] = [];

	const merged: Conference[] = [];

	const seenIdentity = new Set<string>();
	const seenId = new Set<string>();

	settled.forEach((outcome, index) => {

		const source =
			selected[index];

		if (outcome.status === "rejected") {

			results.push({
				source: source.name,
				fetched: 0,
				error:
					outcome.reason instanceof Error
						? outcome.reason.message
						: String(outcome.reason),
			});

			return;
		}

		results.push({
			source: source.name,
			fetched: outcome.value.length,
		});

		for (const conference of outcome.value) {

			if (!conference.id || !conference.title) {
				continue;
			}

			const key =
				identity(conference);

			if (
				seenIdentity.has(key) ||
				seenId.has(conference.id)
			) {
				continue;
			}

			seenIdentity.add(key);
			seenId.add(conference.id);

			merged.push(conference);
		}
	});

	return {
		conferences: merged,
		results,
	};
}
