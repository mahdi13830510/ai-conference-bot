import {
	DbConference,
	InlineKeyboardMarkup,
	InlineKeyboardButton,
	ReplyKeyboardMarkup,
	ForceReply,
	SavedSearch,
	User,
} from "./types";

import {
	googleCalendarUrl,
} from "./calendar";

import {
	PAGE_SIZE,
	REMINDER_OFFSETS,
	FORMAT_LABELS,
	SORT_LABELS,
	DIGEST_FREQUENCY_LABELS,
	WEEKDAY_LABELS,
} from "./config";

type Row = InlineKeyboardButton[];

/**
 * Lays buttons out in rows of a fixed width.
 */
function grid(
	buttons: InlineKeyboardButton[],
	perRow = 2
): Row[] {

	const rows: Row[] = [];

	for (let i = 0; i < buttons.length; i += perRow) {
		rows.push(buttons.slice(i, i + perRow));
	}

	return rows;
}

/**
 * Every screen gets a back target and a route home, so the
 * user is never stranded on a leaf.
 */
export function navRow(
	back: string,
	backLabel = "◀ Back"
): Row {

	return [
		{ text: backLabel, callback_data: back },
		{ text: "🏠 Menu", callback_data: "menu:main" },
	];
}

/* =========================================================
	 MAIN MENU
	 ========================================================= */

export function mainMenu(
	miniAppUrl?: string
): InlineKeyboardMarkup {

	const rows: Row[] = [
		[
			{
				text: "📅 Upcoming",
				callback_data: "list:upcoming:1",
			},
			{
				text: "🎯 My Feed",
				callback_data: "list:feed:1",
			},
		],
		[
			{
				text: "🏷 Topics",
				callback_data: "menu:topics",
			},
			{
				text: "🌍 Locations",
				callback_data: "menu:locations",
			},
		],
		[
			{
				text: "🏅 By rank",
				callback_data: "menu:rank",
			},
			{
				text: "🔀 By format",
				callback_data: "menu:format",
			},
		],
		[
			{
				text: "🔎 Search",
				callback_data: "prompt:search",
			},
			{
				text: "🗓 Timeline",
				callback_data: "timeline",
			},
		],
		[
			{
				text: "⭐ Saved",
				callback_data: "list:saved:1",
			},
			{
				text: "🔔 Reminders",
				callback_data: "reminders",
			},
		],
		[
			{
				text: "⚙️ Settings",
				callback_data: "settings",
			},
			{
				text: "ℹ️ Help",
				callback_data: "help",
			},
		],
	];

	if (miniAppUrl) {

		rows.unshift([
			{
				text: "🚀 Open the full browser",
				web_app: { url: miniAppUrl },
			},
		]);
	}

	return { inline_keyboard: rows };
}

/**
 * The persistent bottom bar. Kept to the handful of actions
 * people use most; everything else lives in the inline menus.
 */
export function persistentKeyboard(
	miniAppUrl?: string
): ReplyKeyboardMarkup {

	return {
		keyboard: [
			[
				{ text: "📅 Upcoming" },
				{ text: "🎯 My Feed" },
			],
			[
				{ text: "🔎 Search" },
				{ text: "⭐ Saved" },
			],
			[
				{ text: "🔔 Reminders" },

				miniAppUrl
					? {
						text: "🚀 Browser",
						web_app: { url: miniAppUrl },
					}
					: { text: "⚙️ Settings" },
			],
		],

		resize_keyboard: true,
		is_persistent: true,
		input_field_placeholder: "Search conferences…",
	};
}

export function forceReply(
	placeholder: string
): ForceReply {

	return {
		force_reply: true,
		input_field_placeholder: placeholder.slice(0, 64),
		selective: true,
	};
}

/* =========================================================
	 TOPICS
	 ========================================================= */

export const TOPICS: Record<string, string> = {
	ML: "🧠 Machine Learning",
	CV: "👁 Computer Vision",
	NLP: "💬 Natural Language Processing",
	RO: "🤖 Robotics",
	SP: "🔊 Speech",
	DM: "📊 Data Mining",
	AP: "🧭 Planning / Autonomous Agents",
	KR: "🧠 Knowledge Representation",
	HCI: "🖥 Human-Computer Interaction",
	EDU: "🎓 AI in Education",
	CG: "🎨 Computer Graphics",
};

