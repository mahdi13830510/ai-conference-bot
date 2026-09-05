import {
	Env,
} from "../types";

import {
	sendMessage,
	editMessageText,
} from "../telegram";

import {
	getUser,
	getTopics,
	getLocations,
} from "../database";

import {
	settingsMenu,
	digestFrequencyMenu,
	hourMenu,
	weekdayMenu,
	quietHoursMenu,
	autoReminderMenu,
	sortMenu,
	preferenceTopicsMenu,
	preferenceLocationsMenu,
} from "../ui";

import {
	DIGEST_FREQUENCY_LABELS,
	WEEKDAY_LABELS,
	SORT_LABELS,
} from "../config";

import {
	escapeHtml,
} from "../format";

/**
 * Renders text and markup through the same path whether the
 * screen is being opened or updated in place.
 */
async function render(
	env: Env,
	chatId: number,
	messageId: number | undefined,
	text: string,
	markup: { inline_keyboard: unknown[][] }
): Promise<void> {

	if (messageId) {

		await editMessageText(
			env,
			chatId,
			messageId,
			text,
			markup as never
		);

		return;
	}

	await sendMessage(env, chatId, text, markup as never);
}

export async function showSettings(
	env: Env,
	chatId: number,
	messageId?: number
): Promise<void> {

	const user =
		await getUser(env, String(chatId));

	const frequency =
		user?.digest_frequency ?? "daily";

	const digest =
		user?.daily_digest_enabled && frequency !== "off"
			? `${DIGEST_FREQUENCY_LABELS[frequency]}` +
			(frequency === "weekly"
				? ` on ${WEEKDAY_LABELS[user?.digest_weekday ?? 1]}`
				: "") +
			` at ${user?.daily_digest_hour_utc ?? 9}:00 UTC`
			: "off";

	const quiet =
		user?.quiet_hours_start === null ||
			user?.quiet_hours_start === undefined
			? "off"
			: `${user.quiet_hours_start}:00–${user.quiet_hours_end}:00 ` +
			`(${user.timezone})`;

	const text =
		`⚙️ <b>Settings</b>\n\n` +
		`📨 <b>Digest</b>  ${escapeHtml(digest)}\n` +
		`🌙 <b>Quiet hours</b>  ${escapeHtml(quiet)}\n` +
		`🕐 <b>Timezone</b>  ${escapeHtml(user?.timezone ?? "UTC")}\n` +
		`↕️ <b>Sort</b>  ${escapeHtml(
			SORT_LABELS[user?.sort_preference ?? "deadline"]
		)}\n` +
		`🔔 <b>Auto-remind saved</b>  ${
			user?.auto_reminder_days
				? `${user.auto_reminder_days} days before`
				: "off"
		}\n\n` +
		`<i>Quiet hours hold notifications until morning; ` +
		`nothing is dropped.</i>`;

	await render(
		env,
		chatId,
		messageId,
		text,
		settingsMenu(user)
	);
}

export async function showDigestMenu(
	env: Env,
	chatId: number,
	messageId: number
): Promise<void> {

	const user =
		await getUser(env, String(chatId));

	await render(
		env,
		chatId,
		messageId,
		`📨 <b>Digest frequency</b>\n\n` +
		`A short summary of what is closing soon, drawn from ` +
		`your personalized feed.`,
		digestFrequencyMenu(user?.digest_frequency ?? "daily")
	);
}

export async function showDigestHourMenu(
	env: Env,
	chatId: number,
	messageId: number
): Promise<void> {

	const user =
		await getUser(env, String(chatId));

	await render(
		env,
		chatId,
		messageId,
		`🕘 <b>Digest hour</b>\n\n` +
		`Pick the hour, in UTC, when the digest should arrive. ` +
		`Your local time is <b>${escapeHtml(
			user?.timezone ?? "UTC"
		)}</b>.`,
		hourMenu("digesthour", user?.daily_digest_hour_utc ?? 9)
	);
}

export async function showDigestDayMenu(
	env: Env,
	chatId: number,
	messageId: number
): Promise<void> {

	const user =
		await getUser(env, String(chatId));

	await render(
		env,
		chatId,
		messageId,
		`📆 <b>Weekly digest day</b>`,
		weekdayMenu(user?.digest_weekday ?? 1)
	);
}

export async function showQuietHoursMenu(
	env: Env,
	chatId: number,
	messageId: number
): Promise<void> {

	const user =
		await getUser(env, String(chatId));

	await render(
		env,
		chatId,
		messageId,
		`🌙 <b>Quiet hours</b>\n\n` +
		`Reminders that fall inside this window are held and ` +
		`delivered when it ends, in your timezone ` +
		`(<b>${escapeHtml(user?.timezone ?? "UTC")}</b>).`,
		quietHoursMenu(user?.quiet_hours_start ?? null)
	);
}

export async function showAutoRemindMenu(
	env: Env,
	chatId: number,
	messageId: number
): Promise<void> {

	const user =
		await getUser(env, String(chatId));

	await render(
		env,
		chatId,
		messageId,
		`🔔 <b>Automatic reminders</b>\n\n` +
		`Every conference you save gets a reminder this far ` +
		`ahead of its paper deadline, without asking.`,
		autoReminderMenu(user?.auto_reminder_days ?? null)
	);
}

export async function showSortMenu(
	env: Env,
	chatId: number,
	messageId: number,
	returnTo: string
): Promise<void> {

	const user =
		await getUser(env, String(chatId));

	await render(
		env,
		chatId,
		messageId,
		`↕️ <b>Sort lists by</b>`,
		sortMenu(user?.sort_preference ?? "deadline", returnTo)
	);
}

export async function showTopicPreferences(
	env: Env,
	chatId: number,
	messageId: number
): Promise<void> {

	const selected =
		await getTopics(env, String(chatId));

	await render(
		env,
		chatId,
		messageId,
		`🧠 <b>Your topics</b>\n\n` +
		`These drive your feed, your digest and new-conference ` +
		`alerts.`,
		preferenceTopicsMenu(selected)
	);
}

export async function showLocationPreferences(
	env: Env,
	chatId: number,
	messageId: number
): Promise<void> {

	const selected =
		await getLocations(env, String(chatId));

	await render(
		env,
		chatId,
		messageId,
		`🌍 <b>Your locations</b>\n\n` +
		`Conferences in these places are ranked higher in your ` +
		`feed.`,
		preferenceLocationsMenu(selected)
	);
}
