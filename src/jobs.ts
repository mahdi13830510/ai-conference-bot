import {
	Env,
	DbConference,
} from "./types";

import {
	sendMessage,
	TelegramError,
} from "./telegram";

import {
	syncConferences,
	getDueReminders,
	markReminderSent,
	getPersonalFeed,
	getConference,
	createReminder,
	markUserBlocked,
	getDigestCandidates,
	markDigestSent,
	getNewConferenceSubscribers,
	getConferenceWatchers,
	getPendingAutoReminders,
	getNotifiableSearches,
	markSearchNotified,
	searchConferences,
	claimNotification,
	sweepCallbackTokens,
	sweepProcessedUpdates,
	sweepNotificationLog,
	getUser,
	DeadlineChange,
} from "./database";

import {
	getFutureConferences,
	parseTopics,
	toDbConference,
} from "./conferences";

import {
	fetchAllSources,
} from "./sources";

import {
	formatDate,
	remaining,
	escapeHtml,
	chunkMessage,
} from "./format";

import {
	isQuiet,
	localHour,
	localWeekday,
	localDate,
} from "./quiet";

import {
	REMINDER_KIND_LABELS,
} from "./config";

/**
 * Sends to a user, and retires the chat if it has gone away.
 *
 * Every background send goes through here so that one blocked
 * user can never take down a whole job.
 */
async function notify(
	env: Env,
	telegramId: string,
	text: string,
	markup?: Parameters<typeof sendMessage>[3]
): Promise<boolean> {

	try {

		await sendMessage(
			env,
			Number(telegramId),
			text,
			markup
		);

		return true;

	} catch (error) {

		if (
			error instanceof TelegramError &&
			error.isUnreachable
		) {

			await markUserBlocked(env, telegramId);

			console.log(
				JSON.stringify({
					event: "user_unreachable",
					telegram_id: telegramId,
				})
			);

			return false;
		}

		console.error("notify failed:", telegramId, error);

		return false;
	}
}

/* =========================================================
	 SYNC
	 ========================================================= */

export async function scheduledSync(
	env: Env
): Promise<void> {

	const { conferences, results } =
		await fetchAllSources();

	const future =
		getFutureConferences(conferences);

	const result =
		await syncConferences(env, future);

	console.log(
		JSON.stringify({
			event: "sync",
			sources: results,
			merged: conferences.length,
			future: future.length,
			inserted: result.inserted.length,
			updated: result.updated,
			changed: result.changed.length,
		})
	);

	/*
	 * Alerts are driven by what the sync just observed, so they
	 * run here rather than as an independent pass.
	 */
	if (result.changed.length) {
		await announceDeadlineChanges(env, result.changed);
	}

	if (result.inserted.length) {

		await announceNewConferences(
			env,
			future.filter(
				conference =>
					result.inserted.includes(conference.id)
			).map(
				conference => toDbConference(conference)
			)
		);

		await notifySavedSearches(env, result.inserted);
	}
}

/* =========================================================
	 DEADLINE CHANGES
	 ========================================================= */

async function announceDeadlineChanges(
	env: Env,
	changes: DeadlineChange[]
): Promise<void> {

	for (const change of changes) {

		const watchers =
			await getConferenceWatchers(env, change.id);

		if (!watchers.length) {
			continue;
		}

		const extended =
			new Date(change.current).getTime() >
			new Date(change.previous).getTime();

		for (const telegramId of watchers) {

			/*
			 * One alert per user per observed change, even though
			 * the cron runs every few hours.
			 */
			const isNew =
				await claimNotification(
					env,
					telegramId,
					"deadline_change",
					`${change.id}:${change.current}`
				);

			if (!isNew) {
				continue;
			}

			const user =
				await getUser(env, telegramId);

			const timezone =
				user?.timezone ?? "UTC";

			await notify(
				env,
				telegramId,
				`${extended ? "🎉" : "⚠️"} <b>Deadline ` +
				`${extended ? "extended" : "moved"}</b>\n\n` +
				`<b>${escapeHtml(
					`${change.title} ${change.year}`
				)}</b>\n\n` +
				`Was: <s>${escapeHtml(
					formatDate(change.previous, timezone, true)
				)}</s>\n` +
				`Now: <b>${escapeHtml(
					formatDate(change.current, timezone, true)
				)}</b>\n\n` +
				`${escapeHtml(remaining(change.current))}`,
				{
					inline_keyboard: [
						[
							{
								text: "📌 Open conference",
								callback_data: `conf:${change.id}`,
							},
						],
						[
							{
								text: "🔕 Mute this conference",
								callback_data: `mute:${change.id}`,
							},
						],
					],
				}
			);
		}
	}
}

/* =========================================================
	 NEW CONFERENCE ALERTS
	 ========================================================= */

