import {
	Env,
	DbConference,
	User,
} from "../types";

import {
	sendMessage,
	editMessageText,
	TelegramError,
} from "../telegram";

import {
	countConferences,
	listConferences,
	searchConferences,
	listSaved,
	getPersonalFeed,
	getConference,
	findSimilarConferences,
	orderByFor,
	setLastList,
	getUser,
} from "../database";

import {
	pagination,
	conferenceListKeyboard,
	TOPICS,
} from "../ui";

import {
	listText,
} from "../format";

import {
	PAGE_SIZE,
	REGION_COUNTRIES,
	FORMAT_LABELS,
} from "../config";

import {
	RANK_ORDER,
} from "../enrich";

const FUTURE =
	"deadline_utc IS NOT NULL AND deadline_utc > datetime('now')";

interface Query {
	title: string;
	callbackPrefix: string;
	rows: DbConference[];
	total: number;
	footnote?: string;
}

/**
 * Resolves a list mode into rows plus the metadata needed to
 * render and paginate it.
 */
async function runQuery(
	env: Env,
	mode: string,
	value: string | undefined,
	page: number,
	userId: string,
	orderBy: string
): Promise<Query> {

	const paged = async (
		where: string,
		params: unknown[]
	) => ({
		total: await countConferences(env, where, params),
		rows: await listConferences(
			env,
			{ page, pageSize: PAGE_SIZE, where, params, orderBy }
		),
	});

	switch (mode) {

		case "topic": {

			const topic =
				(value ?? "").toUpperCase();

			const { total, rows } =
				await paged(
					`${FUTURE} AND topics LIKE ?`,
					[`%"${topic}"%`]
				);

			return {
				title: `${TOPICS[topic] ?? topic} Conferences`,
				callbackPrefix: `list:topic:${topic}`,
				rows,
				total,
			};
		}

		case "location": {

			const { total, rows } =
				await paged(
					`${FUTURE} AND (
						country = ?
						OR place LIKE ? COLLATE NOCASE
					)`,
					[value ?? "", `%${value ?? ""}%`]
				);

			return {
				title: `🌍 Conferences in ${value}`,
				callbackPrefix: `list:location:${value}`,
				rows,
				total,
			};
		}

		case "region": {

			const countries =
				REGION_COUNTRIES[value ?? ""] ?? [];

			if (!countries.length) {

				return {
					title: `🌍 ${value}`,
					callbackPrefix: `list:region:${value}`,
					rows: [],
					total: 0,
				};
			}

			const conditions =
				countries
					.map(() => "place LIKE ? COLLATE NOCASE")
					.join(" OR ");

			const { total, rows } =
				await paged(
					`${FUTURE} AND (${conditions})`,
					countries.map(country => `%${country}%`)
				);

			return {
				title:
					`🌍 ${(value ?? "").replace(/-/g, " ")} Conferences`,
				callbackPrefix: `list:region:${value}`,
				rows,
				total,
			};
		}

		case "rank": {

			/*
			 * "A" means A and above, so every rank at least as
			 * good as the one requested is included.
			 */
			const threshold =
				RANK_ORDER[value ?? "C"] ?? 3;

			const accepted =
				Object.entries(RANK_ORDER)
					.filter(([, order]) => order <= threshold)
					.map(([rank]) => rank);

			const placeholders =
				accepted.map(() => "?").join(", ");

			const { total, rows } =
				await paged(
					`${FUTURE} AND core_rank IN (${placeholders})`,
					accepted
				);

			return {
				title: `🏅 CORE ${value} and above`,
				callbackPrefix: `list:rank:${value}`,
				rows,
				total,
				footnote: "Rankings from CORE. Not all venues are ranked.",
			};
		}

		case "format": {

			const { total, rows } =
				await paged(
					`${FUTURE} AND format = ?`,
					[value ?? "in-person"]
				);

			return {
				title:
					`${FORMAT_LABELS[value ?? ""] ?? value} conferences`,
				callbackPrefix: `list:format:${value}`,
				rows,
				total,
			};
		}

		case "similar": {

			const conference =
				await getConference(env, value ?? "");

			if (!conference) {

				return {
					title: "🔗 Similar conferences",
					callbackPrefix: `list:similar:${value}`,
					rows: [],
					total: 0,
				};
			}

			const similar =
				await findSimilarConferences(env, conference, PAGE_SIZE);

			return {
				title:
					`🔗 Similar to ${conference.title} ${conference.year}`,
				callbackPrefix: `list:similar:${value}`,
				rows: similar,
				total: similar.length,
				footnote: "Shared topics, nearest deadlines first.",
			};
		}

		case "search": {

			const result =
				await searchConferences(
					env,
					value || "",
					page,
					PAGE_SIZE,
					orderBy
				);

			return {
				title: `🔎 Search: "${value}"`,

				callbackPrefix:
					`list:search:${encodeURIComponent(value || "")}`,

				rows: result.rows,
				total: result.total,

				footnote: result.fuzzy
					? "No exact match — showing closest results."
					: undefined,
			};
		}

		case "deadline": {

			const days =
				Math.min(Math.max(Number(value) || 30, 1), 365);

			const maxDate =
				new Date(Date.now() + days * 86_400_000)
					.toISOString();

			const { total, rows } =
				await paged(
					`${FUTURE} AND deadline_utc <= ?`,
					[maxDate]
				);

			return {
				title: `⏰ Deadlines in the next ${days} days`,
				callbackPrefix: `list:deadline:${days}`,
				rows,
				total,
			};
		}

		case "saved": {

			const result =
				await listSaved(env, userId, page, PAGE_SIZE);

			return {
				title: "⭐ Saved Conferences",
				callbackPrefix: "list:saved",
				rows: result.rows,
				total: result.total,
			};
		}

		case "feed": {

			const result =
				await getPersonalFeed(env, userId, page, PAGE_SIZE);

			return {
				title: "🎯 Your Conference Feed",
				callbackPrefix: "list:feed",
				rows: result.rows,
				total: result.total,
			};
		}

		default: {

			const { total, rows } =
				await paged(FUTURE, []);

			return {
				title: "📅 Upcoming Conference Deadlines",
				callbackPrefix: "list:upcoming",
				rows,
				total,
			};
		}
	}
}

