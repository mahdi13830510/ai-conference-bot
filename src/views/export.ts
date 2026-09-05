import {
	Env,
	DbConference,
} from "../types";

import {
	sendMessage,
	sendDocument,
	sendChatAction,
} from "../telegram";

import {
	getConference,
	listSaved,
	getPersonalFeed,
	listConferences,
	searchConferences,
	getUser,
	orderByFor,
} from "../database";

import {
	buildIcs,
} from "../calendar";

/**
 * Builds and delivers a .ics file.
 *
 * Files are sent as documents rather than links because the
 * Mini App sandbox blocks downloads a page starts itself.
 */
export async function sendCalendar(
	env: Env,
	chatId: number,
	target: string
): Promise<void> {

	const userId =
		String(chatId);

	await sendChatAction(env, chatId, "upload_document");

	const user =
		await getUser(env, userId);

	const orderBy =
		orderByFor(user?.sort_preference);

	let rows: DbConference[] = [];

	let name = "AI Conference Deadlines";

	let filename = "conferences.ics";

	if (target.startsWith("conf:")) {

		const conference =
			await getConference(env, target.slice(5));

		if (conference) {

			rows = [conference];

			name =
				`${conference.title} ${conference.year}`;

			filename =
				`${conference.title.toLowerCase()}-` +
				`${conference.year}.ics`;
		}

	} else if (target === "saved") {

		const saved =
			await listSaved(env, userId, 1, 200);

		rows = saved.rows;

		name = "Saved conferences";

		filename = "saved-conferences.ics";

	} else if (target === "timeline") {

		const [saved, feed] =
			await Promise.all([
				listSaved(env, userId, 1, 100),
				getPersonalFeed(env, userId, 1, 100),
			]);

		const byId =
			new Map(
				[...saved.rows, ...feed.rows].map(
					conference => [conference.id, conference]
				)
			);

		rows = [...byId.values()];

		name = "My conference timeline";

		filename = "timeline.ics";

	} else if (target.startsWith("list:")) {

		const [, mode, value] =
			target.split(":");

		rows =
			await collectList(env, mode, value, userId, orderBy);

		name = `${mode} conferences`;

		filename = `${mode || "conferences"}.ics`;
	}

	if (!rows.length) {

		await sendMessage(
			env,
			chatId,
			"📆 Nothing to export yet."
		);

		return;
	}

	const ics =
		buildIcs(rows, name);

	await sendDocument(
		env,
		chatId,
		filename,
		ics,
		"text/calendar",
		`📆 <b>${rows.length} conference` +
		`${rows.length === 1 ? "" : "s"}</b>\n\n` +
		`Open this file to add the deadlines to Apple Calendar, ` +
		`Google Calendar or Outlook.`
	);
}

/**
 * Re-runs a list query without pagination, capped so that an
 * export can never become unbounded work.
 */
async function collectList(
	env: Env,
	mode: string,
	value: string,
	userId: string,
	orderBy: string
): Promise<DbConference[]> {

	const FUTURE =
		"deadline_utc IS NOT NULL AND deadline_utc > datetime('now')";

	const LIMIT = 100;

	const fetchWhere = (
		where: string,
		params: unknown[]
	) =>
		listConferences(
			env,
			{ page: 1, pageSize: LIMIT, where, params, orderBy }
		);

	switch (mode) {

		case "topic":
			return fetchWhere(
				`${FUTURE} AND topics LIKE ?`,
				[`%"${value.toUpperCase()}"%`]
			);

		case "location":
			return fetchWhere(
				`${FUTURE} AND (country = ? OR place LIKE ? COLLATE NOCASE)`,
				[value, `%${value}%`]
			);

		case "format":
			return fetchWhere(
				`${FUTURE} AND format = ?`,
				[value]
			);

		case "rank":
			return fetchWhere(
				`${FUTURE} AND core_rank = ?`,
				[value]
			);

		case "search":
			return (
				await searchConferences(env, value, 1, LIMIT, orderBy)
			).rows;

		case "saved":
			return (await listSaved(env, userId, 1, LIMIT)).rows;

		case "feed":
			return (await getPersonalFeed(env, userId, 1, LIMIT)).rows;

		default:
			return fetchWhere(FUTURE, []);
	}
}
