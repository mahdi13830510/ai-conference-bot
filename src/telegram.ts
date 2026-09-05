import {
	Env,
	InlineKeyboardMarkup,
	InlineResult,
	ReplyMarkup,
	SendOptions,
	LinkPreviewOptions,
} from "./types";

const TELEGRAM_API =
	"https://api.telegram.org/bot";

/* =========================================================
	 ERRORS
	 ========================================================= */

export class TelegramError extends Error {

	constructor(
		readonly method: string,
		readonly code: number,
		readonly description: string,
		readonly retryAfter?: number
	) {
		super(`Telegram ${method} failed (${code}): ${description}`);
		this.name = "TelegramError";
	}

	/**
	 * The user blocked the bot, deleted their account, or the
	 * chat no longer exists. Callers should stop writing to
	 * this chat rather than retry.
	 */
	get isUnreachable(): boolean {

		return (
			this.code === 403 ||
			(this.code === 400 &&
				/chat not found|user is deactivated/i.test(
					this.description
				))
		);
	}

	/**
	 * Editing a message to identical content is not a failure.
	 */
	get isNotModified(): boolean {

		return /message is not modified/i.test(
			this.description
		);
	}
}

/* =========================================================
	 RATE LIMITING
	 ========================================================= */

/*
 * Telegram allows roughly 30 messages per second overall. The
 * bucket is deliberately set below that: a Worker isolate can
 * be one of several, and the cost of being throttled is far
 * higher than the cost of being slightly slow.
 */
const GLOBAL_RATE = 25;

const GLOBAL_WINDOW_MS = 1000;

/*
 * Per-chat, Telegram allows about one message per second.
 */
const CHAT_INTERVAL_MS = 1100;

const globalTimestamps: number[] = [];

const chatNextAllowed =
	new Map<string, number>();

function sleep(
	ms: number
): Promise<void> {

	return new Promise(
		resolve => setTimeout(resolve, ms)
	);
}

async function acquire(
	chatId?: string | number
): Promise<void> {

	/*
	 * Global window.
	 */
	for (;;) {

		const now =
			Date.now();

		while (
			globalTimestamps.length &&
			now - globalTimestamps[0] >= GLOBAL_WINDOW_MS
		) {
			globalTimestamps.shift();
		}

		if (globalTimestamps.length < GLOBAL_RATE) {
			globalTimestamps.push(now);
			break;
		}

		await sleep(
			GLOBAL_WINDOW_MS -
			(now - globalTimestamps[0]) +
			5
		);
	}

	if (chatId === undefined) {
		return;
	}

	const key =
		String(chatId);

	const now =
		Date.now();

	const nextAllowed =
		chatNextAllowed.get(key) ?? 0;

	if (nextAllowed > now) {
		await sleep(nextAllowed - now);
	}

	chatNextAllowed.set(
		key,
		Math.max(now, nextAllowed) + CHAT_INTERVAL_MS
	);

	/*
	 * Keep the map from growing without bound in a long-lived
	 * isolate.
	 */
	if (chatNextAllowed.size > 5000) {

		const cutoff =
			Date.now();

		for (const [chat, allowed] of chatNextAllowed) {

			if (allowed < cutoff) {
				chatNextAllowed.delete(chat);
			}
		}
	}
}

/* =========================================================
	 TRANSPORT
	 ========================================================= */

const MAX_ATTEMPTS = 3;

