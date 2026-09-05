import {
	Env,
	TelegramUpdate,
	User,
} from "../types";

import {
	sendMessage,
	sendChatAction,
} from "../telegram";

import {
	getUser,
	setTimezone,
	takePendingInput,
	addSavedSearch,
} from "../database";

import {
	topicsMenu,
	locationsMenu,
	rankMenu,
	formatMenu,
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
	showHelp,
	showTimeline,
	showSavedSearches,
	promptFor,
} from "../views/menu";

import {
	showSettings,
} from "../views/settings";

import {
	sendCalendar,
} from "../views/export";

import {
	handleAdmin,
} from "./admin";

import {
	escapeHtml,
} from "../format";

/**
 * Labels on the persistent bottom keyboard arrive as ordinary
 * text, so they are mapped to the same actions as the commands.
 */
const KEYBOARD_SHORTCUTS: Record<string, string> = {
	"📅 Upcoming": "/upcoming",
	"🎯 My Feed": "/myfeed",
	"🔎 Search": "/search",
	"⭐ Saved": "/saved",
	"🔔 Reminders": "/reminders",
	"⚙️ Settings": "/settings",
};

export async function handleMessage(
	env: Env,
	message: NonNullable<TelegramUpdate["message"]>
): Promise<void> {

	const chatId =
		message.chat.id;

	await ensureUser(env, message.from);

	const raw =
		message.text?.trim() || "";

	if (!raw) {
		return;
	}

	const userId =
		String(chatId);

	/*
	 * A reply to one of the bot's force-reply prompts is
	 * answered as that prompt, not as a command.
	 */
	if (!raw.startsWith("/")) {

		const pending =
			await takePendingInput(env, userId);

		if (pending) {
			await handlePendingInput(env, chatId, pending, raw);
			return;
		}
	}

	const text =
		KEYBOARD_SHORTCUTS[raw] ?? raw;

	/*
	 * Plain text is treated as a search. It is what people
	 * expect, and it beats scolding them about syntax.
	 */
	if (!text.startsWith("/")) {

		await sendChatAction(env, chatId);

		await showList(env, chatId, "search", text, 1);

		return;
	}

	const [rawCommand, ...args] =
		text.split(/\s+/);

	const command =
		rawCommand.split("@")[0].toLowerCase();

	const argument =
		args.join(" ").trim();

	await dispatch(env, chatId, command, argument);
}

async function handlePendingInput(
	env: Env,
	chatId: number,
	kind: string,
	value: string
): Promise<void> {

	if (kind === "search") {
		await showList(env, chatId, "search", value, 1);
		return;
	}

	if (kind === "save_search") {

		await addSavedSearch(env, String(chatId), value);

		await sendMessage(
			env,
			chatId,
			`🔎 Watching <code>${escapeHtml(value)}</code>.\n\n` +
			`You will hear from me when a newly listed conference ` +
			`matches it.`
		);

		await showSavedSearches(env, chatId);

		return;
	}

	if (kind === "timezone") {
		await applyTimezone(env, chatId, value);
	}
}

async function applyTimezone(
	env: Env,
	chatId: number,
	value: string
): Promise<void> {

	try {

		/*
		 * Intl throws on an unknown zone, which is the cheapest
		 * available validation.
		 */
		new Intl.DateTimeFormat("en-US", { timeZone: value });

		await setTimezone(env, String(chatId), value);

		await sendMessage(
			env,
			chatId,
			`✅ Timezone set to <b>${escapeHtml(value)}</b>.\n\n` +
			`All deadlines are now shown in your local time.`
		);

	} catch {

		await sendMessage(
			env,
			chatId,
			`❌ <b>${escapeHtml(value)}</b> is not a timezone I ` +
			`recognise.\n\nUse an IANA name, for example ` +
			`<code>Europe/Amsterdam</code>.`
		);
	}
}

