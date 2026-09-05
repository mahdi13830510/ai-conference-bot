import {
	Env,
	TelegramUpdate,
} from "../types";

import {
	claimUpdate,
	markUserBlocked,
} from "../database";

import {
	TelegramError,
} from "../telegram";

import {
	ensureUser,
} from "../users";

import {
	handleMessage,
} from "./message";

import {
	handleCallback,
} from "./callback";

import {
	handleInlineQuery,
} from "./inline";

/**
 * Dispatches a Telegram update to the handler that owns it.
 */
export async function handleUpdate(
	env: Env,
	update: TelegramUpdate
): Promise<void> {

	/*
	 * Telegram redelivers an update if the webhook is slow or
	 * errors, which would otherwise double-save, double-remind
	 * and double-reply.
	 */
	if (!await claimUpdate(env, update.update_id)) {

		console.log(
			JSON.stringify({
				event: "duplicate_update",
				update_id: update.update_id,
			})
		);

		return;
	}

	try {

		if (update.message) {
			await handleMessage(env, update.message);
			return;
		}

		if (update.callback_query) {

			await ensureUser(env, update.callback_query.from);
			await handleCallback(env, update.callback_query);
			return;
		}

		if (update.inline_query) {

			await ensureUser(env, update.inline_query.from);
			await handleInlineQuery(env, update.inline_query);
			return;
		}

		/*
		 * The user blocked or unblocked the bot.
		 */
		if (update.my_chat_member) {

			const status =
				update.my_chat_member.new_chat_member.status;

			await markUserBlocked(
				env,
				String(update.my_chat_member.chat.id),
				status === "kicked" || status === "left"
			);
		}

	} catch (error) {

		/*
		 * If the chat is gone, stop writing to it rather than
		 * retrying on every future job.
		 */
		if (
			error instanceof TelegramError &&
			error.isUnreachable
		) {

			const chatId =
				update.message?.chat.id ??
				update.callback_query?.message?.chat.id;

			if (chatId) {
				await markUserBlocked(env, String(chatId));
			}

			console.warn("Chat unreachable, marked blocked:", chatId);

			return;
		}

		throw error;
	}
}
