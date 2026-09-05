import {
	Env,
	TelegramInlineQuery,
	DbConference,
	InlineResult,
} from "../types";

import {
	answerInlineQuery,
} from "../telegram";

import {
	listConferences,
	searchConferences,
	getPersonalFeed,
	getUser,
	orderByFor,
} from "../database";

import {
	parseTopics,
} from "../conferences";

import {
	rankBadge,
} from "../enrich";

import {
	conferenceText,
	formatDate,
	deadlineBadge,
} from "../format";

import {
	INLINE_CACHE_SECONDS,
} from "../config";

const PAGE = 20;

/**
 * A coloured dot standing in for the deadline badge, so results
 * carry urgency at a glance in the inline list.
 */
function thumbnail(
	conference: DbConference
): string {

	const badge =
		deadlineBadge(conference.deadline_utc);

	const colour =
		badge === "🔴"
			? "e53935"
			: badge === "🟠"
				? "fb8c00"
				: badge === "🟡"
					? "fdd835"
					: badge === "⚫"
						? "757575"
						: "43a047";

	/*
	 * A data: URI keeps this self-contained — no external host
	 * to depend on or leak queries to.
	 */
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="64" ` +
		`height="64"><rect width="64" height="64" rx="12" ` +
		`fill="#${colour}"/></svg>`;

	return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export async function handleInlineQuery(
	env: Env,
	query: TelegramInlineQuery
): Promise<void> {

	const search =
		query.query.trim();

	const userId =
		String(query.from.id);

	const user =
		await getUser(env, userId);

	const offset =
		Number(query.offset) || 0;

	const page =
		Math.floor(offset / PAGE) + 1;

	let rows: DbConference[] = [];

	let total = 0;

	if (search) {

		const result =
			await searchConferences(
				env,
				search,
				page,
				PAGE,
				orderByFor(user?.sort_preference)
			);

		rows = result.rows;
		total = result.total;

	} else if (user) {

		/*
		 * With no query, an empty list is useless. The user's own
		 * feed is the most likely thing they want to share.
		 */
		const feed =
			await getPersonalFeed(env, userId, page, PAGE);

		rows = feed.rows;
		total = feed.total;
	}

	if (!rows.length && !search) {

		rows =
			await listConferences(
				env,
				{ page, pageSize: PAGE }
			);

		total = rows.length + offset + 1;
	}

	const timezone =
		user?.timezone ?? "UTC";

	const results: InlineResult[] =
		rows.map(conference => {

			const topics =
				parseTopics(conference.topics);

			const rank =
				rankBadge(conference.core_rank);

			return {
				type: "article" as const,

				id: conference.id.slice(0, 64),

				title:
					`${deadlineBadge(conference.deadline_utc)} ` +
					`${conference.title} ${conference.year}` +
					(rank ? `  ${rank}` : ""),

				description:
					[
						formatDate(conference.deadline_utc, timezone),
						conference.place || "TBA",
						topics.join(", "),
					]
						.filter(Boolean)
						.join(" · "),

				url: conference.link || undefined,

				thumbnail_url: thumbnail(conference),
				thumbnail_width: 64,
				thumbnail_height: 64,

				input_message_content: {
					message_text:
						conferenceText(conference, { timezone }),

					parse_mode: "HTML",

					link_preview_options: {
						is_disabled: !conference.link,
						url: conference.link || undefined,
						prefer_small_media: true,
					},
				},

				reply_markup: {
					inline_keyboard: [
						[
							{
								text: "🌐 Website",
								url:
									conference.link ||
									"https://mlciv.com/ai-deadlines/",
							},
						],
					],
				},
			};
		});

	const nextOffset =
		rows.length === PAGE && offset + PAGE < total
			? String(offset + PAGE)
			: "";

	await answerInlineQuery(
		env,
		query.id,
		results,
		{
			/*
			 * Results depend on the querying user's timezone,
			 * sort order and feed, so they must not be shared.
			 */
			isPersonal: true,

			cacheTime: INLINE_CACHE_SECONDS,

			nextOffset,

			button: user
				? {
					text: "⚙️ Tune your feed",
					start_parameter: "settings",
				}
				: {
					text: "👋 Start the bot to personalise this",
					start_parameter: "inline",
				},
		}
	);
}