async function announceNewConferences(
	env: Env,
	added: DbConference[]
): Promise<void> {

	if (!added.length) {
		return;
	}

	const subscribers =
		await getNewConferenceSubscribers(env);

	for (const subscriber of subscribers) {

		/*
		 * With no topics chosen, every new conference would
		 * match, which is noise rather than a feature.
		 */
		if (!subscriber.topics.length) {
			continue;
		}

		const matches =
			added.filter(conference => {

				const topics =
					parseTopics(conference.topics);

				return topics.some(
					topic => subscriber.topics.includes(topic)
				);
			});

		if (!matches.length) {
			continue;
		}

		const isNew =
			await claimNotification(
				env,
				subscriber.telegram_id,
				"new_conferences",
				matches.map(match => match.id).sort().join(",").slice(0, 200)
			);

		if (!isNew) {
			continue;
		}

		const user =
			await getUser(env, subscriber.telegram_id);

		const timezone =
			user?.timezone ?? "UTC";

		let text =
			`🆕 <b>${matches.length} new conference` +
			`${matches.length === 1 ? "" : "s"} in your topics</b>\n\n`;

		for (const conference of matches.slice(0, 10)) {

			text +=
				`• <b>${escapeHtml(
					`${conference.title} ${conference.year}`
				)}</b>\n` +
				`  📅 ${escapeHtml(
					formatDate(conference.deadline_utc, timezone)
				)}\n` +
				`  📍 ${escapeHtml(conference.place || "TBA")}\n\n`;
		}

		await notify(
			env,
			subscriber.telegram_id,
			text,
			{
				inline_keyboard: [
					[
						{
							text: "🎯 Open my feed",
							callback_data: "list:feed:1",
						},
					],
				],
			}
		);
	}
}

/* =========================================================
	 SAVED SEARCHES
	 ========================================================= */

async function notifySavedSearches(
	env: Env,
	insertedIds: string[]
): Promise<void> {

	const inserted =
		new Set(insertedIds);

	const searches =
		await getNotifiableSearches(env);

	for (const search of searches) {

		const result =
			await searchConferences(env, search.query, 1, 50);

		const matches =
			result.rows.filter(row => inserted.has(row.id));

		if (!matches.length) {
			continue;
		}

		const isNew =
			await claimNotification(
				env,
				search.telegram_id,
				"saved_search",
				`${search.id}:${matches
					.map(match => match.id)
					.sort()
					.join(",")}`.slice(0, 200)
			);

		if (!isNew) {
			continue;
		}

		const user =
			await getUser(env, search.telegram_id);

		const timezone =
			user?.timezone ?? "UTC";

		let text =
			`🔎 <b>New match for “${escapeHtml(search.query)}”</b>\n\n`;

		for (const conference of matches.slice(0, 10)) {

			text +=
				`• <b>${escapeHtml(
					`${conference.title} ${conference.year}`
				)}</b>\n` +
				`  📅 ${escapeHtml(
					formatDate(conference.deadline_utc, timezone)
				)}\n\n`;
		}

		const sent =
			await notify(
				env,
				search.telegram_id,
				text,
				{
					inline_keyboard: [
						[
							{
								text: "🔎 Run this search",
								callback_data: `runsearch:${search.id}`,
							},
						],
					],
				}
			);

		if (sent) {
			await markSearchNotified(env, search.id);
		}
	}
}

/* =========================================================
	 AUTOMATIC REMINDERS
	 ========================================================= */

/**
 * Creates the reminder a user asked for implicitly by turning
 * on auto-reminders, for everything they have saved.
 */
export async function processAutoReminders(
	env: Env
): Promise<void> {

	const pending =
		await getPendingAutoReminders(env);

	for (const entry of pending) {

		const remindAt =
			new Date(
				new Date(entry.deadline_utc).getTime() -
				entry.auto_reminder_days * 86_400_000
			);

		/*
		 * If the offset has already passed, there is nothing
		 * useful to schedule.
		 */
		if (remindAt.getTime() <= Date.now()) {
			continue;
		}

		try {

			await createReminder(
				env,
				entry.telegram_id,
				entry.conference_id,
				entry.auto_reminder_days,
				remindAt.toISOString(),
				"paper",
				true
			);

		} catch (error) {

			console.error(
				"Auto reminder failed:",
				entry.telegram_id,
				entry.conference_id,
				error
			);
		}
	}
}

/* =========================================================
	 REMINDER DELIVERY
	 ========================================================= */

