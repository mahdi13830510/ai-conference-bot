import {
	Env,
	DbConference,
} from "../types";

import {
	verifyInitDataDetailed,
} from "./auth";

import {
	upsertUser,
	getUser,
	getConference,
	listConferences,
	countConferences,
	searchConferences,
	listSaved,
	getPersonalFeed,
	isSaved,
	getSavedIds,
	createReminder,
	saveConference,
	unsaveConference,
	getAcceptanceRates,
	getCountryInfo,
	orderByFor,
	getTopics,
	toggleTopic,
} from "../database";

import {
	PAGE_SIZE,
} from "../config";

const FUTURE =
	"deadline_utc IS NOT NULL AND deadline_utc > datetime('now')";

function json(
	data: unknown,
	status = 200
): Response {

	return new Response(
		JSON.stringify(data),
		{
			status,

			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
			},
		}
	);
}

/**
 * Only the fields the Mini App renders, so the payload stays
 * small and nothing internal leaks to the client.
 */
function project(
	conference: DbConference
) {

	return {
		id: conference.id,
		title: conference.title,
		year: conference.year,
		full_name: conference.full_name,
		deadline_utc: conference.deadline_utc,
		abstract_deadline_utc: conference.abstract_deadline_utc,
		place: conference.place,
		country: conference.country,
		format: conference.format,
		topics: conference.topics,
		core_rank: conference.core_rank,
		link: conference.link,
		date: conference.date,
		note: conference.note,
	};
}

/**
 * The Mini App API.
 *
 * Every request carries Telegram's signed `initData`, which is
 * verified here — there is no other authentication, so an
 * unverified request must never reach a query.
 */
export async function handleMiniAppApi(
	request: Request,
	env: Env,
	path: string
): Promise<Response> {

	if (request.method !== "POST") {
		return json({ error: "Method not allowed" }, 405);
	}

	let body: {
		initData?: string;
		[key: string]: unknown;
	};

	try {
		body = await request.json();

	} catch {
		return json({ error: "Invalid JSON" }, 400);
	}

	const verified =
		await verifyInitDataDetailed(env, body.initData ?? "");

	if (!verified.user) {

		/*
		 * Field names and the payload age only — never the hash
		 * or the user object.
		 */
		console.warn(
			JSON.stringify({
				event: "miniapp_auth_failed",
				reason: verified.reason,
				keys: verified.keys,
				age_seconds: verified.ageSeconds,
			})
		);

		return json(
			{ error: "Unauthorized", reason: verified.reason },
			401
		);
	}

	const user =
		verified.user;

	const telegramId =
		String(user.id);

	/*
	 * Someone can reach the Mini App before ever messaging the
	 * bot, so the row may not exist yet.
	 */
	await upsertUser(
		env,
		telegramId,
		user.username,
		user.first_name
	);

	switch (path) {

		case "list":
			return listEndpoint(env, telegramId, body);

		case "detail":
			return detailEndpoint(env, telegramId, body);

		case "save":
			return saveEndpoint(env, telegramId, body);

		case "me":
			return meEndpoint(env, telegramId);

		case "topic":
			return topicEndpoint(env, telegramId, body);

		case "remind":
			return remindEndpoint(env, telegramId, body);

		default:
			return json({ error: "Not found" }, 404);
	}
}

/**
 * Builds the filter clauses shared by the browse and search
 * paths, so a chip means the same thing either way.
 */
function buildFilters(
	body: Record<string, unknown>
): { clauses: string[]; params: unknown[] } {

	const clauses: string[] = [];

	const params: unknown[] = [];

	const topic =
		String(body.topic ?? "").trim().toUpperCase();

	if (topic) {
		clauses.push("topics LIKE ?");
		params.push(`%"${topic}"%`);
	}

	const rank =
		String(body.rank ?? "").trim();

	const order = ["A*", "A", "B", "C"];

	if (order.includes(rank)) {

		const accepted =
			order.slice(0, order.indexOf(rank) + 1);

		clauses.push(
			`core_rank IN (${accepted.map(() => "?").join(", ")})`
		);

		params.push(...accepted);
	}

	const format =
		String(body.format ?? "").trim();

	if (["in-person", "virtual", "hybrid"].includes(format)) {
		clauses.push("format = ?");
		params.push(format);
	}

	return { clauses, params };
}

/**
 * Attaches save state so the star on each card is truthful.
 */
async function withSaved(
	env: Env,
	telegramId: string,
	rows: DbConference[]
) {

	const savedIds =
		await getSavedIds(
			env,
			telegramId,
			rows.map(row => row.id)
		);

	return rows.map(
		row => ({
			...project(row),
			saved: savedIds.has(row.id),
		})
	);
}