export function topicsMenu(): InlineKeyboardMarkup {

	const rows =
		grid(
			Object.entries(TOPICS).map(
				([code, label]) => ({
					text: label,
					callback_data: `list:topic:${code}:1`,
				})
			),
			2
		);

	rows.push(navRow("menu:main"));

	return { inline_keyboard: rows };
}

/* =========================================================
	 LOCATIONS
	 ========================================================= */

const LOCATIONS: [string, string][] = [
	["🇺🇸 USA", "USA"],
	["🇨🇦 Canada", "Canada"],
	["🇬🇧 UK", "UK"],
	["🇩🇪 Germany", "Germany"],
	["🇫🇷 France", "France"],
	["🇮🇹 Italy", "Italy"],
	["🇪🇸 Spain", "Spain"],
	["🇳🇱 Netherlands", "Netherlands"],
	["🇦🇹 Austria", "Austria"],
	["🇬🇷 Greece", "Greece"],
	["🇨🇭 Switzerland", "Switzerland"],
	["🇮🇪 Ireland", "Ireland"],
	["🇯🇵 Japan", "Japan"],
	["🇰🇷 South Korea", "South Korea"],
	["🇨🇳 China", "China"],
	["🇸🇬 Singapore", "Singapore"],
	["🇮🇳 India", "India"],
	["🇦🇺 Australia", "Australia"],
];

const REGIONS: [string, string][] = [
	["🌍 Europe", "europe"],
	["🌏 Asia", "asia"],
	["🌎 North America", "north-america"],
];

export function locationsMenu(): InlineKeyboardMarkup {

	const rows =
		grid(
			REGIONS.map(
				([label, value]) => ({
					text: label,
					callback_data: `list:region:${value}:1`,
				})
			),
			3
		);

	rows.push(
		...grid(
			LOCATIONS.map(
				([label, value]) => ({
					text: label,
					callback_data: `list:location:${value}:1`,
				})
			),
			3
		)
	);

	rows.push(navRow("menu:main"));

	return { inline_keyboard: rows };
}

/* =========================================================
	 RANK AND FORMAT
	 ========================================================= */

export function rankMenu(): InlineKeyboardMarkup {

	const rows =
		grid(
			[
				["🏅 A* only", "A*"],
				["🎖 A and above", "A"],
				["🥉 B and above", "B"],
				["📋 C and above", "C"],
			].map(
				([label, value]) => ({
					text: label,
					callback_data: `list:rank:${value}:1`,
				})
			),
			2
		);

	rows.push(navRow("menu:main"));

	return { inline_keyboard: rows };
}

export function formatMenu(): InlineKeyboardMarkup {

	const rows =
		grid(
			Object.entries(FORMAT_LABELS)
				.filter(([key]) => key !== "tba")
				.map(
					([key, label]) => ({
						text: label,
						callback_data: `list:format:${key}:1`,
					})
				),
			2
		);

	rows.push(navRow("menu:main"));

	return { inline_keyboard: rows };
}

export function sortMenu(
	current: string,
	returnTo: string
): InlineKeyboardMarkup {

	const rows =
		grid(
			Object.entries(SORT_LABELS).map(
				([key, label]) => ({
					text: key === current ? `✅ ${label}` : label,
					callback_data: `sort:${key}`,
				})
			),
			2
		);

	rows.push(navRow(returnTo));

	return { inline_keyboard: rows };
}

/* =========================================================
	 PAGINATION
	 ========================================================= */

export function pagination(
	page: number,
	total: number,
	prefix: string,
	options: {
		sortReturn?: string;
		exportPayload?: string;
	} = {}
): InlineKeyboardMarkup {

	const pages =
		Math.max(1, Math.ceil(total / PAGE_SIZE));

	const row: Row = [];

	if (page > 1) {

		row.push({
			text: "◀",
			callback_data: `${prefix}:${page - 1}`,
		});
	}

	row.push({
		text: `${page} / ${pages}`,
		callback_data: "noop",
	});

	if (page < pages) {

		row.push({
			text: "▶",
			callback_data: `${prefix}:${page + 1}`,
		});
	}

	const rows: Row[] = [row];

	const tools: Row = [];

	if (options.sortReturn) {

		tools.push({
			text: "↕️ Sort",
			callback_data: `menu:sort:${options.sortReturn}`,
		});
	}

	if (options.exportPayload && total > 0) {

		tools.push({
			text: "📆 Export .ics",
			callback_data: `ics:${options.exportPayload}`,
		});
	}

	if (tools.length) {
		rows.push(tools);
	}

	rows.push([
		{ text: "🏠 Menu", callback_data: "menu:main" },
	]);

	return { inline_keyboard: rows };
}

