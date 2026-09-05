import {
	Env,
	TelegramInlineQuery,
	DbConference,
} from "../types";

import {
	answerInlineQuery,
} from "../telegram";

import {
	listConferences,
	searchConferences,
} from "../database";

import {
	parseTopics,
} from "../conferences";

import {
	conferenceText,
	formatDate,
} from "../format";

/**
 * Inline mode: lets users search conferences from any chat.
 */

export async function handleInlineQuery(
	env: Env,
	query: TelegramInlineQuery
) {

	const search =
		query.query.trim();

	let rows: DbConference[] = [];

	if (search) {

		const result =
			await searchConferences(
				env,
				search,
				1,
				10
			);

		rows =
			result.rows;

	} else {

		rows =
			await listConferences(
				env,
				{
					page: 1,
					pageSize: 10,
				}
			);
	}

	const results =
		rows.map(
			(conference) => {

				const topics =
					parseTopics(
						conference.topics
					);

				const messageText =
					conferenceText(
						conference
					);

				return {
					type: "article" as const,

					id:
						conference.id,

					title:
						`${conference.title} ${conference.year}`,

					description:
						`${formatDate(
							conference.deadline_utc
						)} · ${conference.place ||
						"TBA"
						} · ${topics.join(", ")
						}`,

					url:
						conference.link ||
						undefined,

					input_message_content: {
						message_text:
							messageText,
					},

					reply_markup: {
						inline_keyboard: [
							[
								{
									text:
										"🌐 Official Website",

									url:
										conference.link ||
										"https://mlciv.com/ai-deadlines/",
								},
							],
						],
					},
				};
			}
		);

	await answerInlineQuery(
		env,
		query.id,
		results
	);
}
