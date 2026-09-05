import {
	Env,
	TelegramCallbackQuery,
} from "../types";

import {
	editMessageText,
	answerCallbackQuery,
} from "../telegram";

import {
	saveConference,
	unsaveConference,
	setDigest,
	getTopics,
	toggleTopic,
	getLocations,
	toggleLocation,
} from "../database";

import {
	mainMenu,
	topicsMenu,
	locationsMenu,
	preferenceTopicsMenu,
	preferenceLocationsMenu,
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
	showSettings,
	showHelp,
} from "../views/menu";

/**
 * Routes an inline-keyboard callback to the matching view.
 */

export async function handleCallback(
	env: Env,
	callback: TelegramCallbackQuery
) {

	await answerCallbackQuery(
		env,
		callback.id
	);

	const data =
		callback.data || "";

	const message =
		callback.message;

	if (!message) {
		return;
	}

	const chatId =
		message.chat.id;

	const messageId =
		message.message_id;

	const userId =
		String(
			callback.from.id
		);

	/*
	 * noop
	 */

	if (data === "noop") {
		return;
	}

	/*
	 * Main menu
	 */

	if (
		data === "menu:main"
	) {

		await editMessageText(
			env,
			chatId,
			messageId,
			`🤖 AI Conference Deadlines

Choose an option:`,
			mainMenu()
		);

		return;
	}

	/*
	 * Topics menu
	 */

	if (
		data === "menu:topics"
	) {

		await editMessageText(
			env,
			chatId,
			messageId,
			"🏷 Browse by Topic",
			topicsMenu()
		);

		return;
	}

	/*
	 * Locations menu
	 */

	if (
		data === "menu:locations"
	) {

		await editMessageText(
			env,
			chatId,
			messageId,
			"🌍 Browse by Location",
			locationsMenu()
		);

		return;
	}

	/*
	 * List callbacks
	 */

	if (
		data.startsWith(
			"list:"
		)
	) {

		const parts =
			data.split(":");

		const mode =
			parts[1];

		let value:
			string | undefined;

		let page =
			1;

		if (
			mode === "upcoming" ||
			mode === "saved" ||
			mode === "feed"
		) {

			page =
				Number(
					parts[2]
				) || 1;

			value =
				mode === "saved" ||
					mode === "feed"
					? userId
					: undefined;

		} else {

			page =
				Number(
					parts[3]
				) || 1;

			value =
				decodeURIComponent(
					parts[2] || ""
				);
		}

		await showList(
			env,
			chatId,
			mode,
			value,
			page,
			messageId
		);

		return;
	}

	/*
	 * Conference
	 */

	if (
		data.startsWith(
			"conf:"
		)
	) {

		const conferenceId =
			data.substring(
				"conf:".length
			);

		await showConference(
			env,
			chatId,
			conferenceId,
			messageId
		);

		return;
	}

	/*
	 * Save
	 */

	if (
		data.startsWith(
			"save:"
		)
	) {

		const conferenceId =
			data.substring(
				"save:".length
			);

		await saveConference(
			env,
			userId,
			conferenceId
		);

		await answerCallbackQuery(
			env,
			callback.id,
			"⭐ Saved!"
		);

		await showConference(
			env,
			chatId,
			conferenceId,
			messageId
		);

		return;
	}

	/*
	 * Unsave
	 */

	if (
		data.startsWith(
			"unsave:"
		)
	) {

		const conferenceId =
			data.substring(
				"unsave:".length
			);

		await unsaveConference(
			env,
			userId,
			conferenceId
		);

		await answerCallbackQuery(
			env,
			callback.id,
			"Removed from saved."
		);

		await showConference(
			env,
			chatId,
			conferenceId,
			messageId
		);

		return;
	}

	/*
	 * Reminder menu
	 */

	if (
		data.startsWith(
			"remind:"
		)
	) {

		const conferenceId =
			data.substring(
				"remind:".length
			);

		await showReminderMenu(
			env,
			chatId,
			conferenceId
		);

		return;
	}

	/*
	 * Set reminder
	 */

	if (
		data.startsWith(
			"setrem:"
		)
	) {

		const parts =
			data.split(":");

		const conferenceId =
			parts[1];

		const days =
			Number(parts[2]);

		await createConferenceReminder(
			env,
			chatId,
			conferenceId,
			days
		);

		return;
	}

	/*
	 * Settings
	 */

	if (
		data === "settings"
	) {

		await showSettings(
			env,
			chatId
		);

		return;
	}

	/*
	 * Digest
	 */

	if (
		data === "digest:on"
	) {

		await setDigest(
			env,
			userId,
			true
		);

		await showSettings(
			env,
			chatId
		);

		return;
	}

	if (
		data === "digest:off"
	) {

		await setDigest(
			env,
			userId,
			false
		);

		await showSettings(
			env,
			chatId
		);

		return;
	}

	/*
	 * Topic preferences
	 */

	if (
		data === "settings:topics"
	) {

		const selected =
			await getTopics(
				env,
				userId
			);

		await editMessageText(
			env,
			chatId,
			messageId,
			"🧠 Choose your preferred topics:",
			preferenceTopicsMenu(
				selected
			)
		);

		return;
	}

	/*
	 * Location preferences
	 */

	if (
		data === "settings:locations"
	) {

		const selected =
			await getLocations(
				env,
				userId
			);

		await editMessageText(
			env,
			chatId,
			messageId,
			"🌍 Choose your preferred locations:",
			preferenceLocationsMenu(
				selected
			)
		);

		return;
	}

	/*
	 * Topic toggle
	 */

	if (
		data.startsWith(
			"pref:topic:"
		)
	) {

		const topic =
			data.substring(
				"pref:topic:".length
			);

		await toggleTopic(
			env,
			userId,
			topic
		);

		const selected =
			await getTopics(
				env,
				userId
			);

		await editMessageText(
			env,
			chatId,
			messageId,
			"🧠 Choose your preferred topics:",
			preferenceTopicsMenu(
				selected
			)
		);

		return;
	}

	/*
	 * Location toggle
	 */

	if (
		data.startsWith(
			"pref:location:"
		)
	) {

		const location =
			data.substring(
				"pref:location:".length
			);

		await toggleLocation(
			env,
			userId,
			location
		);

		const selected =
			await getLocations(
				env,
				userId
			);

		await editMessageText(
			env,
			chatId,
			messageId,
			"🌍 Choose your preferred locations:",
			preferenceLocationsMenu(
				selected
			)
		);

		return;
	}

	/*
	 * Help
	 */

	if (
		data === "help"
	) {

		await showHelp(
			env,
			chatId
		);

		return;
	}
}