/* =========================================================
	 CONFERENCE LIST
	 ========================================================= */

export function conferenceListKeyboard(
	rows: DbConference[],
	savedIds: Set<string> = new Set()
): InlineKeyboardMarkup {

	return {
		inline_keyboard: rows.map(
			conference => [
				{
					text:
						`${savedIds.has(conference.id) ? "⭐" : "📌"} ` +
						`${conference.title} ${conference.year}`,

					callback_data: `conf:${conference.id}`,
				},
			]
		),
	};
}

/* =========================================================
	 CONFERENCE DETAIL
	 ========================================================= */

export function conferenceDetailKeyboard(
	conference: DbConference,
	saved: boolean,
	muted = false
): InlineKeyboardMarkup {

	const rows: Row[] = [];

	rows.push([
		{
			text: saved ? "⭐ Saved" : "☆ Save",
			callback_data:
				`${saved ? "unsave" : "save"}:${conference.id}`,
		},
		{
			text: "🔔 Remind me",
			callback_data: `remind:${conference.id}`,
		},
	]);

	const calendar =
		googleCalendarUrl(conference);

	const calendarRow: Row = [];

	if (calendar) {

		calendarRow.push({
			text: "📅 Google Calendar",
			url: calendar,
		});
	}

	calendarRow.push({
		text: "📆 .ics",
		callback_data: `ics:conf:${conference.id}`,
	});

	rows.push(calendarRow);

	const linkRow: Row = [];

	if (conference.link) {

		linkRow.push({
			text: "🌐 Website",
			url: conference.link,
		});
	}

	if (conference.cfp_link && conference.cfp_link !== conference.link) {

		linkRow.push({
			text: "📣 CFP",
			url: conference.cfp_link,
		});
	}

	if (conference.paperslink) {

		linkRow.push({
			text: "📚 Proceedings",
			url: conference.paperslink,
		});
	}

	if (linkRow.length) {
		rows.push(linkRow.slice(0, 3));
	}

	if (conference.pwclink) {

		rows.push([
			{
				text: "📈 Papers with Code",
				url: conference.pwclink,
			},
		]);
	}

	rows.push([
		{
			text: "🔗 Similar",
			callback_data: `similar:${conference.id}`,
		},
		{
			text: muted ? "🔕 Muted" : "🔔 Mute",
			callback_data:
				`${muted ? "unmute" : "mute"}:${conference.id}`,
		},
	]);

	/*
	 * Sharing: one button opens a chat picker, the other copies
	 * a deep link the recipient can open directly.
	 */
	rows.push([
		{
			text: "📤 Share",
			switch_inline_query_chosen_chat: {
				query: conference.title,
				allow_user_chats: true,
				allow_group_chats: true,
				allow_channel_chats: true,
			},
		},
		{
			text: "🔍 Find similar",
			switch_inline_query_current_chat:
				conference.title,
		},
	]);

	rows.push([
		{ text: "◀ Back", callback_data: "back" },
		{ text: "🏠 Menu", callback_data: "menu:main" },
	]);

	return { inline_keyboard: rows };
}

/* =========================================================
	 REMINDERS
	 ========================================================= */

export function reminderMenu(
	conferenceId: string,
	hasAbstract: boolean,
	hasEventDate: boolean
): InlineKeyboardMarkup {

	const rows: Row[] = [];

	rows.push([
		{
			text: "⚡ Escalating (30 → 7 → 3 → 1)",
			callback_data: `setrem:${conferenceId}:paper:escalate`,
		},
	]);

	rows.push(
		...grid(
			REMINDER_OFFSETS.map(
				days => ({
					text: `📄 ${days}d`,
					callback_data:
						`setrem:${conferenceId}:paper:${days}`,
				})
			),
			3
		)
	);

	if (hasAbstract) {

		rows.push(
			...grid(
				[7, 3, 1].map(
					days => ({
						text: `📝 abs ${days}d`,
						callback_data:
							`setrem:${conferenceId}:abstract:${days}`,
					})
				),
				3
			)
		);
	}

	if (hasEventDate) {

		rows.push(
			...grid(
				[30, 14].map(
					days => ({
						text: `✈️ travel ${days}d`,
						callback_data:
							`setrem:${conferenceId}:event:${days}`,
					})
				),
				2
			)
		);
	}

	rows.push(navRow(`conf:${conferenceId}`));

	return { inline_keyboard: rows };
}

