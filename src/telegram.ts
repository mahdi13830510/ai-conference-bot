import {
	Env,
	InlineKeyboardMarkup,
	InlineResult,
} from "./types";

const TELEGRAM_API =
	"https://api.telegram.org/bot";

async function telegramRequest<T>(
	env: Env,
	method: string,
	body: Record<string, unknown>
): Promise<T> {

	const response = await fetch(
		`${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/${method}`,
		{
			method: "POST",

			headers: {
				"Content-Type": "application/json",
			},

			body: JSON.stringify(body),
		}
	);

	const data =
		await response.json<{
			ok: boolean;
			result?: T;
			description?: string;
		}>();

	if (!data.ok) {
		throw new Error(
			`Telegram ${method} failed: ${data.description ?? "Unknown error"
			}`
		);
	}

	return data.result as T;
}

export async function sendMessage(
	env: Env,
	chatId: number,
	text: string,
	replyMarkup?: InlineKeyboardMarkup
) {
	return telegramRequest(
		env,
		"sendMessage",
		{
			chat_id: chatId,
			text,

			disable_web_page_preview: true,

			...(replyMarkup
				? {
					reply_markup: replyMarkup,
				}
				: {}),
		}
	);
}

export async function editMessageText(
	env: Env,
	chatId: number,
	messageId: number,
	text: string,
	replyMarkup?: InlineKeyboardMarkup
) {
	return telegramRequest(
		env,
		"editMessageText",
		{
			chat_id: chatId,
			message_id: messageId,
			text,

			disable_web_page_preview: true,

			...(replyMarkup
				? {
					reply_markup: replyMarkup,
				}
				: {}),
		}
	);
}

export async function answerCallbackQuery(
	env: Env,
	callbackQueryId: string,
	text?: string
) {
	return telegramRequest(
		env,
		"answerCallbackQuery",
		{
			callback_query_id:
				callbackQueryId,

			...(text
				? {
					text,
				}
				: {}),
		}
	);
}

export async function answerInlineQuery(
	env: Env,
	inlineQueryId: string,
	results: InlineResult[],
	nextOffset = ""
) {
	return telegramRequest(
		env,
		"answerInlineQuery",
		{
			inline_query_id:
				inlineQueryId,

			results,

			cache_time: 30,

			is_personal: true,

			next_offset: nextOffset,
		}
	);
}

export async function setMyCommands(
	env: Env
) {

	const commands = [
		{
			command: "start",
			description: "Open the main menu",
		},
		{
			command: "upcoming",
			description: "Upcoming conference deadlines",
		},
		{
			command: "search",
			description: "Search conferences",
		},
		{
			command: "topics",
			description: "Browse conference topics",
		},
		{
			command: "locations",
			description: "Browse locations",
		},
		{
			command: "saved",
			description: "Your saved conferences",
		},
		{
			command: "reminders",
			description: "Your deadline reminders",
		},
		{
			command: "myfeed",
			description: "Conferences matching your preferences",
		},
		{
			command: "settings",
			description: "Your preferences",
		},
		{
			command: "help",
			description: "Help",
		},
	];

	/*
	 * Default scope.
	 */
	await telegramRequest(
		env,
		"setMyCommands",
		{
			commands,
			scope: {
				type: "default",
			},
		}
	);

	/*
	 * Explicitly set the same commands for
	 * all private chats.
	 */
	await telegramRequest(
		env,
		"setMyCommands",
		{
			commands,
			scope: {
				type: "all_private_chats",
			},
		}
	);

	/*
	 * And all groups/supergroups.
	 */
	await telegramRequest(
		env,
		"setMyCommands",
		{
			commands,
			scope: {
				type: "all_group_chats",
			},
		}
	);
}

export async function setBotMenuButton(
	env: Env
) {
	return telegramRequest(
		env,
		"setChatMenuButton",
		{
			menu_button: {
				type: "commands",
			},
		}
	);
}

export async function sendTypingAction(
	env: Env,
	chatId: number
) {
	return telegramRequest(
		env,
		"sendChatAction",
		{
			chat_id: chatId,
			action: "typing",
		}
	);
}
