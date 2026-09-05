/**
 * Offline ingest: scrape CORE conference rankings for every
 * acronym that appears in the ai-deadlines feed, and write
 * them to data/core-ranks.json.
 *
 * CORE rankings change roughly once a year, so this is run
 * manually rather than at request time:
 *
 *   node scripts/fetch_core_ranks.mjs
 */

import { writeFile } from "node:fs/promises";

const AI_DEADLINES_URL =
	"https://mlciv.com/ai-deadlines/api/upcoming.json";

const CORE_URL =
	"https://portal.core.edu.au/conf-ranks/";

const SOURCE =
	"CORE2023";

const VALID_RANKS =
	new Set([
		"A*",
		"A",
		"B",
		"C",
	]);

function stripTags(
	value
) {
	return value
		.replace(/<[^>]+>/g, "")
		.replace(/&amp;/g, "&")
		.replace(/&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, " ")
		.trim();
}

/**
 * Parse the result table of a CORE search page.
 */
function parseRows(
	html
) {

	const rows = [];

	const rowPattern =
		/<tr class="(?:even|odd)row"[^>]*>([\s\S]*?)<\/tr>/g;

	let match;

	while ((match = rowPattern.exec(html)) !== null) {

		const cells =
			[...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
				.map(cell => stripTags(cell[1]));

		if (cells.length < 4) {
			continue;
		}

		rows.push({
			name: cells[0],
			acronym: cells[1],
			source: cells[2],
			rank: cells[3],
			forCode: cells[6] ?? "",
		});
	}

	return rows;
}

/**
 * ai-deadlines uses a few acronyms that do not match CORE's
 * spelling, plus track suffixes CORE does not model.
 */
const ALIASES = {
	"MM": "ACMMM",
	"MLSYS": "MLSys",
	"RSS": "Robotics: Science and Systems",
	"SIGGRAPH ASIA": "SIGGRAPH",
	"COLM": "",
	"CORL": "CoRL",
};

/**
 * Strip track suffixes: "NeurIPS [Datasets]" and "SIGMOD-1"
 * are both the parent venue as far as CORE is concerned.
 */
function normalizeAcronym(
	acronym
) {

	const base =
		acronym
			.replace(/\s*[\[(].*$/, "")
			.replace(/-\d+$/, "")
			.trim();

	const alias =
		ALIASES[base.toUpperCase()];

	return alias === undefined
		? base
		: alias;
}

async function search(
	term,
	by
) {

	const url =
		`${CORE_URL}?search=${encodeURIComponent(term)}` +
		`&by=${by}&source=${SOURCE}&sort=arank&page=1`;

	const response =
		await fetch(url, {
			headers: {
				"User-Agent":
					"ai-conference-bot/1.0 (+https://github.com)",
			},
		});

	if (!response.ok) {
		throw new Error(
			`CORE returned ${response.status} for ${term}`
		);
	}

	return parseRows(await response.text());
}

async function lookup(
	rawAcronym
) {

	const acronym =
		normalizeAcronym(rawAcronym);

	if (!acronym) {
		return null;
	}

	/*
	 * Only accept an exact acronym match with a real rank.
	 * CORE's search is fuzzy and will happily return
	 * unrelated venues.
	 */
	const exact = rows =>
		rows.find(
			row =>
				row.acronym.toUpperCase() === acronym.toUpperCase() &&
				VALID_RANKS.has(row.rank.toUpperCase())
		) ?? null;

	const byAcronym =
		exact(await search(acronym, "acronym"));

	if (byAcronym) {
		return byAcronym;
	}

	/*
	 * Some venues are only indexed under their full name.
	 */
	await new Promise(resolve => setTimeout(resolve, 250));

	return exact(await search(acronym, "all"));
}

const source =
	await (await fetch(AI_DEADLINES_URL)).json();

const acronyms =
	[...new Set(
		source
			.map(conference => String(conference.title || "").trim())
			.filter(Boolean)
	)].sort();

console.log(
	`Looking up ${acronyms.length} acronyms on ${SOURCE}...`
);

const ranks = {};

let found = 0;

for (const acronym of acronyms) {

	try {

		const row =
			await lookup(acronym);

		if (row) {

			found += 1;

			ranks[acronym.toUpperCase()] = {
				rank: row.rank.toUpperCase(),
				name: row.name,
				for_code: row.forCode,
			};

			console.log(`  ${acronym} -> ${row.rank}`);

		} else {
			console.log(`  ${acronym} -> (no match)`);
		}

	} catch (error) {
		console.error(`  ${acronym} failed: ${error.message}`);
	}

	/*
	 * Be polite to a public portal.
	 */
	await new Promise(resolve => setTimeout(resolve, 250));
}

await writeFile(
	"data/core-ranks.json",
	JSON.stringify(
		{
			source: SOURCE,
			generated_at: new Date().toISOString(),
			ranks,
		},
		null,
		"\t"
	) + "\n"
);

console.log(
	`\nWrote data/core-ranks.json (${found}/${acronyms.length} ranked).`
);
