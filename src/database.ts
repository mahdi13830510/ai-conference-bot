import {
	Conference,
	DbConference,
	Env,
	Reminder,
	ReminderKind,
	ReminderWithConference,
	SavedSearch,
	AcceptanceRate,
	CountryInfo,
	VenueHistoryRow,
	SortPreference,
	PendingInputKind,
	User,
} from "./types";

import {
	deadlineToUtc,
	toDbConference,
} from "./conferences";

import {
	normalizeVenue,
	RANK_ORDER,
} from "./enrich";

import {
	CALLBACK_TOKEN_TTL_HOURS,
	PROCESSED_UPDATE_TTL_HOURS,
	FUZZY_MIN_LENGTH,
} from "./config";

/* =========================================================
	 USERS
	 ========================================================= */

export async function upsertUser(
	env: Env,
	telegramId: string,
	username?: string,
	firstName?: string
): Promise<void> {

	await env.DB
		.prepare(`
      INSERT INTO users (
        telegram_id,
        username,
        first_name
      )
      VALUES (?, ?, ?)

      ON CONFLICT(telegram_id)
      DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name
    `)
		.bind(
			telegramId,
			username ?? null,
			firstName ?? null
		)
		.run();
}

export async function getUser(
	env: Env,
	telegramId: string
): Promise<User | null> {

	return env.DB
		.prepare(`
      SELECT *
      FROM users
      WHERE telegram_id = ?
      LIMIT 1
    `)
		.bind(telegramId)
		.first<User>();
}

/* =========================================================
	 CONFERENCES
	 ========================================================= */

export async function getConference(
	env: Env,
	id: string
): Promise<DbConference | null> {

	return env.DB
		.prepare(`
      SELECT *
      FROM conferences
      WHERE id = ?
      LIMIT 1
    `)
		.bind(id)
		.first<DbConference>();
}

export async function countConferences(
	env: Env,
	where = "1 = 1",
	params: unknown[] = []
): Promise<number> {

	const row =
		await env.DB
			.prepare(`
        SELECT COUNT(*) AS count
        FROM conferences
        WHERE ${where}
      `)
			.bind(...params)
			.first<{ count: number }>();

	return Number(
		row?.count ?? 0
	);
}

export async function listConferences(
	env: Env,
	options: {
		page: number;
		pageSize: number;

		where?: string;
		params?: unknown[];

		orderBy?: string;
	}
): Promise<DbConference[]> {

	/*
	 * Upper bound guards the query, but has to be high enough
	 * for a calendar export to pull a whole list at once.
	 */
	const pageSize =
		Math.min(
			Math.max(options.pageSize, 1),
			200
		);

	const page =
		Math.max(
			options.page,
			1
		);

	const offset =
		(page - 1) *
		pageSize;

	const where =
		options.where ||
		"deadline_utc IS NOT NULL AND deadline_utc > datetime('now')";

	const orderBy =
		options.orderBy ||
		"deadline_utc ASC";

	const result =
		await env.DB
			.prepare(`
        SELECT *
        FROM conferences
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ?
        OFFSET ?
      `)
			.bind(
				...(options.params ?? []),
				pageSize,
				offset
			)
			.all<DbConference>();

	return result.results;
}

/**
 * Turns free text into an FTS5 MATCH expression.
 *
 * Every token is quoted so that FTS operators typed by a user
 * ("AND", "*", quotes) cannot break the query, and the final
 * token gets a prefix wildcard so search feels incremental.
 */
