/**
 * Offline ingest: build data/acceptance-rates.json from the
 * community-maintained acceptance-rate tables at
 * https://github.com/lixin4ever/Conference-Acceptance-Rate
 *
 * Historical rates change only once a year per venue, so this
 * runs manually rather than at request time:
 *
 *   node scripts/fetch_acceptance_rates.mjs
 */

import { writeFile } from "node:fs/promises";

const SOURCE_URL =
	"https://raw.githubusercontent.com/lixin4ever/" +
	"Conference-Acceptance-Rate/master/README.md";

const ATTRIBUTION =
	"github.com/lixin4ever/Conference-Acceptance-Rate";

/**
 * "|ACL'23 | 23.5% (910/3872) | 16.5% (164/992) |"
 */
const ROW =
	/^\|\s*([A-Za-z][A-Za-z0-9\-\s]*?)'(\d{2})([^|]*?)\|([^|]*)\|/;

function parseCount(
	value
) {

	const cleaned =
		value.replace(/[,~\s]/g, "");

	const number =
		Number(cleaned);

	return Number.isFinite(number) && number > 0
		? number
		: null;
}

function parseCell(
	cell
) {

	const rate =
		cell.match(/(\d+(?:\.\d+)?)\s*%/);

	if (!rate) {
		return null;
	}

	const counts =
		cell.match(/\(\s*(~?[\d,]+)\s*\/\s*(~?[\d,?]+)\s*\)/);

	return {
		rate: Number(rate[1]),

		accepted: counts
			? parseCount(counts[1])
			: null,

		submitted: counts
			? parseCount(counts[2])
			: null,
	};
}

const markdown =
	await (await fetch(SOURCE_URL)).text();

const venues = {};

let skipped = 0;

for (const line of markdown.split("\n")) {

	const match =
		line.match(ROW);

	if (!match) {
		continue;
	}

	const [, rawVenue, shortYear, suffix, longCell] = match;

	/*
	 * "ACL'21 Findings" and similar secondary tracks are
	 * reported separately upstream; keep the main track only.
	 */
	if (suffix.trim()) {
		skipped += 1;
		continue;
	}

	const parsed =
		parseCell(longCell);

	if (!parsed) {
		skipped += 1;
		continue;
	}

	const venue =
		rawVenue
			.trim()
			.toUpperCase()
			.replace(/^NAACL-HLT$/, "NAACL")
			.replace(/^THEWEBCONF$/, "WWW");

	const year =
		2000 + Number(shortYear);

	venues[venue] ??= {};

	venues[venue][year] = parsed;
}

const total =
	Object.values(venues)
		.reduce(
			(sum, years) => sum + Object.keys(years).length,
			0
		);

await writeFile(
	"data/acceptance-rates.json",
	JSON.stringify(
		{
			attribution: ATTRIBUTION,
			source_url: SOURCE_URL,
			generated_at: new Date().toISOString(),
			venues,
		},
		null,
		"\t"
	) + "\n"
);

console.log(
	`Wrote data/acceptance-rates.json: ` +
	`${Object.keys(venues).length} venues, ` +
	`${total} venue-years (${skipped} rows skipped).`
);