async function listEndpoint(
	env: Env,
	telegramId: string,
	body: Record<string, unknown>
): Promise<Response> {

	const page =
		Math.max(1, Number(body.page) || 1);

	const pageSize =
		Math.min(Number(body.pageSize) || PAGE_SIZE * 4, 50);

	const view =
		String(body.view ?? "upcoming");

	const search =
		String(body.search ?? "").trim();

	const user =
		await getUser(env, telegramId);

	const orderBy =
		orderByFor(String(body.sort ?? user?.sort_preference));

	const { clauses, params } =
		buildFilters(body);

	if (search) {

		const result =
			await searchConferences(
				env,
				search,
				page,
				pageSize,
				orderBy,
				clauses.length
					? { where: clauses.join(" AND "), params }
					: undefined
			);

		return json({
			rows: await withSaved(env, telegramId, result.rows),
			total: result.total,
			fuzzy: result.fuzzy,
		});
	}

	if (view === "saved") {

		const result =
			await listSaved(env, telegramId, page, pageSize);

		return json({
			rows: result.rows.map(
				row => ({ ...project(row), saved: true })
			),
			total: result.total,
		});
	}

	if (view === "feed") {

		const result =
			await getPersonalFeed(env, telegramId, page, pageSize);

		return json({
			rows: await withSaved(env, telegramId, result.rows),
			total: result.total,
		});
	}

	const where =
		[FUTURE, ...clauses].join(" AND ");

	const [total, rows] =
		await Promise.all([
			countConferences(env, where, params),
			listConferences(
				env,
				{ page, pageSize, where, params, orderBy }
			),
		]);

	return json({
		rows: await withSaved(env, telegramId, rows),
		total,
	});
}

async function detailEndpoint(
	env: Env,
	telegramId: string,
	body: Record<string, unknown>
): Promise<Response> {

	const conference =
		await getConference(env, String(body.id ?? ""));

	if (!conference) {
		return json({ error: "Not found" }, 404);
	}

	const [saved, rates, country] =
		await Promise.all([
			isSaved(env, telegramId, conference.id),
			getAcceptanceRates(env, conference.title),
			conference.country
				? getCountryInfo(env, conference.country)
				: Promise.resolve(null),
		]);

	return json({
		conference: project(conference),
		saved,
		rates,
		country,
	});
}

async function saveEndpoint(
	env: Env,
	telegramId: string,
	body: Record<string, unknown>
): Promise<Response> {

	const id =
		String(body.id ?? "");

	if (!id) {
		return json({ error: "Missing id" }, 400);
	}

	if (body.saved) {
		await saveConference(env, telegramId, id);
	} else {
		await unsaveConference(env, telegramId, id);
	}

	return json({ saved: !!body.saved });
}

async function meEndpoint(
	env: Env,
	telegramId: string
): Promise<Response> {

	const [user, topics] =
		await Promise.all([
			getUser(env, telegramId),
			getTopics(env, telegramId),
		]);

	return json({
		timezone: user?.timezone ?? "UTC",
		sort: user?.sort_preference ?? "deadline",
		topics,
	});
}

async function topicEndpoint(
	env: Env,
	telegramId: string,
	body: Record<string, unknown>
): Promise<Response> {

	const topic =
		String(body.topic ?? "").toUpperCase();

	if (!topic) {
		return json({ error: "Missing topic" }, 400);
	}

	await toggleTopic(env, telegramId, topic);

	return json({
		topics: await getTopics(env, telegramId),
	});
}

/**
 * Creates a paper-deadline reminder from inside the Mini App.
 */
async function remindEndpoint(
	env: Env,
	telegramId: string,
	body: Record<string, unknown>
): Promise<Response> {

	const conference =
		await getConference(env, String(body.id ?? ""));

	if (!conference) {
		return json({ error: "Not found" }, 404);
	}

	if (!conference.deadline_utc) {
		return json({ error: "No deadline to count back from" }, 400);
	}

	const days =
		Math.min(Math.max(Number(body.days) || 7, 1), 365);

	const remindAt =
		new Date(
			new Date(conference.deadline_utc).getTime() -
			days * 86_400_000
		);

	if (remindAt.getTime() <= Date.now()) {

		return json(
			{ error: "That reminder time has already passed" },
			400
		);
	}

	await createReminder(
		env,
		telegramId,
		conference.id,
		days,
		remindAt.toISOString(),
		"paper"
	);

	return json({ ok: true, days });
}
