import {
	Env,
} from "./types";

import {
	sendMessage,
} from "./telegram";

import {
	syncConferences,
	getDueReminders,
	markReminderSent,
	getPersonalFeed,
} from "./database";

import {
	fetchConferences,
	getFutureConferences,
	parseTopics,
} from "./conferences";

import {
	formatDate,
} from "./format";

/**
 * Background work driven by the Cloudflare Cron trigger:
 * source sync, deadline reminders and the daily digest.
 */

export async function processReminders(
	env: Env
) {

	const reminders =
		await getDueReminders(
			env
		);

	for (
		const reminder of reminders
	) {

		try {

			const topics =
				parseTopics(
					reminder.topics
				);

			const message =
				`🔔 Conference Deadline Reminder

📌 ${reminder.title} ${reminder.year}

📅 Deadline:
${formatDate(
					reminder.deadline_utc
				)}

⏳ ${reminder.days_before} days remaining

📍 ${reminder.place ||
				"TBA"
				}

🏷 ${topics.join(", ")
				}`;

			if (reminder.link) {

				await sendMessage(
					env,
					Number(
						reminder.telegram_id
					),
					message,
					{
						inline_keyboard: [
							[
								{
									text:
										"🌐 Official Website",
									url:
										reminder.link,
								},
							],
						],
					}
				);

			} else {

				await sendMessage(
					env,
					Number(
						reminder.telegram_id
					),
					message
				);
			}

			await markReminderSent(
				env,
				reminder.id
			);

		} catch (error) {

			console.error(
				"Reminder failed:",
				reminder.id,
				error
			);
		}
	}
}

/* =========================================================
	 DAILY DIGEST
	 ========================================================= */

export async function processDailyDigests(
	env: Env
) {

	/*
	 * This implementation sends the digest at
	 * 09:00 UTC to users who enabled it.
	 *
	 * We keep the mechanism simple and free-tier
	 * friendly.
	 */

	const currentHour =
		new Date().getUTCHours();

	if (
		currentHour !== 9
	) {
		return;
	}

	const today =
		new Date()
			.toISOString()
			.slice(0, 10);

	const users =
		await env.DB
			.prepare(`
        SELECT *
        FROM users
        WHERE daily_digest_enabled = 1
          AND (
            last_digest_date IS NULL
            OR last_digest_date != ?
          )
        LIMIT 100
      `)
			.bind(today)
			.all<{
				telegram_id: string;
				last_digest_date: string | null;
			}>();

	for (
		const user of users.results
	) {

		try {

			const feed =
				await getPersonalFeed(
					env,
					user.telegram_id,
					1,
					5
				);

			if (
				feed.rows.length === 0
			) {
				continue;
			}

			let text =
				`🎯 Your Daily Conference Digest\n\n`;

			feed.rows.forEach(
				(conference, index) => {

					text +=
						`${index + 1}. ` +
						`${conference.title} ` +
						`${conference.year}\n`;

					text +=
						`📅 ${formatDate(
							conference.deadline_utc
						)}\n`;

					text +=
						`📍 ${conference.place ||
						"TBA"
						}\n\n`;
				}
			);

			await sendMessage(
				env,
				Number(
					user.telegram_id
				),
				text,
				{
					inline_keyboard: [
						[
							{
								text:
									"🎯 Open My Feed",
								callback_data:
									"list:feed:1",
							},
						],
					],
				}
			);

			await env.DB
				.prepare(`
          UPDATE users
          SET last_digest_date = ?
          WHERE telegram_id = ?
        `)
				.bind(
					today,
					user.telegram_id
				)
				.run();

		} catch (error) {

			console.error(
				"Daily digest failed:",
				user.telegram_id,
				error
			);
		}
	}
}

/* =========================================================
	 SYNC
	 ========================================================= */

export async function scheduledSync(
	env: Env
) {

	const source =
		await fetchConferences();

	const future =
		getFutureConferences(
			source
		);

	const result =
		await syncConferences(
			env,
			future
		);

	console.log(
		JSON.stringify({
			event: "sync",
			fetched: future.length,
			inserted:
				result.inserted.length,
			updated:
				result.updated,
		})
	);
}
