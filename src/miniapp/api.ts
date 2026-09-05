import {
	Env,
	DbConference,
} from "../types";

import {
	verifyInitData,
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

	const user =
		await verifyInitData(env, body.initData ?? "");

	if (!user) {
		return json({ error: "Unauthorized" }, 401);
	}

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

		default:
			return json({ error: "Not found" }, 404);
	}
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

	if (search) {

		const result =
			await searchConferences(
				env,
				search,
				page,
				pageSize,
				orderBy
			);

		return json({
			rows: result.rows.map(project),
			total: result.total,
			fuzzy: result.fuzzy,
		});
	}

	if (view === "saved") {

		const result =
			await listSaved(env, telegramId, page, pageSize);

		return json({
			rows: result.rows.map(project),
			total: result.total,
		});
	}

	if (view === "feed") {

		const result =
			await getPersonalFeed(env, telegramId, page, pageSize);

		return json({
			rows: result.rows.map(project),
			total: result.total,
		});
	}

	const clauses: string[] = [FUTURE];

	const params: unknown[] = [];

	const topic =
		String(body.topic ?? "").trim().toUpperCase();

	if (topic) {
		clauses.push("topics LIKE ?");
		params.push(`%"${topic}"%`);
	}

	const rank =
		String(body.rank ?? "").trim();

	if (["A*", "A", "B", "C"].includes(rank)) {

		const order =
			["A*", "A", "B", "C"];

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

	const where =
		clauses.join(" AND ");

	const [total, rows] =
		await Promise.all([
			countConferences(env, where, params),
			listConferences(
				env,
				{ page, pageSize, where, params, orderBy }
			),
		]);

	return json({
		rows: rows.map(project),
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
