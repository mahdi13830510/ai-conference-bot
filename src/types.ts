export interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;

	/*
	 * Your Telegram user ID.
	 * Used for /admin commands.
	 */
	ADMIN_TELEGRAM_ID: string;

	/*
	 * Shared secret echoed by Telegram in the
	 * X-Telegram-Bot-Api-Secret-Token header. Optional, but
	 * without it anyone who learns the worker URL can post
	 * forged updates.
	 */
	TELEGRAM_WEBHOOK_SECRET?: string;

	/*
	 * Public origin of this worker, used to build Mini App
	 * and calendar-feed URLs. Falls back to the request origin.
	 */
	PUBLIC_URL?: string;
}

/* =========================================================
	 SOURCE DATA
	 ========================================================= */

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

	cfp_link?: string;

	/*
	 * Which adapter produced this record.
	 */
	source?: string;
}

export type ConferenceFormat =
	| "in-person"
	| "virtual"
	| "hybrid"
	| "tba";

export type CoreRank =
	| "A*"
	| "A"
	| "B"
	| "C";

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

	core_rank: string | null;
	core_name: string | null;

	format: string;
	country: string | null;
	city: string | null;

	cfp_link: string | null;
	source: string;

	previous_deadline_utc: string | null;
	deadline_changed_at: string | null;

	first_seen_at: string;
	updated_at: string;
}

/* =========================================================
	 USERS
	 ========================================================= */

export type DigestFrequency =
	| "daily"
	| "weekly"
	| "off";

export type SortPreference =
	| "deadline"
	| "date"
	| "name"
	| "rank";

export interface User {
	telegram_id: string;
	username: string | null;
	first_name: string | null;
	timezone: string;

	daily_digest_enabled: number;
	daily_digest_hour_utc: number;
	last_digest_date: string | null;

	digest_frequency: string;
	digest_weekday: number;

	quiet_hours_start: number | null;
	quiet_hours_end: number | null;

	auto_reminder_days: number | null;
	escalating_enabled: number;

	alert_new_conferences: number;
	alert_deadline_changes: number;

	sort_preference: string;
	min_rank: string | null;

	language_code: string | null;
	blocked: number;

	last_list: string | null;
}

/* =========================================================
	 REMINDERS
	 ========================================================= */

export type ReminderKind =
	| "paper"
	| "abstract"
	| "event";

export interface Reminder {
	id: number;
	telegram_id: string;
	conference_id: string;
	kind: string;
	days_before: number;
	remind_at: string;
	sent: number;
	auto: number;
}

export interface ReminderWithConference extends Reminder {
	title: string;
	year: number;
	deadline: string | null;
	deadline_utc: string | null;
	abstract_deadline_utc: string | null;
	start: string | null;
	place: string | null;
	link: string | null;
	topics: string | null;

	timezone: string;
	quiet_hours_start: number | null;
	quiet_hours_end: number | null;
}

export interface SavedSearch {
	id: number;
	telegram_id: string;
	query: string;
	notify: number;
	last_notified_at: string | null;
	created_at: string;
}

export interface AcceptanceRate {
	venue: string;
	year: number;
	rate: number | null;
	accepted: number | null;
	submitted: number | null;
}

export interface CountryInfo {
	country: string;
	visa_url: string | null;
	visa_note: string | null;
	currency: string | null;
}

export interface VenueHistoryRow {
	venue: string;
	year: number;
	deadline_utc: string | null;
	place: string | null;
	link: string | null;
}

/* =========================================================
	 TELEGRAM
	 ========================================================= */

export interface TelegramUpdate {
	update_id: number;

	message?: TelegramMessage;

	edited_message?: TelegramMessage;

	callback_query?: TelegramCallbackQuery;

	inline_query?: TelegramInlineQuery;

	my_chat_member?: {
		chat: { id: number; type: string };
		from: TelegramUser;
		new_chat_member: { status: string };
	};
}

export interface TelegramMessage {
	message_id: number;

	chat: {
		id: number;
		type: string;
	};

	from?: TelegramUser;

	text?: string;

	reply_to_message?: {
		message_id: number;
		text?: string;
	};
}

export interface TelegramUser {
	id: number;
	is_bot?: boolean;

	first_name?: string;
	last_name?: string;
	username?: string;

	language_code?: string;
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

	thumbnail_url?: string;
	thumbnail_width?: number;
	thumbnail_height?: number;

	input_message_content: {
		message_text: string;
		parse_mode?: string;
		link_preview_options?: LinkPreviewOptions;
	};

	reply_markup?: InlineKeyboardMarkup;
}

export interface LinkPreviewOptions {
	is_disabled?: boolean;
	url?: string;
	prefer_small_media?: boolean;
	prefer_large_media?: boolean;
	show_above_text?: boolean;
}

export interface WebAppInfo {
	url: string;
}

export interface CopyTextButton {
	text: string;
}

export interface SwitchInlineQueryChosenChat {
	query?: string;
	allow_user_chats?: boolean;
	allow_bot_chats?: boolean;
	allow_group_chats?: boolean;
	allow_channel_chats?: boolean;
}

export interface InlineKeyboardButton {
	text: string;

	callback_data?: string;

	url?: string;

	web_app?: WebAppInfo;

	copy_text?: CopyTextButton;

	switch_inline_query_current_chat?: string;

	switch_inline_query?: string;

	switch_inline_query_chosen_chat?: SwitchInlineQueryChosenChat;
}

export interface InlineKeyboardMarkup {
	inline_keyboard: InlineKeyboardButton[][];
}

export interface KeyboardButton {
	text: string;
	web_app?: WebAppInfo;
}

export interface ReplyKeyboardMarkup {
	keyboard: KeyboardButton[][];
	resize_keyboard?: boolean;
	is_persistent?: boolean;
	input_field_placeholder?: string;
}

export interface ForceReply {
	force_reply: true;
	input_field_placeholder?: string;
	selective?: boolean;
}

export type ReplyMarkup =
	| InlineKeyboardMarkup
	| ReplyKeyboardMarkup
	| ForceReply;

export interface SendOptions {
	parseMode?: "HTML" | "MarkdownV2";
	linkPreview?: LinkPreviewOptions;
	messageEffectId?: string;
	disableNotification?: boolean;
}

/* =========================================================
	 LISTS
	 ========================================================= */

export type ListMode =
	| "upcoming"
	| "topic"
	| "location"
	| "region"
	| "search"
	| "deadline"
	| "saved"
	| "feed"
	| "rank"
	| "format"
	| "similar";

export interface ListFilter {
	mode: ListMode;

	value?: string;

	page: number;

	sort?: SortPreference;
}

/* =========================================================
	 PENDING INPUT
	 ========================================================= */

export type PendingInputKind =
	| "search"
	| "timezone"
	| "save_search";
