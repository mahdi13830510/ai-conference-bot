import {
	Env,
	User,
} from "../types";

import {
	sendMessage,
	editMessageText,
} from "../telegram";

import {
	getUser,
	listReminders,
	listSavedSearches,
	listSaved,
	getPersonalFeed,
	setPendingInput,
} from "../database";

import {
	mainMenu,
	persistentKeyboard,
	remindersKeyboard,
	savedSearchesKeyboard,
	forceReply,
} from "../ui";

import {
	formatDate,
	timelineText,
	chunkMessage,
	escapeHtml,
} from "../format";

import {
	REMINDER_KIND_LABELS,
} from "../config";

import {
	miniAppUrl,
} from "../miniapp/url";

/* =========================================================
	 START
	 ========================================================= */

const WELCOME =
	`🤖 <b>AI Conference Deadlines</b>\n\n` +
	`Track paper deadlines for AI and ML conferences: search ` +
	`them, filter by topic, location, CORE rank or format, ` +
	`save the ones you care about, and get reminded before ` +
	`they close.\n\n` +
	`Pick something below, or just type to search.`;

export async function showStart(
	env: Env,
	chatId: number
): Promise<void> {

	const url =
		miniAppUrl(env);

	/*
	 * The persistent bar and the inline menu are two different
	 * markups, so the bar is attached to a short second message.
	 */
	await sendMessage(
		env,
		chatId,
		WELCOME,
		mainMenu(url)
	);

	await sendMessage(
		env,
		chatId,
		"Quick actions are pinned below. 👇",
		persistentKeyboard(url),
		{ disableNotification: true }
	);
}

export async function showMainMenu(
	env: Env,
	chatId: number,
	messageId: number
): Promise<void> {

	await editMessageText(
		env,
		chatId,
		messageId,
		WELCOME,
		mainMenu(miniAppUrl(env))
	);
}

/* =========================================================
	 REMINDERS
	 ========================================================= */

export async function showReminders(
	env: Env,
	chatId: number,
	messageId?: number
): Promise<void> {

	const userId =
		String(chatId);

	const [reminders, user] =
		await Promise.all([
			listReminders(env, userId),
			getUser(env, userId),
		]);

	if (!reminders.length) {

		const text =
			`🔔 <b>No reminders yet</b>\n\n` +
			`Open a conference and press <b>Remind me</b>, or ` +
			`turn on automatic reminders for everything you save ` +
			`in ⚙️ Settings.`;

		const markup = {
			inline_keyboard: [
				[
					{
						text: "📅 Upcoming Conferences",
						callback_data: "list:upcoming:1",
					},
				],
				[
					{
						text: "⚙️ Settings",
						callback_data: "settings",
					},
					{
						text: "🏠 Menu",
						callback_data: "menu:main",
					},
				],
			],
		};

		if (messageId) {
			await editMessageText(env, chatId, messageId, text, markup);
		} else {
			await sendMessage(env, chatId, text, markup);
		}

		return;
	}

	const timezone =
		user?.timezone ?? "UTC";

	let text =
		`🔔 <b>Your reminders</b>\n\n` +
		`<i>Tap one to delete it.</i>\n\n`;

	for (const reminder of reminders) {

		text +=
			`• <b>${escapeHtml(
				`${reminder.title} ${reminder.year}`
			)}</b>\n` +
			`  ${escapeHtml(
				REMINDER_KIND_LABELS[reminder.kind] ?? reminder.kind
			)} · ${reminder.days_before} days before\n` +
			`  🔔 ${escapeHtml(
				formatDate(reminder.remind_at, timezone, true)
			)}`;

		if (reminder.auto) {
			text += `  <i>(auto)</i>`;
		}

		text += `\n\n`;
	}

	const markup =
		remindersKeyboard(reminders);

	if (messageId) {
		await editMessageText(env, chatId, messageId, text, markup);
	} else {
		await sendMessage(env, chatId, text, markup);
	}
}

/* =========================================================
	 SAVED SEARCHES
	 ========================================================= */

export async function showSavedSearches(
	env: Env,
	chatId: number,
	messageId?: number
): Promise<void> {

	const searches =
		await listSavedSearches(env, String(chatId));

	const text =
		searches.length
			? `🔎 <b>Saved searches</b>\n\n` +
			`You are alerted when a new conference matches one ` +
			`of these.\n\n` +
			searches
				.map(
					search =>
						`• <code>${escapeHtml(search.query)}</code>`
				)
				.join("\n")
			: `🔎 <b>Saved searches</b>\n\n` +
			`Save a search and the bot will tell you whenever a ` +
			`newly listed conference matches it.`;

	const markup =
		savedSearchesKeyboard(searches);

	if (messageId) {
		await editMessageText(env, chatId, messageId, text, markup);
	} else {
		await sendMessage(env, chatId, text, markup);
	}
}

/* =========================================================
	 TIMELINE
	 ========================================================= */

/**
 * Deadline planning: what is due when, across saved
 * conferences and the personalized feed.
 */
