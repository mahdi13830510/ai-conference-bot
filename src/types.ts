export interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;

	/*
	 * Your Telegram user ID.
	 * Used for /admin commands.
	 */
	ADMIN_TELEGRAM_ID: string;
}

export interface Conference {
	title: string;
	year: number;
	id: string;

	full_name?: string;
	link?: string;

	deadline?: string;
	abstract_deadline?: string;
	timezone?: string;

	place?: string;
	date?: string;
	start?: string;
	end?: string;

	sub?: string[];

	note?: string;

	hindex?: number;
	paperslink?: string;
	pwclink?: string;
}

export interface DbConference {
	id: string;
	title: string;
	year: number;

	full_name: string | null;
	link: string | null;

	deadline: string | null;
	abstract_deadline: string | null;
	deadline_utc: string | null;
	abstract_deadline_utc: string | null;

	timezone: string | null;

	place: string | null;
	date: string | null;
	start: string | null;
	end: string | null;

	topics: string | null;
	note: string | null;

	hindex: number | null;
	paperslink: string | null;
	pwclink: string | null;

	first_seen_at: string;
	updated_at: string;
}

export interface User {
	telegram_id: string;
	username: string | null;
	first_name: string | null;
	timezone: string;
	daily_digest_enabled: number;
	daily_digest_hour_utc: number;
	last_digest_date: string | null;
}

export interface Reminder {
	id: number;
	telegram_id: string;
	conference_id: string;
	days_before: number;
	remind_at: string;
	sent: number;
}

export interface TelegramUpdate {
	update_id: number;

	message?: TelegramMessage;

	callback_query?: TelegramCallbackQuery;

	inline_query?: TelegramInlineQuery;
}

export interface TelegramMessage {
	message_id: number;

	chat: {
		id: number;
		type: string;
	};

	from?: TelegramUser;

	text?: string;
}

export interface TelegramUser {
	id: number;
	is_bot?: boolean;

	first_name?: string;
	last_name?: string;
	username?: string;
}

export interface TelegramCallbackQuery {
	id: string;

	from: TelegramUser;

	data?: string;

	message?: TelegramMessage;

	inline_message_id?: string;
}

export interface TelegramInlineQuery {
	id: string;

	from: TelegramUser;

	query: string;

	offset: string;

	chat_type?: string;
}

export interface InlineResult {
	type: "article";
	id: string;
	title: string;
	description?: string;
	url?: string;

	input_message_content: {
		message_text: string;
	};

	reply_markup?: InlineKeyboardMarkup;
}

export interface InlineKeyboardButton {
	text: string;

	callback_data?: string;

	url?: string;

	switch_inline_query_current_chat?: string;

	switch_inline_query?: string;
}

export interface InlineKeyboardMarkup {
	inline_keyboard: InlineKeyboardButton[][];
}

export type ListMode =
	| "upcoming"
	| "topic"
	| "location"
	| "region"
	| "search"
	| "deadline"
	| "saved";

export interface ListFilter {
	mode: ListMode;

	value?: string;

	page: number;
}
