import {
	Env,
	TelegramCallbackQuery,
	ReminderKind,
	SortPreference,
} from "../types";

import {
	editMessageText,
	answerCallbackQuery,
	TelegramError,
} from "../telegram";

import {
	getUser,
	saveConference,
	unsaveConference,
	muteConference,
	unmuteConference,
	setDigestFrequency,
	setDigestHour,
	setDigestWeekday,
	setQuietHours,
	setAutoReminderDays,
	setEscalating,
	setAlertNewConferences,
	setAlertDeadlineChanges,
	setSortPreference,
	toggleTopic,
	toggleLocation,
	deleteReminderById,
	deleteSavedSearch,
	listSavedSearches,
	getCallbackToken,
} from "../database";

import {
	topicsMenu,
	locationsMenu,
	rankMenu,
	formatMenu,
} from "../ui";

import {
	showList,
} from "../views/list";

import {
	showConference,
	showReminderMenu,
	createConferenceReminder,
} from "../views/conference";

import {
	showMainMenu,
	showReminders,
	showSavedSearches,
	showTimeline,
	showHelp,
	promptFor,
} from "../views/menu";

import {
	showSettings,
	showDigestMenu,
	showDigestHourMenu,
	showDigestDayMenu,
	showQuietHoursMenu,
	showAutoRemindMenu,
	showSortMenu,
	showTopicPreferences,
	showLocationPreferences,
} from "../views/settings";

import {
	sendCalendar,
} from "../views/export";

/**
 * Parses a list route such as "list:topic:CV:2" into its parts.
 */
function parseListRoute(
	data: string,
	userId: string
): { mode: string; value?: string; page: number } {

	const parts =
		data.split(":");

	const mode =
		parts[1];

	if (
		mode === "upcoming" ||
		mode === "saved" ||
		mode === "feed"
	) {

		return {
			mode,
			value:
				mode === "saved" || mode === "feed"
					? userId
					: undefined,
			page: Number(parts[2]) || 1,
		};
	}

	return {
		mode,
		value: decodeURIComponent(parts[2] ?? ""),
		page: Number(parts[3]) || 1,
	};
}

export async function handleCallback(
	env: Env,
	callback: TelegramCallbackQuery
): Promise<void> {

	const message =
		callback.message;

	if (!message) {
		await answerCallbackQuery(env, callback.id);
		return;
	}

	const chatId =
		message.chat.id;

	const messageId =
		message.message_id;

	const userId =
		String(callback.from.id);

	let data =
		callback.data || "";

	/*
	 * callback_data is capped at 64 bytes; anything longer was
	 * stored server-side and is referenced by a short token.
	 */
	if (data.startsWith("tok:")) {

		const payload =
			await getCallbackToken(env, data.slice(4));

		if (!payload) {

			await answerCallbackQuery(
				env,
				callback.id,
				"That button has expired. Open the menu again.",
				true
			);

			return;
		}

		data = payload;
	}

	/*
	 * A silent acknowledgement stops the client spinner. Actions
	 * that deserve feedback answer again with a toast, which
	 * Telegram accepts.
	 */
	if (data !== "noop") {
		await answerCallbackQuery(env, callback.id);
	} else {
		await answerCallbackQuery(env, callback.id);
		return;
	}

	try {
		await route(env, callback, data, chatId, messageId, userId);

	} catch (error) {

		console.error("Callback failed:", data, error);

		await answerCallbackQuery(
			env,
			callback.id,
			error instanceof TelegramError
				? "Telegram rejected that action. Try again."
				: "Something went wrong. Try again.",
			true
		);
	}
}