export async function processReminders(
	env: Env
): Promise<void> {

	const reminders =
		await getDueReminders(env);

	for (const reminder of reminders) {

		/*
		 * Held, not dropped: the next run picks it up once the
		 * quiet window has passed.
		 */
		if (
			isQuiet(
				reminder.timezone,
				reminder.quiet_hours_start,
				reminder.quiet_hours_end
			)
		) {
			continue;
		}

		const topics =
			parseTopics(reminder.topics);

		const target =
			reminder.kind === "abstract"
				? reminder.abstract_deadline_utc
				: reminder.kind === "event"
					? reminder.start
					: reminder.deadline_utc;

		const label =
			REMINDER_KIND_LABELS[reminder.kind] ?? "Deadline";

		const text =
			`🔔 <b>${escapeHtml(label)} reminder</b>\n\n` +
			`📌 <b>${escapeHtml(
				`${reminder.title} ${reminder.year}`
			)}</b>\n\n` +
			`📅 <code>${escapeHtml(
				formatDate(target, reminder.timezone, true)
			)}</code>\n` +
			`⏳ <b>${escapeHtml(remaining(target))}</b>\n\n` +
			`📍 ${escapeHtml(reminder.place || "TBA")}\n` +
			(topics.length
				? `🏷 ${escapeHtml(topics.join(", "))}\n`
				: "");

		const buttons: {
			text: string;
			url?: string;
			callback_data?: string;
		}[][] = [
			[
				{
					text: "📌 Open",
					callback_data: `conf:${reminder.conference_id}`,
				},
				{
					text: "🔕 Mute",
					callback_data: `mute:${reminder.conference_id}`,
				},
			],
		];

		if (reminder.link) {

			buttons.unshift([
				{
					text: "🌐 Official website",
					url: reminder.link,
				},
			]);
		}

		const sent =
			await notify(
				env,
				reminder.telegram_id,
				text,
				{ inline_keyboard: buttons }
			);

		/*
		 * Only mark sent on success, so a transient failure is
		 * retried rather than silently swallowed.
		 */
		if (sent) {
			await markReminderSent(env, reminder.id);
		}
	}
}

/* =========================================================
	 DIGESTS
	 ========================================================= */

export async function processDigests(
	env: Env
): Promise<void> {

	const now =
		new Date();

	/*
	 * Candidates are filtered on UTC date, then checked against
	 * each user's own clock below.
	 */
	const candidates =
		await getDigestCandidates(
			env,
			now.toISOString().slice(0, 10)
		);

	for (const user of candidates) {

		const timezone =
			user.timezone || "UTC";

		const today =
			localDate(timezone, now);

		if (user.last_digest_date === today) {
			continue;
		}

		/*
		 * The stored hour is UTC, which is what the settings
		 * screen says, so it is compared against UTC.
		 */
		if (now.getUTCHours() !== user.daily_digest_hour_utc) {
			continue;
		}

		if (
			user.digest_frequency === "weekly" &&
			localWeekday(timezone, now) !== user.digest_weekday
		) {
			continue;
		}

		try {

			const feed =
				await getPersonalFeed(env, user.telegram_id, 1, 8);

			if (!feed.rows.length) {

				/*
				 * Nothing to say today; mark it so we do not keep
				 * re-checking every hour.
				 */
				await markDigestSent(env, user.telegram_id, today);
				continue;
			}

			const heading =
				user.digest_frequency === "weekly"
					? "🗓 <b>Your weekly conference digest</b>"
					: "🎯 <b>Your daily conference digest</b>";

			let text =
				`${heading}\n\n`;

			feed.rows.forEach((conference, index) => {

				text +=
					`${index + 1}. <b>${escapeHtml(
						`${conference.title} ${conference.year}`
					)}</b>\n` +
					`   📅 ${escapeHtml(
						formatDate(conference.deadline_utc, timezone)
					)} · ${escapeHtml(
						remaining(conference.deadline_utc)
					)}\n` +
					`   📍 ${escapeHtml(conference.place || "TBA")}\n\n`;
			});

			const chunks =
				chunkMessage(text);

			let delivered = true;

			for (let index = 0; index < chunks.length; index += 1) {

				delivered =
					await notify(
						env,
						user.telegram_id,
						chunks[index],
						index === chunks.length - 1
							? {
								inline_keyboard: [
									[
										{
											text: "🎯 Open my feed",
											callback_data: "list:feed:1",
										},
									],
									[
										{
											text: "⚙️ Digest settings",
											callback_data: "settings:digest",
										},
									],
								],
							}
							: undefined
					);

				if (!delivered) {
					break;
				}
			}

			if (delivered) {
				await markDigestSent(env, user.telegram_id, today);
			}

		} catch (error) {

			console.error(
				"Digest failed:",
				user.telegram_id,
				error
			);
		}
	}
}

/* =========================================================
	 HOUSEKEEPING
	 ========================================================= */

export async function housekeeping(
	env: Env
): Promise<void> {

	await Promise.all([
		sweepCallbackTokens(env),
		sweepProcessedUpdates(env),
		sweepNotificationLog(env),
	]);
}