/**
 * Renders a paginated conference list and either edits the
 * current message or sends a new one.
 */
export async function showList(
	env: Env,
	chatId: number,
	mode: string,
	value: string | undefined,
	page: number,
	messageId?: number,
	user?: User | null
): Promise<void> {

	const userId =
		String(chatId);

	const viewer =
		user ?? await getUser(env, userId);

	const orderBy =
		orderByFor(viewer?.sort_preference);

	const query =
		await runQuery(env, mode, value, page, userId, orderBy);

	const text =
		listText(
			query.title,
			query.rows,
			page,
			query.total,
			viewer?.timezone ?? "UTC",
			query.footnote
		);

	const markup =
		pagination(
			page,
			query.total,
			query.callbackPrefix,
			{
				sortReturn: `${query.callbackPrefix}:${page}`,
				exportPayload: `list:${mode}:${value ?? ""}`,
			}
		);

	markup.inline_keyboard = [
		...conferenceListKeyboard(query.rows).inline_keyboard,
		...markup.inline_keyboard,
	];

	/*
	 * Remember where we are so a detail screen can come back.
	 */
	await setLastList(
		env,
		userId,
		`${query.callbackPrefix}:${page}`
	);

	if (messageId) {

		try {

			await editMessageText(
				env,
				chatId,
				messageId,
				text,
				markup
			);

			return;

		} catch (error) {

			/*
			 * Editing fails when the original message is too old
			 * or was deleted; sending a fresh one is the correct
			 * fallback, but only for that class of failure.
			 */
			if (
				!(error instanceof TelegramError) ||
				error.isUnreachable
			) {
				throw error;
			}

			console.warn("editMessageText fell back to send:", error);
		}
	}

	await sendMessage(env, chatId, text, markup);
}