async function telegramRequest<T>(
	env: Env,
	method: string,
	body: Record<string, unknown>,
	options: {
		chatId?: string | number;
		rateLimited?: boolean;
	} = {}
): Promise<T> {

	const payload =
		Object.fromEntries(
			Object.entries(body)
				.filter(([, value]) => value !== undefined)
		);

	let lastError: TelegramError | null = null;

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {

		if (options.rateLimited !== false) {
			await acquire(options.chatId);
		}

		const response =
			await fetch(
				`${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/${method}`,
				{
					method: "POST",

					headers: {
						"Content-Type": "application/json",
					},

					body: JSON.stringify(payload),
				}
			);

		const data =
			await response.json<{
				ok: boolean;
				result?: T;
				description?: string;
				error_code?: number;
				parameters?: {
					retry_after?: number;
				};
			}>();

		if (data.ok) {
			return data.result as T;
		}

		lastError =
			new TelegramError(
				method,
				data.error_code ?? response.status,
				data.description ?? "Unknown error",
				data.parameters?.retry_after
			);

		/*
		 * 429: obey the server's own backoff.
		 */
		if (
			lastError.code === 429 &&
			attempt < MAX_ATTEMPTS
		) {

			await sleep(
				((lastError.retryAfter ?? 1) * 1000) + 250
			);

			continue;
		}

		/*
		 * Transient upstream failure.
		 */
		if (
			lastError.code >= 500 &&
			attempt < MAX_ATTEMPTS
		) {

			await sleep(attempt * 500);
			continue;
		}

		throw lastError;
	}

	throw lastError;
}

/* =========================================================
	 MESSAGES
	 ========================================================= */

/**
 * Escapes text for parse_mode: "HTML".
 */