export interface ReminderRow {
	id: number;
	kind: string;
	days_before: number;
	title: string;
	year: number;
}

export function remindersKeyboard(
	reminders: ReminderRow[]
): InlineKeyboardMarkup {

	const rows: Row[] =
		reminders.slice(0, 20).map(
			reminder => [
				{
					text:
						`🗑 ${reminder.title} ${reminder.year} · ` +
						`${reminder.kind} ${reminder.days_before}d`,

					callback_data: `delrem:${reminder.id}`,
				},
			]
		);

	rows.push([
		{
			text: "📅 Upcoming",
			callback_data: "list:upcoming:1",
		},
		{ text: "🏠 Menu", callback_data: "menu:main" },
	]);

	return { inline_keyboard: rows };
}

/* =========================================================
	 SAVED SEARCHES
	 ========================================================= */

export function savedSearchesKeyboard(
	searches: SavedSearch[]
): InlineKeyboardMarkup {

	const rows: Row[] =
		searches.map(
			search => [
				{
					text: `🔎 ${search.query}`,
					callback_data: `runsearch:${search.id}`,
				},
				{
					text: "🗑",
					callback_data: `delsearch:${search.id}`,
				},
			]
		);

	rows.push([
		{
			text: "➕ Save a new search",
			callback_data: "prompt:save_search",
		},
	]);

	rows.push(navRow("settings"));

	return { inline_keyboard: rows };
}

/* =========================================================
	 SETTINGS
	 ========================================================= */

export function settingsMenu(
	user: User | null
): InlineKeyboardMarkup {

	const frequency =
		user?.digest_frequency ?? "daily";

	const enabled =
		!!user?.daily_digest_enabled && frequency !== "off";

	const rows: Row[] = [
		[
			{
				text:
					`${DIGEST_FREQUENCY_LABELS[frequency] ?? "📨 Daily"}` +
					` digest`,
				callback_data: "settings:digest",
			},
		],
	];

	if (enabled) {

		rows.push([
			{
				text: `🕘 Hour: ${user?.daily_digest_hour_utc ?? 9}:00 UTC`,
				callback_data: "settings:digesthour",
			},

			...(frequency === "weekly"
				? [
					{
						text:
							`📆 ${WEEKDAY_LABELS[
								user?.digest_weekday ?? 1
							]}`,
						callback_data: "settings:digestday",
					},
				]
				: []),
		]);
	}

	rows.push([
		{
			text:
				user?.quiet_hours_start === null ||
					user?.quiet_hours_start === undefined
					? "🌙 Quiet hours: off"
					: `🌙 Quiet ${user.quiet_hours_start}:00–` +
					`${user.quiet_hours_end}:00`,
			callback_data: "settings:quiet",
		},
	]);

	rows.push([
		{
			text: "🧠 Topics",
			callback_data: "settings:topics",
		},
		{
			text: "🌍 Locations",
			callback_data: "settings:locations",
		},
	]);

	rows.push([
		{
			text:
				`↕️ Sort: ${SORT_LABELS[
					user?.sort_preference ?? "deadline"
				]}`,
			callback_data: "menu:sort:settings",
		},
	]);

	rows.push([
		{
			text:
				user?.auto_reminder_days
					? `🔔 Auto-remind: ${user.auto_reminder_days}d`
					: "🔔 Auto-remind: off",
			callback_data: "settings:autoremind",
		},
	]);

	rows.push([
		{
			text:
				`${user?.escalating_enabled ? "✅" : "☐"} ` +
				`Escalating reminders`,
			callback_data: "toggle:escalating",
		},
	]);

	rows.push([
		{
			text:
				`${user?.alert_new_conferences ? "✅" : "☐"} ` +
				`New conference alerts`,
			callback_data: "toggle:newconf",
		},
	]);

	rows.push([
		{
			text:
				`${user?.alert_deadline_changes ? "✅" : "☐"} ` +
				`Deadline change alerts`,
			callback_data: "toggle:changes",
		},
	]);

	rows.push([
		{
			text: "🔎 Saved searches",
			callback_data: "savedsearches",
		},
	]);

	rows.push([
		{
			text: `🕐 Timezone: ${user?.timezone ?? "UTC"}`,
			callback_data: "prompt:timezone",
		},
	]);

	rows.push([
		{
			text: "📆 Export my calendar",
			callback_data: "ics:saved",
		},
	]);

	rows.push([
		{ text: "🏠 Menu", callback_data: "menu:main" },
	]);

	return { inline_keyboard: rows };
}