function toMatchQuery(
	query: string
): string | null {

	const tokens =
		query
			.toLowerCase()
			.replace(/["*(){}:^~\-]/g, " ")
			.split(/\s+/)
			.filter(token => token.length > 0)
			.slice(0, 8);

	if (!tokens.length) {
		return null;
	}

	return tokens
		.map((token, index) =>
			index === tokens.length - 1
				? `"${token}"*`
				: `"${token}"`
		)
		.join(" AND ");
}

/**
 * Levenshtein distance, capped so that a long pair of strings
 * bails out as soon as it cannot beat the threshold.
 */
function editDistance(
	a: string,
	b: string,
	max: number
): number {

	if (Math.abs(a.length - b.length) > max) {
		return max + 1;
	}

	let previous =
		Array.from(
			{ length: b.length + 1 },
			(_, index) => index
		);

	for (let i = 1; i <= a.length; i += 1) {

		const current = [i];

		let best = i;

		for (let j = 1; j <= b.length; j += 1) {

			const cost =
				a[i - 1] === b[j - 1]
					? 0
					: 1;

			const value =
				Math.min(
					previous[j] + 1,
					current[j - 1] + 1,
					previous[j - 1] + cost
				);

			current.push(value);

			best = Math.min(best, value);
		}

		if (best > max) {
			return max + 1;
		}

		previous = current;
	}

	return previous[b.length];
}

/**
 * Typo-tolerant fallback used when FTS finds nothing.
 *
 * The conference table holds a few hundred future rows, so
 * scoring them in the Worker is cheaper and far more accurate
 * than any SQL approximation.
 */
async function fuzzySearch(
	env: Env,
	query: string
): Promise<string[]> {

	const needle =
		query.toLowerCase().trim();

	if (needle.length < FUZZY_MIN_LENGTH) {
		return [];
	}

	const candidates =
		await env.DB
			.prepare(`
        SELECT id, title, full_name
        FROM conferences
        WHERE deadline_utc IS NOT NULL
          AND deadline_utc > datetime('now')
      `)
			.all<{
				id: string;
				title: string;
				full_name: string | null;
			}>();

	const threshold =
		needle.length <= 5
			? 1
			: needle.length <= 9
				? 2
				: 3;

	const scored: { id: string; score: number }[] = [];

	for (const row of candidates.results) {

		const haystacks = [
			row.title.toLowerCase(),
			...(row.full_name
				? row.full_name.toLowerCase().split(/\s+/)
				: []),
		];

		let best = threshold + 1;

		for (const haystack of haystacks) {

			if (haystack.includes(needle)) {
				best = 0;
				break;
			}

			best = Math.min(
				best,
				editDistance(needle, haystack, threshold)
			);
		}

		if (best <= threshold) {
			scored.push({ id: row.id, score: best });
		}
	}

	return scored
		.sort((a, b) => a.score - b.score)
		.slice(0, 60)
		.map(entry => entry.id);
}

export async function searchConferences(
	env: Env,
	query: string,
	page: number,
	pageSize: number,
	orderBy?: string,
	extra?: {
		where: string;
		params: unknown[];
	}
): Promise<{
	rows: DbConference[];
	total: number;
	fuzzy: boolean;
}> {

	const clean =
		query.trim().slice(0, 80);

	const match =
		toMatchQuery(clean);

	let ids: string[] = [];

	let fuzzy = false;

	if (match) {

		try {

			const hits =
				await env.DB
					.prepare(`
            SELECT f.id AS id
            FROM conferences_fts f
            INNER JOIN conferences c ON c.id = f.id
            WHERE conferences_fts MATCH ?
              AND c.deadline_utc IS NOT NULL
              AND c.deadline_utc > datetime('now')
            ORDER BY bm25(conferences_fts, 0.0, 10.0, 5.0, 3.0, 2.0, 3.0)
            LIMIT 200
          `)
					.bind(match)
					.all<{ id: string }>();

			ids = hits.results.map(row => row.id);

		} catch (error) {

			/*
			 * A malformed MATCH should degrade, not 500.
			 */
			console.warn("FTS query failed:", error);
		}
	}

	if (!ids.length) {

		ids = await fuzzySearch(env, clean);

		fuzzy = ids.length > 0;
	}

	if (!ids.length) {
		return { rows: [], total: 0, fuzzy: false };
	}

	const placeholders =
		ids.map(() => "?").join(", ");

	/*
	 * Filters stay in force while searching, so the chips in the
	 * UI keep meaning what they say.
	 */
	const where =
		`id IN (${placeholders})` +
		(extra ? ` AND ${extra.where}` : "");

	const params = [
		...ids,
		...(extra?.params ?? []),
	];

	const total =
		await countConferences(env, where, params);

	const rows =
		await listConferences(
			env,
			{
				page,
				pageSize,
				where,
				params,
				orderBy,
			}
		);

	return { rows, total, fuzzy };
}

/* =========================================================
	 SYNC
	 ========================================================= */

export interface DeadlineChange {
	id: string;
	title: string;
	year: number;
	previous: string;
	current: string;
}

export async function syncConferences(
	env: Env,
	conferences: Conference[]
): Promise<{
	inserted: string[];
	updated: number;
	changed: DeadlineChange[];
}> {

	const inserted: string[] = [];

	const changed: DeadlineChange[] = [];

	let updated = 0;

	/*
	 * Read the current state once. The upstream list is small
	 * enough that a full scan beats one query per conference.
	 */
	const existing =
		await env.DB
			.prepare(`
        SELECT id, first_seen_at, deadline_utc
        FROM conferences
      `)
			.all<{
				id: string;
				first_seen_at: string;
				deadline_utc: string | null;
			}>();

	const existingMap =
		new Map(
			existing.results.map(
				row => [row.id, row]
			)
		);

	const statements: D1PreparedStatement[] = [];

	const now =
		new Date().toISOString();

	for (const conference of conferences) {

		/*
		 * Ignore entries without deadlines.
		 */
		if (!conference.deadline) {
			continue;
		}

		const previous =
			existingMap.get(conference.id);

		const dbConference =
			toDbConference(
				conference,
				previous?.first_seen_at
			);

		if (!previous) {
			inserted.push(conference.id);

		} else {
			updated += 1;
		}

		/*
		 * A moved deadline is the single most useful thing this
		 * bot can tell a user, so it is recorded on the row and
		 * reported to the caller.
		 */
		const deadlineMoved =
			previous?.deadline_utc &&
			dbConference.deadline_utc &&
			previous.deadline_utc !== dbConference.deadline_utc;

		if (deadlineMoved) {

			changed.push({
				id: dbConference.id,
				title: dbConference.title,
				year: dbConference.year,
				previous: previous!.deadline_utc!,
				current: dbConference.deadline_utc!,
			});

			dbConference.previous_deadline_utc =
				previous!.deadline_utc;

			dbConference.deadline_changed_at =
				now;
		}

		statements.push(
			env.DB
				.prepare(`
          INSERT INTO conferences (
            id, title, year, full_name, link,
            deadline, abstract_deadline,
            deadline_utc, abstract_deadline_utc,
            timezone, place, date, start, end,
            topics, note, hindex, paperslink, pwclink,
            core_rank, core_name, format, country, city,
            cfp_link, source,
            previous_deadline_utc, deadline_changed_at,
            first_seen_at, updated_at
          )
          VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          )

          ON CONFLICT(id)
          DO UPDATE SET
            title = excluded.title,
            year = excluded.year,
            full_name = excluded.full_name,
            link = excluded.link,
            deadline = excluded.deadline,
            abstract_deadline = excluded.abstract_deadline,
            deadline_utc = excluded.deadline_utc,
            abstract_deadline_utc = excluded.abstract_deadline_utc,
            timezone = excluded.timezone,
            place = excluded.place,
            date = excluded.date,
            start = excluded.start,
            end = excluded.end,
            topics = excluded.topics,
            note = excluded.note,
            hindex = excluded.hindex,
            paperslink = excluded.paperslink,
            pwclink = excluded.pwclink,
            core_rank = excluded.core_rank,
            core_name = excluded.core_name,
            format = excluded.format,
            country = excluded.country,
            city = excluded.city,
            cfp_link = excluded.cfp_link,
            source = excluded.source,
            previous_deadline_utc =
              COALESCE(
                excluded.previous_deadline_utc,
                conferences.previous_deadline_utc
              ),
            deadline_changed_at =
              COALESCE(
                excluded.deadline_changed_at,
                conferences.deadline_changed_at
              ),
            updated_at = excluded.updated_at
        `)
				.bind(
					dbConference.id,
					dbConference.title,
					dbConference.year,
					dbConference.full_name,
					dbConference.link,
					dbConference.deadline,
					dbConference.abstract_deadline,
					dbConference.deadline_utc,
					dbConference.abstract_deadline_utc,
					dbConference.timezone,
					dbConference.place,
					dbConference.date,
					dbConference.start,
					dbConference.end,
					dbConference.topics,
					dbConference.note,
					dbConference.hindex,
					dbConference.paperslink,
					dbConference.pwclink,
					dbConference.core_rank,
					dbConference.core_name,
					dbConference.format,
					dbConference.country,
					dbConference.city,
					dbConference.cfp_link,
					dbConference.source,
					dbConference.previous_deadline_utc,
					dbConference.deadline_changed_at,
					dbConference.first_seen_at,
					dbConference.updated_at
				)
		);

		/*
		 * Build the venue archive as we go, so that "past
		 * editions" works without a historical feed.
		 */
		statements.push(
			env.DB
				.prepare(`
          INSERT INTO venue_history (
            venue, year, deadline_utc, place, link
          )
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(venue, year)
          DO UPDATE SET
            deadline_utc = excluded.deadline_utc,
            place = excluded.place,
            link = excluded.link
        `)
				.bind(
					normalizeVenue(dbConference.title),
					dbConference.year,
					dbConference.deadline_utc,
					dbConference.place,
					dbConference.link
				)
		);
	}

	/*
	 * D1 supports batching. Keep batches small.
	 */
	for (let i = 0; i < statements.length; i += 50) {

		await env.DB.batch(
			statements.slice(i, i + 50)
		);
	}

	await env.DB
		.prepare(`
      UPDATE metadata
      SET value = ?
      WHERE key = 'last_sync'
    `)
		.bind(now)
		.run();

	return {
		inserted,
		updated,
		changed,
	};
}

/* =========================================================
	 SAVED CONFERENCES
	 ========================================================= */

export async function isSaved(
	env: Env,
	telegramId: string,
	conferenceId: string
): Promise<boolean> {

	const row =
		await env.DB
			.prepare(`
        SELECT 1
        FROM saved_conferences
        WHERE telegram_id = ?
          AND conference_id = ?
        LIMIT 1
      `)
			.bind(
				telegramId,
				conferenceId
			)
			.first();

	return !!row;
}

export async function saveConference(
	env: Env,
	telegramId: string,
	conferenceId: string
): Promise<void> {

	await env.DB
		.prepare(`
      INSERT OR IGNORE INTO saved_conferences (
        telegram_id,
        conference_id
      )
      VALUES (?, ?)
    `)
		.bind(
			telegramId,
			conferenceId
		)
		.run();
}

export async function unsaveConference(
	env: Env,
	telegramId: string,
	conferenceId: string
): Promise<void> {

	await env.DB
		.prepare(`
      DELETE FROM saved_conferences
      WHERE telegram_id = ?
        AND conference_id = ?
    `)
		.bind(
			telegramId,
			conferenceId
		)
		.run();
}

export async function listSaved(
	env: Env,
	telegramId: string,
	page: number,
	pageSize: number
): Promise<{
	rows: DbConference[];
	total: number;
}> {

	const count =
		await env.DB
			.prepare(`
        SELECT COUNT(*) AS count
        FROM saved_conferences
        WHERE telegram_id = ?
      `)
			.bind(telegramId)
			.first<{ count: number }>();

	const total =
		Number(
			count?.count ?? 0
		);

	const offset =
		(page - 1) * pageSize;

	const rows =
		await env.DB
			.prepare(`
        SELECT c.*
        FROM conferences c

        INNER JOIN saved_conferences s
          ON s.conference_id = c.id

        WHERE s.telegram_id = ?

        ORDER BY c.deadline_utc ASC

        LIMIT ?
        OFFSET ?
      `)
			.bind(
				telegramId,
				pageSize,
				offset
			)
			.all<DbConference>();

	return {
		rows: rows.results,
		total,
	};
}

/* =========================================================
	 REMINDERS
	 ========================================================= */

export async function createReminder(
	env: Env,
	telegramId: string,
	conferenceId: string,
	daysBefore: number,
	remindAt: string,
	kind: ReminderKind = "paper",
	auto = false
): Promise<void> {

	await env.DB
		.prepare(`
      INSERT INTO reminders (
        telegram_id,
        conference_id,
        kind,
        days_before,
        remind_at,
        sent,
        auto
      )
      VALUES (?, ?, ?, ?, ?, 0, ?)

      ON CONFLICT (
        telegram_id,
        conference_id,
        kind,
        days_before
      )
      DO UPDATE SET
        remind_at = excluded.remind_at,
        sent = 0
    `)
		.bind(
			telegramId,
			conferenceId,
			kind,
			daysBefore,
			remindAt,
			auto ? 1 : 0
		)
		.run();
}

export async function deleteReminderById(
	env: Env,
	telegramId: string,
	id: number
): Promise<boolean> {

	const result =
		await env.DB
			.prepare(`
        DELETE FROM reminders
        WHERE id = ? AND telegram_id = ?
      `)
			.bind(id, telegramId)
			.run();

	return (result.meta.changes ?? 0) > 0;
}

export async function deleteReminder(
	env: Env,
	telegramId: string,
	conferenceId: string,
	daysBefore: number
): Promise<void> {

	await env.DB
		.prepare(`
      DELETE FROM reminders

      WHERE telegram_id = ?
        AND conference_id = ?
        AND days_before = ?
    `)
		.bind(
			telegramId,
			conferenceId,
			daysBefore
		)
		.run();
}

export interface ReminderListRow extends Reminder {
	title: string;
	year: number;
	deadline: string | null;
	deadline_utc: string | null;
	abstract_deadline_utc: string | null;
	start: string | null;
}

export async function listReminders(
	env: Env,
	telegramId: string
): Promise<ReminderListRow[]> {

	const result =
		await env.DB
			.prepare(`
        SELECT
          r.*,
          c.title,
          c.year,
          c.deadline,
          c.deadline_utc,
          c.abstract_deadline_utc,
          c.start

        FROM reminders r

        INNER JOIN conferences c
          ON c.id = r.conference_id

        WHERE r.telegram_id = ?

        ORDER BY r.remind_at ASC
      `)
			.bind(telegramId)
			.all<ReminderListRow>();

	return result.results;
}

export async function getDueReminders(
	env: Env
): Promise<ReminderWithConference[]> {

	const result =
		await env.DB
			.prepare(`
        SELECT
          r.*,
          c.title,
          c.year,
          c.deadline,
          c.deadline_utc,
          c.abstract_deadline_utc,
          c.start,
          c.place,
          c.link,
          c.topics,
          u.timezone AS timezone,
          u.quiet_hours_start AS quiet_hours_start,
          u.quiet_hours_end AS quiet_hours_end

        FROM reminders r

        INNER JOIN conferences c
          ON c.id = r.conference_id

        INNER JOIN users u
          ON u.telegram_id = r.telegram_id

        LEFT JOIN muted_conferences m
          ON m.telegram_id = r.telegram_id
          AND m.conference_id = r.conference_id

        WHERE r.sent = 0
          AND r.remind_at <= datetime('now')
          AND u.blocked = 0
          AND m.conference_id IS NULL

        ORDER BY r.remind_at ASC

        LIMIT 100
      `)
			.all<ReminderWithConference>();

	return result.results;
}

export async function markReminderSent(
	env: Env,
	id: number
): Promise<void> {

	await env.DB
		.prepare(`
      UPDATE reminders
      SET sent = 1
      WHERE id = ?
    `)
		.bind(id)
		.run();
}

/* =========================================================
	 PREFERENCES
	 ========================================================= */

export async function getTopics(
	env: Env,
	telegramId: string
): Promise<string[]> {

	const result =
		await env.DB
			.prepare(`
        SELECT topic
        FROM user_topics
        WHERE telegram_id = ?
        ORDER BY topic
      `)
			.bind(telegramId)
			.all<{ topic: string }>();

	return result.results.map(
		row => row.topic
	);
}

export async function toggleTopic(
	env: Env,
	telegramId: string,
	topic: string
): Promise<boolean> {

	const existing =
		await env.DB
			.prepare(`
        SELECT 1
        FROM user_topics
        WHERE telegram_id = ?
          AND topic = ?
        LIMIT 1
      `)
			.bind(
				telegramId,
				topic
			)
			.first();

	if (existing) {

		await env.DB
			.prepare(`
        DELETE FROM user_topics
        WHERE telegram_id = ?
          AND topic = ?
      `)
			.bind(
				telegramId,
				topic
			)
			.run();

		return false;
	}

	await env.DB
		.prepare(`
      INSERT OR IGNORE INTO user_topics (
        telegram_id,
        topic
      )
      VALUES (?, ?)
    `)
		.bind(
			telegramId,
			topic
		)
		.run();

	return true;
}

export async function getLocations(
	env: Env,
	telegramId: string
): Promise<string[]> {

	const result =
		await env.DB
			.prepare(`
        SELECT location
        FROM user_locations
        WHERE telegram_id = ?
        ORDER BY location
      `)
			.bind(telegramId)
			.all<{ location: string }>();

	return result.results.map(
		row => row.location
	);
}

export async function toggleLocation(
	env: Env,
	telegramId: string,
	location: string
): Promise<boolean> {

	const existing =
		await env.DB
			.prepare(`
        SELECT 1
        FROM user_locations
        WHERE telegram_id = ?
          AND location = ?
        LIMIT 1
      `)
			.bind(
				telegramId,
				location
			)
			.first();

	if (existing) {

		await env.DB
			.prepare(`
        DELETE FROM user_locations
        WHERE telegram_id = ?
          AND location = ?
      `)
			.bind(
				telegramId,
				location
			)
			.run();

		return false;
	}

	await env.DB
		.prepare(`
      INSERT OR IGNORE INTO user_locations (
        telegram_id,
        location
      )
      VALUES (?, ?)
    `)
		.bind(
			telegramId,
			location
		)
		.run();

	return true;
}

export async function setDigest(
	env: Env,
	telegramId: string,
	enabled: boolean
): Promise<void> {

	await env.DB
		.prepare(`
      UPDATE users
      SET daily_digest_enabled = ?
      WHERE telegram_id = ?
    `)
		.bind(
			enabled ? 1 : 0,
			telegramId
		)
		.run();
}

export async function setTimezone(
	env: Env,
	telegramId: string,
	timezone: string
): Promise<void> {

	await env.DB
		.prepare(`
      UPDATE users
      SET timezone = ?
      WHERE telegram_id = ?
    `)
		.bind(
			timezone,
			telegramId
		)
		.run();
}

/* =========================================================
	 PERSONAL FEED
	 ========================================================= */

export async function getPersonalFeed(
	env: Env,
	telegramId: string,
	page: number,
	pageSize: number
) {

	const topics =
		await getTopics(
			env,
			telegramId
		);

	const locations =
		await getLocations(
			env,
			telegramId
		);

	if (
		topics.length === 0 &&
		locations.length === 0
	) {

		return {
			rows: [],
			total: 0,
		};
	}

	/*
	 * Topic matching:
	 *
	 * ["ML","CV"]
	 *
	 * becomes:
	 *
	 * topics LIKE '%"ML"%'
	 */
	const topicConditions =
		topics.map(
			() =>
				`topics LIKE ?`
		);

	const locationConditions =
		locations.map(
			() =>
				`place LIKE ? COLLATE NOCASE`
		);

	const conditions: string[] = [];

	const params: unknown[] = [];

	if (
		topicConditions.length
	) {

		conditions.push(
			`(${topicConditions.join(" OR ")})`
		);

		for (const topic of topics) {
			params.push(
				`%"${topic}"%`
			);
		}
	}

	if (
		locationConditions.length
	) {

		conditions.push(
			`(${locationConditions.join(" OR ")})`
		);

		for (const location of locations) {
			params.push(
				`%${location}%`
			);
		}
	}

	const where = `
    deadline_utc IS NOT NULL
    AND deadline_utc > datetime('now')
    AND (
      ${conditions.join(" OR ")}
    )
  `;

	const total =
		await countConferences(
			env,
			where,
			params
		);

	const rows =
		await listConferences(
			env,
			{
				page,
				pageSize,
				where,
				params,
			}
		);

	return {
		rows,
		total,
	};
}

/* =========================================================
	 METADATA
	 ========================================================= */

export async function getMetadata(
	env: Env,
	key: string
): Promise<string | null> {

	const row =
		await env.DB
			.prepare(`
        SELECT value
        FROM metadata
        WHERE key = ?
      `)
			.bind(key)
			.first<{
				value: string;
			}>();

	return row?.value ?? null;
}

export async function getStats(
	env: Env
) {

	const users =
		await env.DB
			.prepare(`
        SELECT COUNT(*) AS count
        FROM users
      `)
			.first<{ count: number }>();

	const conferences =
		await env.DB
			.prepare(`
        SELECT COUNT(*) AS count
        FROM conferences
        WHERE deadline_utc > datetime('now')
      `)
			.first<{ count: number }>();

	const saved =
		await env.DB
			.prepare(`
        SELECT COUNT(*) AS count
        FROM saved_conferences
      `)
			.first<{ count: number }>();

	const reminders =
		await env.DB
			.prepare(`
        SELECT COUNT(*) AS count
        FROM reminders
        WHERE sent = 0
      `)
			.first<{ count: number }>();

	return {
		users: Number(users?.count ?? 0),
		conferences: Number(
			conferences?.count ?? 0
		),
		saved: Number(saved?.count ?? 0),
		reminders: Number(
			reminders?.count ?? 0
		),
	};
}

/* =========================================================
	 USER PREFERENCES
	 ========================================================= */

async function updateUser(
	env: Env,
	telegramId: string,
	column: string,
	value: unknown
): Promise<void> {

	/*
	 * Column names are supplied by this module only, never by
	 * user input, so interpolating one here is safe.
	 */
	await env.DB
		.prepare(`
      UPDATE users
      SET ${column} = ?
      WHERE telegram_id = ?
    `)
		.bind(value, telegramId)
		.run();
}

export async function setDigestFrequency(
	env: Env,
	telegramId: string,
	frequency: "daily" | "weekly" | "off"
): Promise<void> {

	await env.DB
		.prepare(`
      UPDATE users
      SET digest_frequency = ?,
          daily_digest_enabled = ?
      WHERE telegram_id = ?
    `)
		.bind(
			frequency,
			frequency === "off" ? 0 : 1,
			telegramId
		)
		.run();
}

export async function setDigestHour(
	env: Env,
	telegramId: string,
	hourUtc: number
): Promise<void> {

	await updateUser(
		env,
		telegramId,
		"daily_digest_hour_utc",
		Math.min(Math.max(hourUtc, 0), 23)
	);
}

export async function setDigestWeekday(
	env: Env,
	telegramId: string,
	weekday: number
): Promise<void> {

	await updateUser(
		env,
		telegramId,
		"digest_weekday",
		Math.min(Math.max(weekday, 0), 6)
	);
}

export async function setQuietHours(
	env: Env,
	telegramId: string,
	start: number | null,
	end: number | null
): Promise<void> {

	await env.DB
		.prepare(`
      UPDATE users
      SET quiet_hours_start = ?,
          quiet_hours_end = ?
      WHERE telegram_id = ?
    `)
		.bind(start, end, telegramId)
		.run();
}

export async function setAutoReminderDays(
	env: Env,
	telegramId: string,
	days: number | null
): Promise<void> {

	await updateUser(
		env,
		telegramId,
		"auto_reminder_days",
		days
	);
}

export async function setEscalating(
	env: Env,
	telegramId: string,
	enabled: boolean
): Promise<void> {

	await updateUser(
		env,
		telegramId,
		"escalating_enabled",
		enabled ? 1 : 0
	);
}

export async function setAlertNewConferences(
	env: Env,
	telegramId: string,
	enabled: boolean
): Promise<void> {

	await updateUser(
		env,
		telegramId,
		"alert_new_conferences",
		enabled ? 1 : 0
	);
}

export async function setAlertDeadlineChanges(
	env: Env,
	telegramId: string,
	enabled: boolean
): Promise<void> {

	await updateUser(
		env,
		telegramId,
		"alert_deadline_changes",
		enabled ? 1 : 0
	);
}

export async function setSortPreference(
	env: Env,
	telegramId: string,
	sort: SortPreference
): Promise<void> {

	await updateUser(
		env,
		telegramId,
		"sort_preference",
		sort
	);
}

export async function setMinRank(
	env: Env,
	telegramId: string,
	rank: string | null
): Promise<void> {

	await updateUser(env, telegramId, "min_rank", rank);
}

export async function setLanguage(
	env: Env,
	telegramId: string,
	languageCode: string | null
): Promise<void> {

	await updateUser(
		env,
		telegramId,
		"language_code",
		languageCode
	);
}

/**
 * Flags a chat the bot can no longer write to, so background
 * jobs stop wasting requests on it.
 */
export async function markUserBlocked(
	env: Env,
	telegramId: string,
	blocked = true
): Promise<void> {

	await updateUser(
		env,
		telegramId,
		"blocked",
		blocked ? 1 : 0
	);
}

/* =========================================================
	 SORTING
	 ========================================================= */

/**
 * Maps a sort preference onto a safe ORDER BY clause.
 */
export function orderByFor(
	sort: string | null | undefined
): string {

	switch (sort) {

		case "date":
			return "COALESCE(start, deadline_utc) ASC, title ASC";

		case "name":
			return "title COLLATE NOCASE ASC, year ASC";

		case "rank":
			return `
        CASE core_rank
          WHEN 'A*' THEN 0
          WHEN 'A' THEN 1
          WHEN 'B' THEN 2
          WHEN 'C' THEN 3
          ELSE 4
        END ASC,
        deadline_utc ASC
      `;

		default:
			return "deadline_utc ASC";
	}
}

/* =========================================================
	 MUTING
	 ========================================================= */

export async function isMuted(
	env: Env,
	telegramId: string,
	conferenceId: string
): Promise<boolean> {

	const row =
		await env.DB
			.prepare(`
        SELECT 1 AS present
        FROM muted_conferences
        WHERE telegram_id = ? AND conference_id = ?
        LIMIT 1
      `)
			.bind(telegramId, conferenceId)
			.first<{ present: number }>();

	return !!row;
}

export async function muteConference(
	env: Env,
	telegramId: string,
	conferenceId: string
): Promise<void> {

	await env.DB
		.prepare(`
      INSERT OR IGNORE INTO muted_conferences (
        telegram_id, conference_id
      )
      VALUES (?, ?)
    `)
		.bind(telegramId, conferenceId)
		.run();
}

export async function unmuteConference(
	env: Env,
	telegramId: string,
	conferenceId: string
): Promise<void> {

	await env.DB
		.prepare(`
      DELETE FROM muted_conferences
      WHERE telegram_id = ? AND conference_id = ?
    `)
		.bind(telegramId, conferenceId)
		.run();
}

/* =========================================================
	 SAVED SEARCHES
	 ========================================================= */

export async function addSavedSearch(
	env: Env,
	telegramId: string,
	query: string
): Promise<void> {

	await env.DB
		.prepare(`
      INSERT INTO saved_searches (telegram_id, query)
      VALUES (?, ?)
      ON CONFLICT(telegram_id, query)
      DO UPDATE SET notify = 1
    `)
		.bind(telegramId, query.trim().slice(0, 80))
		.run();
}

export async function listSavedSearches(
	env: Env,
	telegramId: string
): Promise<SavedSearch[]> {

	const result =
		await env.DB
			.prepare(`
        SELECT *
        FROM saved_searches
        WHERE telegram_id = ?
        ORDER BY created_at DESC
        LIMIT 20
      `)
			.bind(telegramId)
			.all<SavedSearch>();

	return result.results;
}

export async function deleteSavedSearch(
	env: Env,
	telegramId: string,
	id: number
): Promise<boolean> {

	const result =
		await env.DB
			.prepare(`
        DELETE FROM saved_searches
        WHERE id = ? AND telegram_id = ?
      `)
			.bind(id, telegramId)
			.run();

	return (result.meta.changes ?? 0) > 0;
}

export async function getNotifiableSearches(
	env: Env
): Promise<SavedSearch[]> {

	const result =
		await env.DB
			.prepare(`
        SELECT s.*
        FROM saved_searches s
        INNER JOIN users u ON u.telegram_id = s.telegram_id
        WHERE s.notify = 1
          AND u.blocked = 0
        LIMIT 500
      `)
			.all<SavedSearch>();

	return result.results;
}

export async function markSearchNotified(
	env: Env,
	id: number
): Promise<void> {

	await env.DB
		.prepare(`
      UPDATE saved_searches
      SET last_notified_at = datetime('now')
      WHERE id = ?
    `)
		.bind(id)
		.run();
}

/* =========================================================
	 CALLBACK TOKENS
	 ========================================================= */

/**
 * Stores a payload too long for callback_data (64 bytes) and
 * returns a short token to put on the button instead.
 */
export async function putCallbackToken(
	env: Env,
	payload: string
): Promise<string> {

	const token =
		crypto.randomUUID().replace(/-/g, "").slice(0, 16);

	await env.DB
		.prepare(`
      INSERT INTO callback_tokens (token, payload)
      VALUES (?, ?)
    `)
		.bind(token, payload)
		.run();

	return token;
}

export async function getCallbackToken(
	env: Env,
	token: string
): Promise<string | null> {

	const row =
		await env.DB
			.prepare(`
        SELECT payload
        FROM callback_tokens
        WHERE token = ?
        LIMIT 1
      `)
			.bind(token)
			.first<{ payload: string }>();

	return row?.payload ?? null;
}

export async function sweepCallbackTokens(
	env: Env
): Promise<void> {

	await env.DB
		.prepare(`
      DELETE FROM callback_tokens
      WHERE created_at < datetime('now', ?)
    `)
		.bind(`-${CALLBACK_TOKEN_TTL_HOURS} hours`)
		.run();
}

/* =========================================================
	 UPDATE DEDUPLICATION
	 ========================================================= */

/**
 * Telegram redelivers an update when the webhook does not
 * answer quickly enough. Returns false if this update has
 * already been handled.
 */
export async function claimUpdate(
	env: Env,
	updateId: number
): Promise<boolean> {

	try {

		const result =
			await env.DB
				.prepare(`
          INSERT OR IGNORE INTO processed_updates (update_id)
          VALUES (?)
        `)
				.bind(updateId)
				.run();

		return (result.meta.changes ?? 0) > 0;

	} catch (error) {

		/*
		 * Never drop an update because bookkeeping failed.
		 */
		console.error("claimUpdate failed:", error);

		return true;
	}
}

export async function sweepProcessedUpdates(
	env: Env
): Promise<void> {

	await env.DB
		.prepare(`
      DELETE FROM processed_updates
      WHERE created_at < datetime('now', ?)
    `)
		.bind(`-${PROCESSED_UPDATE_TTL_HOURS} hours`)
		.run();
}

/* =========================================================
	 PENDING INPUT (force-reply prompts)
	 ========================================================= */

export async function setPendingInput(
	env: Env,
	telegramId: string,
	kind: PendingInputKind
): Promise<void> {

	await env.DB
		.prepare(`
      INSERT INTO pending_input (telegram_id, kind, created_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(telegram_id)
      DO UPDATE SET
        kind = excluded.kind,
        created_at = excluded.created_at
    `)
		.bind(telegramId, kind)
		.run();
}

/**
 * Reads and clears the pending prompt, if it is recent enough
 * to still be what the user is replying to.
 */
export async function takePendingInput(
	env: Env,
	telegramId: string
): Promise<PendingInputKind | null> {

	const row =
		await env.DB
			.prepare(`
        SELECT kind
        FROM pending_input
        WHERE telegram_id = ?
          AND created_at > datetime('now', '-1 hour')
        LIMIT 1
      `)
			.bind(telegramId)
			.first<{ kind: PendingInputKind }>();

	if (row) {
		await clearPendingInput(env, telegramId);
	}

	return row?.kind ?? null;
}

export async function clearPendingInput(
	env: Env,
	telegramId: string
): Promise<void> {

	await env.DB
		.prepare(`
      DELETE FROM pending_input
      WHERE telegram_id = ?
    `)
		.bind(telegramId)
		.run();
}

/* =========================================================
	 VENUE INTELLIGENCE
	 ========================================================= */

export async function getAcceptanceRates(
	env: Env,
	venue: string
): Promise<AcceptanceRate[]> {

	const result =
		await env.DB
			.prepare(`
        SELECT *
        FROM acceptance_rates
        WHERE venue = ?
        ORDER BY year DESC
        LIMIT 12
      `)
			.bind(normalizeVenue(venue))
			.all<AcceptanceRate>();

	return result.results;
}

export async function getVenueHistory(
	env: Env,
	venue: string,
	excludeYear?: number
): Promise<VenueHistoryRow[]> {

	const result =
		await env.DB
			.prepare(`
        SELECT *
        FROM venue_history
        WHERE venue = ?
          AND (? IS NULL OR year != ?)
        ORDER BY year DESC
        LIMIT 10
      `)
			.bind(
				normalizeVenue(venue),
				excludeYear ?? null,
				excludeYear ?? null
			)
			.all<VenueHistoryRow>();

	return result.results;
}

export async function getCountryInfo(
	env: Env,
	country: string
): Promise<CountryInfo | null> {

	return env.DB
		.prepare(`
      SELECT *
      FROM country_info
      WHERE country = ?
      LIMIT 1
    `)
		.bind(country)
		.first<CountryInfo>();
}

/**
 * Conferences that share topics with this one and have a
 * nearby deadline.
 */
export async function findSimilarConferences(
	env: Env,
	conference: DbConference,
	limit = 5
): Promise<DbConference[]> {

	const topics =
		conference.topics
			? (JSON.parse(conference.topics) as string[])
			: [];

	if (!topics.length) {
		return [];
	}

	const topicConditions =
		topics.map(() => "topics LIKE ?").join(" OR ");

	const params: unknown[] = [
		...topics.map(topic => `%"${topic}"%`),
		conference.id,
	];

	const result =
		await env.DB
			.prepare(`
        SELECT *
        FROM conferences
        WHERE (${topicConditions})
          AND id != ?
          AND deadline_utc IS NOT NULL
          AND deadline_utc > datetime('now')
        ORDER BY
          ABS(
            julianday(deadline_utc) -
            julianday(COALESCE(?, deadline_utc))
          ) ASC
        LIMIT ?
      `)
			.bind(
				...params,
				conference.deadline_utc,
				limit
			)
			.all<DbConference>();

	return result.results;
}

/* =========================================================
	 NOTIFICATION LEDGER
	 ========================================================= */

/**
 * Records a notification and reports whether it is new, so a
 * cron job that runs every six hours never sends twice.
 */
export async function claimNotification(
	env: Env,
	telegramId: string,
	kind: string,
	reference: string
): Promise<boolean> {

	const result =
		await env.DB
			.prepare(`
        INSERT OR IGNORE INTO notification_log (
          telegram_id, kind, reference
        )
        VALUES (?, ?, ?)
      `)
			.bind(telegramId, kind, reference)
			.run();

	return (result.meta.changes ?? 0) > 0;
}

export async function sweepNotificationLog(
	env: Env
): Promise<void> {

	await env.DB
		.prepare(`
      DELETE FROM notification_log
      WHERE created_at < datetime('now', '-90 days')
    `)
		.run();
}

/* =========================================================
	 DIGEST AUDIENCE
	 ========================================================= */

export interface DigestUser {
	telegram_id: string;
	timezone: string;
	digest_frequency: string;
	digest_weekday: number;
	daily_digest_hour_utc: number;
	last_digest_date: string | null;
}

/**
 * Everyone with a digest switched on who has not already been
 * sent one today. Hour and weekday are checked per user in the
 * job, against the user's own timezone.
 */
export async function getDigestCandidates(
	env: Env,
	today: string
): Promise<DigestUser[]> {

	const result =
		await env.DB
			.prepare(`
        SELECT
          telegram_id,
          timezone,
          digest_frequency,
          digest_weekday,
          daily_digest_hour_utc,
          last_digest_date
        FROM users
        WHERE daily_digest_enabled = 1
          AND digest_frequency != 'off'
          AND blocked = 0
          AND (
            last_digest_date IS NULL
            OR last_digest_date != ?
          )
        LIMIT 500
      `)
			.bind(today)
			.all<DigestUser>();

	return result.results;
}

export async function markDigestSent(
	env: Env,
	telegramId: string,
	date: string
): Promise<void> {

	await env.DB
		.prepare(`
      UPDATE users
      SET last_digest_date = ?
      WHERE telegram_id = ?
    `)
		.bind(date, telegramId)
		.run();
}

/**
 * Users who opted into alerts for newly listed conferences,
 * together with the topics they follow.
 */
export async function getNewConferenceSubscribers(
	env: Env
): Promise<{ telegram_id: string; topics: string[] }[]> {

	const result =
		await env.DB
			.prepare(`
        SELECT
          u.telegram_id AS telegram_id,
          GROUP_CONCAT(t.topic) AS topics
        FROM users u
        LEFT JOIN user_topics t
          ON t.telegram_id = u.telegram_id
        WHERE u.alert_new_conferences = 1
          AND u.blocked = 0
        GROUP BY u.telegram_id
        LIMIT 500
      `)
			.all<{
				telegram_id: string;
				topics: string | null;
			}>();

	return result.results.map(
		row => ({
			telegram_id: row.telegram_id,
			topics: row.topics
				? row.topics.split(",").filter(Boolean)
				: [],
		})
	);
}

/**
 * Everyone who saved or set a reminder on a conference and
 * wants to hear when its deadline moves.
 */
export async function getConferenceWatchers(
	env: Env,
	conferenceId: string
): Promise<string[]> {

	const result =
		await env.DB
			.prepare(`
        SELECT DISTINCT u.telegram_id AS telegram_id
        FROM users u
        LEFT JOIN saved_conferences s
          ON s.telegram_id = u.telegram_id
          AND s.conference_id = ?
        LEFT JOIN reminders r
          ON r.telegram_id = u.telegram_id
          AND r.conference_id = ?
        LEFT JOIN muted_conferences m
          ON m.telegram_id = u.telegram_id
          AND m.conference_id = ?
        WHERE u.alert_deadline_changes = 1
          AND u.blocked = 0
          AND m.conference_id IS NULL
          AND (s.conference_id IS NOT NULL OR r.id IS NOT NULL)
        LIMIT 500
      `)
			.bind(conferenceId, conferenceId, conferenceId)
			.all<{ telegram_id: string }>();

	return result.results.map(row => row.telegram_id);
}

/**
 * Saved conferences that still need an automatic reminder,
 * for users who turned that on.
 */
export async function getPendingAutoReminders(
	env: Env
): Promise<{
	telegram_id: string;
	conference_id: string;
	deadline_utc: string;
	auto_reminder_days: number;
}[]> {

	const result =
		await env.DB
			.prepare(`
        SELECT
          s.telegram_id AS telegram_id,
          s.conference_id AS conference_id,
          c.deadline_utc AS deadline_utc,
          u.auto_reminder_days AS auto_reminder_days
        FROM saved_conferences s
        INNER JOIN users u
          ON u.telegram_id = s.telegram_id
        INNER JOIN conferences c
          ON c.id = s.conference_id
        LEFT JOIN reminders r
          ON r.telegram_id = s.telegram_id
          AND r.conference_id = s.conference_id
          AND r.kind = 'paper'
        WHERE u.auto_reminder_days IS NOT NULL
          AND u.blocked = 0
          AND c.deadline_utc IS NOT NULL
          AND c.deadline_utc > datetime('now')
          AND r.id IS NULL
        LIMIT 500
      `)
			.all<{
				telegram_id: string;
				conference_id: string;
				deadline_utc: string;
				auto_reminder_days: number;
			}>();

	return result.results;
}

/**
 * Remembers where the user was, so "Back" returns to the list
 * they came from rather than the main menu.
 */
export async function setLastList(
	env: Env,
	telegramId: string,
	route: string
): Promise<void> {

	await updateUser(env, telegramId, "last_list", route);
}

/**
 * Which of these conference ids the user has saved.
 *
 * Lets a list render correct save state in one query instead of
 * one per row.
 */
export async function getSavedIds(
	env: Env,
	telegramId: string,
	conferenceIds: string[]
): Promise<Set<string>> {

	if (!conferenceIds.length) {
		return new Set();
	}

	const placeholders =
		conferenceIds.map(() => "?").join(", ");

	const result =
		await env.DB
			.prepare(`
        SELECT conference_id
        FROM saved_conferences
        WHERE telegram_id = ?
          AND conference_id IN (${placeholders})
      `)
			.bind(telegramId, ...conferenceIds)
			.all<{ conference_id: string }>();

	return new Set(
		result.results.map(row => row.conference_id)
	);
}
