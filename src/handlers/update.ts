import {
	Env,
	TelegramUpdate,
} from "../types";

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
) {

	if (update.message) {

		await handleMessage(
			env,
			update.message
		);

		return;
	}

	if (update.callback_query) {

		await ensureUser(
			env,
			update.callback_query.from
		);

		await handleCallback(
			env,
			update.callback_query
		);

		return;
	}

	if (update.inline_query) {

		await ensureUser(
			env,
			update.inline_query.from
		);

		await handleInlineQuery(
			env,
			update.inline_query
		);
	}
}