export function digestFrequencyMenu(
	current: string
): InlineKeyboardMarkup {

	const rows =
		grid(
			Object.entries(DIGEST_FREQUENCY_LABELS).map(
				([key, label]) => ({
					text: key === current ? `✅ ${label}` : label,
					callback_data: `digest:${key}`,
				})
			),
			3
		);

	rows.push(navRow("settings"));

	return { inline_keyboard: rows };
}

/**
 * Hour pickers are laid out 6 per row so all 24 fit without
 * scrolling.
 */
export function hourMenu(
	prefix: string,
	current: number | null
): InlineKeyboardMarkup {

	const rows =
		grid(
			Array.from({ length: 24 }, (_, hour) => ({
				text:
					hour === current
						? `✅${hour}`
						: String(hour),
				callback_data: `${prefix}:${hour}`,
			})),
			6
		);

	rows.push(navRow("settings"));

	return { inline_keyboard: rows };
}

export function weekdayMenu(
	current: number
): InlineKeyboardMarkup {

	const rows =
		grid(
			WEEKDAY_LABELS.map(
				(label, index) => ({
					text:
						index === current
							? `✅ ${label.slice(0, 3)}`
							: label.slice(0, 3),
					callback_data: `digestday:${index}`,
				})
			),
			4
		);

	rows.push(navRow("settings"));

	return { inline_keyboard: rows };
}

export function quietHoursMenu(
	start: number | null
): InlineKeyboardMarkup {

	const rows: Row[] = [
		[
			{
				text: "🔕 Turn off quiet hours",
				callback_data: "quiet:off",
			},
		],
	];

	rows.push(
		...grid(
			[
				["22:00 – 08:00", "22:8"],
				["23:00 – 07:00", "23:7"],
				["00:00 – 09:00", "0:9"],
				["21:00 – 09:00", "21:9"],
			].map(
				([label, value]) => ({
					text:
						start !== null &&
							value.startsWith(`${start}:`)
							? `✅ ${label}`
							: label,
					callback_data: `quiet:${value}`,
				})
			),
			2
		)
	);

	rows.push(navRow("settings"));

	return { inline_keyboard: rows };
}

export function autoReminderMenu(
	current: number | null
): InlineKeyboardMarkup {

	const rows =
		grid(
			[null, 3, 7, 14, 30].map(
				days => ({
					text:
						days === null
							? current === null ? "✅ Off" : "Off"
							: days === current
								? `✅ ${days}d`
								: `${days}d`,

					callback_data:
						`autoremind:${days ?? "off"}`,
				})
			),
			3
		);

	rows.push(navRow("settings"));

	return { inline_keyboard: rows };
}

/* =========================================================
	 PREFERENCES
	 ========================================================= */

export function preferenceTopicsMenu(
	selected: string[]
): InlineKeyboardMarkup {

	const rows =
		grid(
			Object.entries(TOPICS).map(
				([code, label]) => ({
					text:
						`${selected.includes(code) ? "✅" : "☐"} ${label}`,
					callback_data: `pref:topic:${code}`,
				})
			),
			2
		);

	rows.push(navRow("settings"));

	return { inline_keyboard: rows };
}

export function preferenceLocationsMenu(
	selected: string[]
): InlineKeyboardMarkup {

	const rows =
		grid(
			LOCATIONS.map(
				([label, value]) => ({
					text:
						`${selected.includes(value) ? "✅" : "☐"} ${label}`,
					callback_data: `pref:location:${value}`,
				})
			),
			2
		);

	rows.push(navRow("settings"));

	return { inline_keyboard: rows };
}
