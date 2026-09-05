/**
 * Regenerates migrations/0004_acceptance_rates.sql from
 * data/acceptance-rates.json.
 *
 *   node scripts/fetch_acceptance_rates.mjs
 *   node scripts/generate_seed.mjs
 */

import { readFile, writeFile } from "node:fs/promises";

const data =
	JSON.parse(
		await readFile("data/acceptance-rates.json", "utf8")
	);

function sqlNumber(
	value
) {
	return value === null || value === undefined
		? "NULL"
		: String(value);
}

const rows = [];

for (const venue of Object.keys(data.venues).sort()) {

	const years =
		data.venues[venue];

	for (const year of Object.keys(years).sort((a, b) => a - b)) {

		const entry =
			years[year];

		rows.push(
			`    ('${venue.replace(/'/g, "''")}', ${Number(year)}, ` +
			`${sqlNumber(entry.rate)}, ` +
			`${sqlNumber(entry.accepted)}, ` +
			`${sqlNumber(entry.submitted)})`
		);
	}
}

const sql =
	`/*
 * Historical acceptance rates.
 *
 * Source: ${data.source_url}
 * Regenerate with: node scripts/fetch_acceptance_rates.mjs
 *                  node scripts/generate_seed.mjs
 */

INSERT OR REPLACE INTO acceptance_rates (venue, year, rate, accepted, submitted)
VALUES
${rows.join(",\n")};
`;

await writeFile(
	"migrations/0004_acceptance_rates.sql",
	sql
);

console.log(
	`Wrote migrations/0004_acceptance_rates.sql (${rows.length} rows).`
);
