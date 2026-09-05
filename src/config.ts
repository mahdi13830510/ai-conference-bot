/**
 * Static configuration shared across the bot.
 */

export const PAGE_SIZE = 5;

export const REGION_COUNTRIES: Record<
	string,
	string[]
> = {

	europe: [
		"Turkey",
		"Netherlands",
		"Germany",
		"France",
		"United Kingdom",
		"UK",
		"Italy",
		"Spain",
		"Greece",
		"Switzerland",
		"Austria",
		"Belgium",
		"Portugal",
		"Sweden",
		"Norway",
		"Denmark",
		"Finland",
		"Ireland",
		"Poland",
		"Czech",
		"Romania",
		"Hungary",
	],

	asia: [
		"Japan",
		"Korea",
		"China",
		"Taiwan",
		"Singapore",
		"India",
		"Thailand",
		"Indonesia",
		"Malaysia",
		"Hong Kong",
		"Israel",
	],

	"north-america": [
		"USA",
		"United States",
		"Canada",
		"Mexico",
	],
};

/* =========================================================
	 REMINDERS
	 ========================================================= */

/**
 * Offsets offered in the manual reminder menu.
 */
export const REMINDER_OFFSETS = [
	1,
	3,
	7,
	14,
	30,
];

/**
 * A single opt-in that replaces picking offsets by hand.
 */
export const ESCALATING_OFFSETS = [
	30,
	7,
	3,
	1,
];

export const REMINDER_KIND_LABELS: Record<string, string> = {
	paper: "📄 Paper deadline",
	abstract: "📝 Abstract deadline",
	event: "✈️ Conference start",
};

/* =========================================================
	 PRESENTATION
	 ========================================================= */

export const FORMAT_LABELS: Record<string, string> = {
	"in-person": "🏛 In person",
	"virtual": "💻 Virtual",
	"hybrid": "🔀 Hybrid",
	"tba": "❔ TBA",
};

export const SORT_LABELS: Record<string, string> = {
	deadline: "⏰ Deadline",
	date: "📆 Conference date",
	name: "🔤 Name",
	rank: "🏅 CORE rank",
};

export const DIGEST_FREQUENCY_LABELS: Record<string, string> = {
	daily: "📨 Daily",
	weekly: "🗓 Weekly",
	off: "🔕 Off",
};

export const WEEKDAY_LABELS = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];

/**
 * Telegram's hard limit on a text message.
 */
export const MAX_MESSAGE_LENGTH = 4096;

/**
 * Premium message effects, used sparingly on confirmations.
 * See https://core.telegram.org/bots/api#sendmessage
 */
export const EFFECT_CONFETTI =
	"5046509860389126442";

/* =========================================================
	 CALLBACK TOKENS
	 ========================================================= */

/**
 * callback_data is capped at 64 bytes. Anything longer is
 * stored in D1 and referenced by a short token.
 */
export const CALLBACK_DATA_LIMIT = 64;

/**
 * Tokens older than this are swept by the cron job.
 */
export const CALLBACK_TOKEN_TTL_HOURS = 72;

/* =========================================================
	 UPDATE DEDUPLICATION
	 ========================================================= */

export const PROCESSED_UPDATE_TTL_HOURS = 24;

/* =========================================================
	 SEARCH
	 ========================================================= */

/**
 * Below this FTS score gap, a trigram-style fallback is used so
 * that typos still return something useful.
 */
export const FUZZY_MIN_LENGTH = 3;

export const INLINE_CACHE_SECONDS = 60;
