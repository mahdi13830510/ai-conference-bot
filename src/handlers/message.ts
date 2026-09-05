import {
	Env,
	TelegramUpdate,
} from "../types";

import {
	sendMessage,
	sendTypingAction,
} from "../telegram";

import {
	setTimezone,
} from "../database";

import {
	topicsMenu,
	locationsMenu,
} from "../ui";

import {
	ensureUser,
} from "../users";

import {
	showList,
} from "../views/list";

import {
	showConference,
} from "../views/conference";

import {
	showStart,
	showReminders,
	showSettings,
	showHelp,
} from "../views/menu";

import {
	handleAdmin,
} from "./admin";

/**
 * Parses and dispatches slash commands sent to the bot.
 */

export async function handleMessage(
	env: Env,
	message: NonNullable<
		TelegramUpdate["message"]
	>
) {

	const chatId =
		message.chat.id;

	const user =
		message.from;

	await ensureUser(
		env,
		user
	);

	const text =
		message.text?.trim() || "";

	if (!text) {
		return;
	}

	/*
	 * Remove bot username:
	 *
	 * /start@MyBot
	 */

	const [rawCommand, ...args] =
		text.split(/\s+/);

	const command =
		rawCommand
			.split("@")[0]
			.toLowerCase();

	const argument =
		args.join(" ").trim();

	if (
		command === "/start"
	) {

		/*
		 * Deep link:
		 *
		 * /start conf_icml27
		 */

		if (
			argument.startsWith(
				"conf_"
			)
		) {

			const conferenceId =
				argument.substring(
					"conf_".length
				);

			await showConference(
				env,
				chatId,
				conferenceId
			);

			return;
		}

		await showStart(
			env,
			chatId
		);

		return;
	}

	if (
		command === "/upcoming"
	) {

		await sendTypingAction(
			env,
			chatId
		);

		await showList(
			env,
			chatId,
			"upcoming",
			undefined,
			1
		);

		return;
	}

	if (
		command === "/search"
	) {

		if (!argument) {

			await sendMessage(
				env,
				chatId,
				`🔎 Search conferences

Use:

/search federated learning

or:

/search privacy`
			);

			return;
		}

		await showList(
			env,
			chatId,
			"search",
			argument,
			1
		);

		return;
	}

	if (
		command === "/topics"
	) {

		await sendMessage(
			env,
			chatId,
			"🏷 Browse by Topic",
			topicsMenu()
		);

		return;
	}

	if (
		command === "/locations"
	) {

		await sendMessage(
			env,
			chatId,
			"🌍 Browse by Location",
			locationsMenu()
		);

		return;
	}

	if (
		command === "/saved"
	) {

		await showList(
			env,
			chatId,
			"saved",
			String(chatId),
			1
		);

		return;
	}

	if (
		command === "/reminders"
	) {

		await showReminders(
			env,
			chatId
		);

		return;
	}

	if (
		command === "/myfeed"
	) {

		await showList(
			env,
			chatId,
			"feed",
			String(chatId),
			1
		);

		return;
	}

	if (
		command === "/settings"
	) {

		await showSettings(
			env,
			chatId
		);

		return;
	}

	if (
		command === "/help"
	) {

		await showHelp(
			env,
			chatId
		);

		return;
	}

	/*
	 * Location shortcut:
	 *
	 * /location Germany
	 */

	if (
		command === "/location"
	) {

		if (!argument) {

			await sendMessage(
				env,
				chatId,
				"Example:\n/location Germany"
			);

			return;
		}

		await showList(
			env,
			chatId,
			"location",
			argument,
			1
		);

		return;
	}

	/*
	 * Deadline shortcut:
	 *
	 * /deadline 30
	 */

	if (
		command === "/deadline"
	) {

		const days =
			Number(argument) || 30;

		await showList(
			env,
			chatId,
			"deadline",
			String(
				Math.min(
					Math.max(
						days,
						1
					),
					365
				)
			),
			1
		);

		return;
	}

	/*
	 * Timezone:
	 *
	 * /timezone Europe/Amsterdam
	 */

	if (
		command === "/timezone"
	) {

		if (!argument) {

			await sendMessage(
				env,
				chatId,
				"Example:\n/timezone Europe/Amsterdam"
			);

			return;
		}

		try {

			new Intl.DateTimeFormat(
				"en-US",
				{
					timeZone:
						argument,
				}
			);

			await setTimezone(
				env,
				String(chatId),
				argument
			);

			await sendMessage(
				env,
				chatId,
				`✅ Timezone set to ${argument}`
			);

		} catch {

			await sendMessage(
				env,
				chatId,
				"❌ Invalid timezone.\n\nExample:\n/timezone Europe/Amsterdam"
			);
		}

		return;
	}

	/*
	 * Admin
	 */

	if (
		command === "/admin"
	) {

		await handleAdmin(
			env,
			chatId,
			argument
		);

		return;
	}

	/*
	 * Ignore normal group text.
	 *
	 * Users should use commands or inline mode.
	 */

	await sendMessage(
		env,
		chatId,
		"I didn't recognize that command.\n\nTry /start."
	);
}
