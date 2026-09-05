import {
	Conference,
	DbConference,
	Env,
	Reminder,
	User,
} from "./types";

import {
	deadlineToUtc,
	toDbConference,
} from "./conferences";

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

	const pageSize =
		Math.min(
			Math.max(
				options.pageSize,
				1
			),
			10
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

export async function searchConferences(
	env: Env,
	query: string,
	page: number,
	pageSize: number
): Promise<{
	rows: DbConference[];
	total: number;
}> {

	const clean =
		query
			.trim()
			.slice(0, 50);

	const pattern =
		`%${clean}%`;

	const where = `
    deadline_utc IS NOT NULL
    AND deadline_utc > datetime('now')
    AND (
      title LIKE ? COLLATE NOCASE
      OR full_name LIKE ? COLLATE NOCASE
      OR place LIKE ? COLLATE NOCASE
      OR note LIKE ? COLLATE NOCASE
    )
  `;

	const params = [
		pattern,
		pattern,
		pattern,
		pattern,
	];

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
	 SYNC
	 ========================================================= */

export async function syncConferences(
	env: Env,
	conferences: Conference[]
): Promise<{
	inserted: string[];
	updated: number;
}> {

	const inserted: string[] = [];

	let updated = 0;

	/*
	 * We first check which IDs already exist.
	 *
	 * The upstream list is relatively small,
	 * so this is acceptable for this application.
	 */
	const existing =
		await env.DB
			.prepare(`
        SELECT id, first_seen_at
        FROM conferences
      `)
			.all<{
				id: string;
				first_seen_at: string;
			}>();

	const existingMap =
		new Map(
			existing.results.map(
				row => [
					row.id,
					row.first_seen_at,
				]
			)
		);

	const statements: D1PreparedStatement[] = [];

	for (const conference of conferences) {

		/*
		 * Ignore entries without deadlines.
		 */
		if (!conference.deadline) {
			continue;
		}

		const dbConference =
			toDbConference(
				conference,
				existingMap.get(
					conference.id
				)
			);

		if (
			!existingMap.has(
				conference.id
			)
		) {
			inserted.push(
				conference.id
			);
		} else {
			updated++;
		}

		statements.push(
			env.DB
				.prepare(`
          INSERT INTO conferences (
            id,
            title,
            year,
            full_name,
            link,
            deadline,
            abstract_deadline,
            deadline_utc,
            abstract_deadline_utc,
            timezone,
            place,
            date,
            start,
            end,
            topics,
            note,
            hindex,
            paperslink,
            pwclink,
            first_seen_at,
            updated_at
          )
          VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
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
					dbConference.first_seen_at,
					dbConference.updated_at
				)
		);
	}

	/*
	 * D1 supports batching.
	 *
	 * Keep batches small.
	 */
	for (
		let i = 0;
		i < statements.length;
		i += 50
	) {

		await env.DB.batch(
			statements.slice(
				i,
				i + 50
			)
		);
	}

	await env.DB
		.prepare(`
      UPDATE metadata
      SET value = ?
      WHERE key = 'last_sync'
    `)
		.bind(
			new Date().toISOString()
		)
		.run();

	return {
		inserted,
		updated,
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
	remindAt: string
): Promise<void> {

	await env.DB
		.prepare(`
      INSERT INTO reminders (
        telegram_id,
        conference_id,
        days_before,
        remind_at,
        sent
      )
      VALUES (?, ?, ?, ?, 0)

      ON CONFLICT (
        telegram_id,
        conference_id,
        days_before
      )
      DO UPDATE SET
        remind_at = excluded.remind_at,
        sent = 0
    `)
		.bind(
			telegramId,
			conferenceId,
			daysBefore,
			remindAt
		)
		.run();
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

export async function listReminders(
	env: Env,
	telegramId: string
): Promise<
	Array<
		Reminder & {
			title: string;
			deadline: string | null;
		}
	>
> {

	const result =
		await env.DB
			.prepare(`
        SELECT
          r.*,
          c.title,
          c.deadline

        FROM reminders r

        INNER JOIN conferences c
          ON c.id = r.conference_id

        WHERE r.telegram_id = ?

        ORDER BY r.remind_at ASC
      `)
			.bind(telegramId)
			.all<
				Reminder & {
					title: string;
					deadline: string | null;
				}
			>();

	return result.results;
}

export async function getDueReminders(
	env: Env
) {

	const result =
		await env.DB
			.prepare(`
        SELECT
          r.*,

          c.title,
          c.year,
          c.deadline,
          c.deadline_utc,
          c.place,
          c.link,
          c.topics

        FROM reminders r

        INNER JOIN conferences c
          ON c.id = r.conference_id

        WHERE r.sent = 0
          AND r.remind_at <= datetime('now')

        ORDER BY r.remind_at ASC

        LIMIT 100
      `)
			.all<
				Reminder & {
					title: string;
					year: number;
					deadline: string | null;
					deadline_utc: string | null;
					place: string | null;
					link: string | null;
					topics: string | null;
				}
			>();

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