async function route(
	env: Env,
	callback: TelegramCallbackQuery,
	data: string,
	chatId: number,
	messageId: number,
	userId: string
): Promise<void> {

	/* ---------- navigation ---------- */

	if (data === "menu:main") {
		await showMainMenu(env, chatId, messageId);
		return;
	}

	if (data === "back") {

		const user =
			await getUser(env, userId);

		const route =
			user?.last_list ?? "list:upcoming:1";

		const parsed =
			parseListRoute(route, userId);

		await showList(
			env,
			chatId,
			parsed.mode,
			parsed.value,
			parsed.page,
			messageId,
			user
		);

		return;
	}

	if (data === "menu:topics") {

		await editMessageText(
			env,
			chatId,
			messageId,
			"🏷 <b>Browse by topic</b>",
			topicsMenu()
		);

		return;
	}

	if (data === "menu:locations") {

		await editMessageText(
			env,
			chatId,
			messageId,
			"🌍 <b>Browse by location</b>",
			locationsMenu()
		);

		return;
	}

	if (data === "menu:rank") {

		await editMessageText(
			env,
			chatId,
			messageId,
			"🏅 <b>Browse by CORE rank</b>\n\n" +
			"<i>Rankings come from the CORE portal. Newer venues " +
			"and workshops are often unranked.</i>",
			rankMenu()
		);

		return;
	}

	if (data === "menu:format") {

		await editMessageText(
			env,
			chatId,
			messageId,
			"🔀 <b>Browse by format</b>",
			formatMenu()
		);

		return;
	}

	if (data.startsWith("menu:sort:")) {

		await showSortMenu(
			env,
			chatId,
			messageId,
			data.slice("menu:sort:".length)
		);

		return;
	}

	/* ---------- lists ---------- */

	if (data.startsWith("list:")) {

		const parsed =
			parseListRoute(data, userId);

		await showList(
			env,
			chatId,
			parsed.mode,
			parsed.value,
			parsed.page,
			messageId
		);

		return;
	}

	if (data.startsWith("similar:")) {

		await showList(
			env,
			chatId,
			"similar",
			data.slice("similar:".length),
			1,
			messageId
		);

		return;
	}

	if (data === "timeline") {
		await showTimeline(env, chatId, messageId);
		return;
	}

	/* ---------- conference ---------- */

	if (data.startsWith("conf:")) {

		await showConference(
			env,
			chatId,
			data.slice("conf:".length),
			messageId
		);

		return;
	}

	if (data.startsWith("save:") || data.startsWith("unsave:")) {

		const saving =
			data.startsWith("save:");

		const conferenceId =
			data.slice(saving ? 5 : 7);

		if (saving) {
			await saveConference(env, userId, conferenceId);
		} else {
			await unsaveConference(env, userId, conferenceId);
		}

		await answerCallbackQuery(
			env,
			callback.id,
			saving ? "⭐ Saved" : "Removed from saved"
		);

		await showConference(env, chatId, conferenceId, messageId);

		return;
	}

	if (data.startsWith("mute:") || data.startsWith("unmute:")) {

		const muting =
			data.startsWith("mute:");

		const conferenceId =
			data.slice(muting ? 5 : 7);

		if (muting) {
			await muteConference(env, userId, conferenceId);
		} else {
			await unmuteConference(env, userId, conferenceId);
		}

		await answerCallbackQuery(
			env,
			callback.id,
			muting
				? "🔕 Muted — no alerts for this one"
				: "🔔 Unmuted"
		);

		await showConference(env, chatId, conferenceId, messageId);

		return;
	}

	/* ---------- reminders ---------- */

	if (data.startsWith("remind:")) {

		await showReminderMenu(
			env,
			chatId,
			data.slice("remind:".length),
			messageId
		);

		return;
	}

	if (data.startsWith("setrem:")) {

		const [, conferenceId, kind, offset] =
			data.split(":");

		await createConferenceReminder(
			env,
			chatId,
			conferenceId,
			(kind as ReminderKind) ?? "paper",
			offset === "escalate" ? "escalate" : Number(offset)
		);

		return;
	}

	if (data.startsWith("delrem:")) {

		const removed =
			await deleteReminderById(
				env,
				userId,
				Number(data.slice("delrem:".length))
			);

		await answerCallbackQuery(
			env,
			callback.id,
			removed ? "🗑 Reminder deleted" : "Already gone"
		);

		await showReminders(env, chatId, messageId);

		return;
	}

	if (data === "reminders") {
		await showReminders(env, chatId, messageId);
		return;
	}

	/* ---------- saved searches ---------- */

	if (data === "savedsearches") {
		await showSavedSearches(env, chatId, messageId);
		return;
	}

	if (data.startsWith("runsearch:")) {

		const searches =
			await listSavedSearches(env, userId);

		const search =
			searches.find(
				entry =>
					entry.id === Number(data.slice("runsearch:".length))
			);

		if (!search) {

			await answerCallbackQuery(
				env,
				callback.id,
				"That search no longer exists.",
				true
			);

			return;
		}

		await showList(
			env,
			chatId,
			"search",
			search.query,
			1,
			messageId
		);

		return;
	}

	if (data.startsWith("delsearch:")) {

		await deleteSavedSearch(
			env,
			userId,
			Number(data.slice("delsearch:".length))
		);

		await answerCallbackQuery(env, callback.id, "🗑 Deleted");

		await showSavedSearches(env, chatId, messageId);

		return;
	}

	/* ---------- prompts ---------- */

	if (data.startsWith("prompt:")) {

		await promptFor(
			env,
			chatId,
			data.slice("prompt:".length) as
			"search" | "timezone" | "save_search"
		);

		return;
	}

	/* ---------- calendar export ---------- */

	if (data.startsWith("ics:")) {

		await sendCalendar(
			env,
			chatId,
			data.slice("ics:".length)
		);

		await answerCallbackQuery(env, callback.id, "📆 Sent");

		return;
	}

	/* ---------- settings ---------- */

	if (data === "settings") {
		await showSettings(env, chatId, messageId);
		return;
	}

	if (data === "settings:digest") {
		await showDigestMenu(env, chatId, messageId);
		return;
	}

	if (data === "settings:digesthour") {
		await showDigestHourMenu(env, chatId, messageId);
		return;
	}

	if (data === "settings:digestday") {
		await showDigestDayMenu(env, chatId, messageId);
		return;
	}

	if (data === "settings:quiet") {
		await showQuietHoursMenu(env, chatId, messageId);
		return;
	}

	if (data === "settings:autoremind") {
		await showAutoRemindMenu(env, chatId, messageId);
		return;
	}

	if (data === "settings:topics") {
		await showTopicPreferences(env, chatId, messageId);
		return;
	}

	if (data === "settings:locations") {
		await showLocationPreferences(env, chatId, messageId);
		return;
	}

	if (data.startsWith("digest:")) {

		await setDigestFrequency(
			env,
			userId,
			data.slice("digest:".length) as "daily" | "weekly" | "off"
		);

		await showSettings(env, chatId, messageId);

		return;
	}

	if (data.startsWith("digesthour:")) {

		await setDigestHour(
			env,
			userId,
			Number(data.slice("digesthour:".length))
		);

		await showSettings(env, chatId, messageId);

		return;
	}

	if (data.startsWith("digestday:")) {

		await setDigestWeekday(
			env,
			userId,
			Number(data.slice("digestday:".length))
		);

		await showSettings(env, chatId, messageId);

		return;
	}

	if (data.startsWith("quiet:")) {

		const value =
			data.slice("quiet:".length);

		if (value === "off") {
			await setQuietHours(env, userId, null, null);

		} else {

			const [start, end] =
				value.split(":").map(Number);

			await setQuietHours(env, userId, start, end);
		}

		await showSettings(env, chatId, messageId);

		return;
	}

	if (data.startsWith("autoremind:")) {

		const value =
			data.slice("autoremind:".length);

		await setAutoReminderDays(
			env,
			userId,
			value === "off" ? null : Number(value)
		);

		await showSettings(env, chatId, messageId);

		return;
	}

	if (data.startsWith("sort:")) {

		await setSortPreference(
			env,
			userId,
			data.slice("sort:".length) as SortPreference
		);

		await answerCallbackQuery(env, callback.id, "↕️ Sort updated");

		await showSettings(env, chatId, messageId);

		return;
	}

	if (data.startsWith("toggle:")) {

		const user =
			await getUser(env, userId);

		const which =
			data.slice("toggle:".length);

		if (which === "escalating") {
			await setEscalating(env, userId, !user?.escalating_enabled);

		} else if (which === "newconf") {
			await setAlertNewConferences(
				env,
				userId,
				!user?.alert_new_conferences
			);

		} else if (which === "changes") {
			await setAlertDeadlineChanges(
				env,
				userId,
				!user?.alert_deadline_changes
			);
		}

		await showSettings(env, chatId, messageId);

		return;
	}

	if (data.startsWith("pref:topic:")) {

		await toggleTopic(
			env,
			userId,
			data.slice("pref:topic:".length)
		);

		await showTopicPreferences(env, chatId, messageId);

		return;
	}

	if (data.startsWith("pref:location:")) {

		await toggleLocation(
			env,
			userId,
			data.slice("pref:location:".length)
		);

		await showLocationPreferences(env, chatId, messageId);

		return;
	}

	if (data === "help") {
		await showHelp(env, chatId, messageId);
		return;
	}
}