export function escapeHtml(
	value: string
): string {

	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

const DEFAULT_LINK_PREVIEW: LinkPreviewOptions = {
	is_disabled: true,
};

export interface SentMessage {
	message_id: number;
	chat: { id: number };
}

export async function sendMessage(
	env: Env,
	chatId: number | string,
	text: string,
	replyMarkup?: ReplyMarkup,
	options: SendOptions = {}
): Promise<SentMessage> {

	return telegramRequest<SentMessage>(
		env,
		"sendMessage",
		{
			chat_id: chatId,
			text,

			parse_mode:
				options.parseMode ?? "HTML",

			link_preview_options:
				options.linkPreview ?? DEFAULT_LINK_PREVIEW,

			message_effect_id:
				options.messageEffectId,

			disable_notification:
				options.disableNotification,

			reply_markup: replyMarkup,
		},
		{ chatId }
	);
}

export async function editMessageText(
	env: Env,
	chatId: number | string,
	messageId: number,
	text: string,
	replyMarkup?: InlineKeyboardMarkup,
	options: SendOptions = {}
): Promise<void> {

	try {

		await telegramRequest(
			env,
			"editMessageText",
			{
				chat_id: chatId,
				message_id: messageId,
				text,

				parse_mode:
					options.parseMode ?? "HTML",

				link_preview_options:
					options.linkPreview ?? DEFAULT_LINK_PREVIEW,

				reply_markup: replyMarkup,
			},
			{ chatId }
		);

	} catch (error) {

		/*
		 * Re-tapping a button that produces the same screen is
		 * normal; Telegram treats it as an error, we do not.
		 */
		if (
			error instanceof TelegramError &&
			error.isNotModified
		) {
			return;
		}

		throw error;
	}
}

export async function deleteMessage(
	env: Env,
	chatId: number | string,
	messageId: number
): Promise<void> {

	try {

		await telegramRequest(
			env,
			"deleteMessage",
			{
				chat_id: chatId,
				message_id: messageId,
			},
			{ chatId }
		);

	} catch (error) {

		/*
		 * Messages older than 48 hours cannot be deleted.
		 */
		console.warn("deleteMessage failed:", error);
	}
}

export async function sendDocument(
	env: Env,
	chatId: number | string,
	filename: string,
	content: string,
	mimeType: string,
	caption?: string,
	replyMarkup?: InlineKeyboardMarkup
): Promise<void> {

	await acquire(chatId);

	const form =
		new FormData();

	form.append("chat_id", String(chatId));

	form.append(
		"document",
		new Blob([content], { type: mimeType }),
		filename
	);

	if (caption) {
		form.append("caption", caption);
		form.append("parse_mode", "HTML");
	}

	if (replyMarkup) {
		form.append(
			"reply_markup",
			JSON.stringify(replyMarkup)
		);
	}

	const response =
		await fetch(
			`${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/sendDocument`,
			{
				method: "POST",
				body: form,
			}
		);

	const data =
		await response.json<{
			ok: boolean;
			description?: string;
			error_code?: number;
		}>();

	if (!data.ok) {

		throw new TelegramError(
			"sendDocument",
			data.error_code ?? response.status,
			data.description ?? "Unknown error"
		);
	}
}

export async function sendChatAction(
	env: Env,
	chatId: number | string,
	action:
		| "typing"
		| "upload_document" = "typing"
): Promise<void> {

	try {

		await telegramRequest(
			env,
			"sendChatAction",
			{
				chat_id: chatId,
				action,
			},
			{ rateLimited: false }
		);

	} catch (error) {

		/*
		 * Purely cosmetic; never let it break a handler.
		 */
		console.warn("sendChatAction failed:", error);
	}
}

/*
 * Kept for call sites that read better with the old name.
 */
export const sendTypingAction = sendChatAction;

/* =========================================================
	 CALLBACKS AND INLINE
	 ========================================================= */

export async function answerCallbackQuery(
	env: Env,
	callbackQueryId: string,
	text?: string,
	showAlert = false
): Promise<void> {

	try {

		await telegramRequest(
			env,
			"answerCallbackQuery",
			{
				callback_query_id: callbackQueryId,
				text,
				show_alert: showAlert || undefined,
			},
			{ rateLimited: false }
		);

	} catch (error) {

		/*
		 * Callback queries expire after ~15 seconds. Answering
		 * late is harmless and must not abort the handler.
		 */
		console.warn("answerCallbackQuery failed:", error);
	}
}

export interface InlineQueryButton {
	text: string;
	start_parameter?: string;
	web_app?: { url: string };
}

export async function answerInlineQuery(
	env: Env,
	inlineQueryId: string,
	results: InlineResult[],
	options: {
		cacheTime?: number;
		isPersonal?: boolean;
		nextOffset?: string;
		button?: InlineQueryButton;
	} = {}
): Promise<void> {

	await telegramRequest(
		env,
		"answerInlineQuery",
		{
			inline_query_id: inlineQueryId,
			results,

			cache_time:
				options.cacheTime ?? 60,

			is_personal:
				options.isPersonal,

			next_offset:
				options.nextOffset,

			button:
				options.button,
		},
		{ rateLimited: false }
	);
}

/* =========================================================
	 BOT CONFIGURATION
	 ========================================================= */

export interface BotCommand {
	command: string;
	description: string;
}

export type BotCommandScope =
	| { type: "default" }
	| { type: "all_private_chats" }
	| { type: "all_group_chats" }
	| { type: "chat"; chat_id: number | string };

export async function setMyCommands(
	env: Env,
	commands: BotCommand[],
	scope: BotCommandScope = { type: "default" },
	languageCode?: string
): Promise<void> {

	await telegramRequest(
		env,
		"setMyCommands",
		{
			commands,
			scope,
			language_code: languageCode,
		}
	);
}

export async function setChatMenuButton(
	env: Env,
	menuButton:
		| { type: "commands" }
		| { type: "web_app"; text: string; web_app: { url: string } },
	chatId?: number | string
): Promise<void> {

	await telegramRequest(
		env,
		"setChatMenuButton",
		{
			chat_id: chatId,
			menu_button: menuButton,
		}
	);
}

/*
 * Kept for the previous call site name.
 */
export const setBotMenuButton = setChatMenuButton;

export async function setMyDescription(
	env: Env,
	description: string,
	languageCode?: string
): Promise<void> {

	await telegramRequest(
		env,
		"setMyDescription",
		{
			description,
			language_code: languageCode,
		}
	);
}

export async function setMyShortDescription(
	env: Env,
	shortDescription: string,
	languageCode?: string
): Promise<void> {

	await telegramRequest(
		env,
		"setMyShortDescription",
		{
			short_description: shortDescription,
			language_code: languageCode,
		}
	);
}