async function dispatch(
	env: Env,
	chatId: number,
	command: string,
	argument: string
): Promise<void> {

	switch (command) {

		case "/start": {

			/*
			 * Deep link: /start conf_icml27
			 */
			if (argument.startsWith("conf_")) {

				await showConference(
					env,
					chatId,
					argument.slice("conf_".length)
				);

				return;
			}

			await showStart(env, chatId);
			return;
		}

		case "/upcoming":
			await sendChatAction(env, chatId);
			await showList(env, chatId, "upcoming", undefined, 1);
			return;

		case "/myfeed":
			await sendChatAction(env, chatId);
			await showList(env, chatId, "feed", String(chatId), 1);
			return;

		case "/saved":
			await showList(env, chatId, "saved", String(chatId), 1);
			return;

		case "/search":

			if (!argument) {
				await promptFor(env, chatId, "search");
				return;
			}

			await sendChatAction(env, chatId);
			await showList(env, chatId, "search", argument, 1);
			return;

		case "/topics":
			await sendMessage(
				env,
				chatId,
				"🏷 <b>Browse by topic</b>",
				topicsMenu()
			);
			return;

		case "/locations":
			await sendMessage(
				env,
				chatId,
				"🌍 <b>Browse by location</b>",
				locationsMenu()
			);
			return;

		case "/rank": {

			const rank =
				argument.trim().toUpperCase();

			if (!["A*", "A", "B", "C"].includes(rank)) {

				await sendMessage(
					env,
					chatId,
					"🏅 <b>Browse by CORE rank</b>",
					rankMenu()
				);

				return;
			}

			await showList(env, chatId, "rank", rank, 1);
			return;
		}

		case "/format": {

			const format =
				argument.trim().toLowerCase();

			if (
				!["in-person", "virtual", "hybrid"].includes(format)
			) {

				await sendMessage(
					env,
					chatId,
					"🔀 <b>Browse by format</b>",
					formatMenu()
				);

				return;
			}

			await showList(env, chatId, "format", format, 1);
			return;
		}

		case "/location":

			if (!argument) {

				await sendMessage(
					env,
					chatId,
					"Example:\n<code>/location Germany</code>",
					locationsMenu()
				);

				return;
			}

			await showList(env, chatId, "location", argument, 1);
			return;

		case "/deadline": {

			const days =
				Math.min(Math.max(Number(argument) || 30, 1), 365);

			await showList(env, chatId, "deadline", String(days), 1);
			return;
		}

		case "/nextweek":
			await showList(env, chatId, "deadline", "7", 1);
			return;

		case "/thismonth":
			await showList(env, chatId, "deadline", "30", 1);
			return;

		case "/timeline":
			await showTimeline(env, chatId);
			return;

		case "/reminders":
			await showReminders(env, chatId);
			return;

		case "/watch":

			if (!argument) {
				await promptFor(env, chatId, "save_search");
				return;
			}

			await addSavedSearch(env, String(chatId), argument);

			await sendMessage(
				env,
				chatId,
				`🔎 Watching <code>${escapeHtml(argument)}</code>.`
			);

			await showSavedSearches(env, chatId);
			return;

		case "/watches":
			await showSavedSearches(env, chatId);
			return;

		case "/export":
			await sendCalendar(env, chatId, "saved");
			return;

		case "/settings":
			await showSettings(env, chatId);
			return;

		case "/timezone":

			if (!argument) {
				await promptFor(env, chatId, "timezone");
				return;
			}

			await applyTimezone(env, chatId, argument);
			return;

		case "/help":
			await showHelp(env, chatId);
			return;

		case "/admin":
			await handleAdmin(env, chatId, argument);
			return;

		default:

			await sendMessage(
				env,
				chatId,
				`I don't know <code>${escapeHtml(command)}</code>.\n\n` +
				`Send /help for the full list, or just type what ` +
				`you are looking for.`
			);
	}
}