export async function showTimeline(
	env: Env,
	chatId: number,
	messageId?: number
): Promise<void> {

	const userId =
		String(chatId);

	const [user, saved, feed] =
		await Promise.all([
			getUser(env, userId),
			listSaved(env, userId, 1, 30),
			getPersonalFeed(env, userId, 1, 30),
		]);

	/*
	 * Saved conferences are the commitments; the feed fills in
	 * what the user is likely to consider next.
	 */
	const byId =
		new Map(
			[...saved.rows, ...feed.rows].map(
				conference => [conference.id, conference]
			)
		);

	const rows =
		[...byId.values()]
			.filter(conference => conference.deadline_utc)
			.sort(
				(a, b) =>
					new Date(a.deadline_utc!).getTime() -
					new Date(b.deadline_utc!).getTime()
			)
			.slice(0, 40);

	const text =
		timelineText(
			rows,
			user?.timezone ?? "UTC",
			saved.rows.length
				? "🗓 Your submission timeline"
				: "🗓 Suggested timeline"
		);

	const markup = {
		inline_keyboard: [
			[
				{
					text: "📆 Export .ics",
					callback_data: "ics:timeline",
				},
			],
			[
				{
					text: "⭐ Saved",
					callback_data: "list:saved:1",
				},
				{
					text: "🏠 Menu",
					callback_data: "menu:main",
				},
			],
		],
	};

	const chunks =
		chunkMessage(text);

	if (messageId && chunks.length === 1) {

		await editMessageText(
			env,
			chatId,
			messageId,
			chunks[0],
			markup
		);

		return;
	}

	for (let index = 0; index < chunks.length; index += 1) {

		await sendMessage(
			env,
			chatId,
			chunks[index],
			index === chunks.length - 1 ? markup : undefined
		);
	}
}

/* =========================================================
	 PROMPTS
	 ========================================================= */

/**
 * Asks for free-text input with a force-reply box, so the user
 * never has to remember command syntax.
 */
export async function promptFor(
	env: Env,
	chatId: number,
	kind: "search" | "timezone" | "save_search"
): Promise<void> {

	await setPendingInput(env, String(chatId), kind);

	const prompts: Record<typeof kind, [string, string]> = {
		search: [
			`🔎 <b>What are you looking for?</b>\n\n` +
			`Try <code>federated learning</code>, ` +
			`<code>privacy</code>, or a venue like ` +
			`<code>NeurIPS</code>. Typos are fine.`,
			"Search conferences…",
		],

		timezone: [
			`🕐 <b>Which timezone are you in?</b>\n\n` +
			`Use an IANA name, for example ` +
			`<code>Europe/Amsterdam</code> or ` +
			`<code>America/Los_Angeles</code>.`,
			"Europe/Amsterdam",
		],

		save_search: [
			`🔎 <b>What should I watch for?</b>\n\n` +
			`You will get a message whenever a newly listed ` +
			`conference matches this.`,
			"e.g. diffusion models",
		],
	};

	const [text, placeholder] =
		prompts[kind];

	await sendMessage(
		env,
		chatId,
		text,
		forceReply(placeholder)
	);
}

/* =========================================================
	 HELP
	 ========================================================= */

const HELP =
	`ℹ️ <b>AI Conference Deadlines</b>\n\n` +
	`<b>Browsing</b>\n` +
	`/upcoming — every open deadline\n` +
	`/myfeed — ranked by your preferences\n` +
	`/timeline — what is due when\n` +
	`/topics · /locations — browse by category\n` +
	`/rank A* — filter by CORE ranking\n` +
	`/format virtual — in-person, virtual or hybrid\n\n` +
	`<b>Finding</b>\n` +
	`/search federated learning — typo-tolerant\n` +
	`/location Germany\n` +
	`/deadline 30 — closing in the next N days\n` +
	`/nextweek · /thismonth\n\n` +
	`<b>Keeping track</b>\n` +
	`/saved — your bookmarks\n` +
	`/reminders — view and delete reminders\n` +
	`/watch diffusion models — alert me on new matches\n` +
	`/export — your saved conferences as .ics\n\n` +
	`<b>Settings</b>\n` +
	`/settings — digest, quiet hours, sorting\n` +
	`/timezone Europe/Amsterdam\n\n` +
	`<b>Anywhere</b>\n` +
	`Type <code>@yourbot neurips</code> in any chat to search ` +
	`without leaving the conversation.\n\n` +
	`<b>Data</b>\n` +
	`Deadlines come from ai-deadlines, rankings from CORE, and ` +
	`acceptance rates from a community dataset. Some upstream ` +
	`deadlines are <i>predicted</i> — always confirm on the ` +
	`official website before you rely on one.`;

export async function showHelp(
	env: Env,
	chatId: number,
	messageId?: number
): Promise<void> {

	const markup = {
		inline_keyboard: [
			[
				{
					text: "📅 Upcoming",
					callback_data: "list:upcoming:1",
				},
				{
					text: "🏠 Menu",
					callback_data: "menu:main",
				},
			],
		],
	};

	if (messageId) {
		await editMessageText(env, chatId, messageId, HELP, markup);
		return;
	}

	await sendMessage(env, chatId, HELP, markup);
}
