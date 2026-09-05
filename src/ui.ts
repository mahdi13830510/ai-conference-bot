import {
	DbConference,
	InlineKeyboardMarkup,
} from "./types";

import {
	parseTopics,
} from "./conferences";

import {
	PAGE_SIZE,
} from "./config";

/* =========================================================
	 MAIN MENU
	 ========================================================= */

export function mainMenu():
	InlineKeyboardMarkup {

	return {
		inline_keyboard: [

			[
				{
					text: "📅 Upcoming",
					callback_data:
						"list:upcoming:1",
				},
			],

			[
				{
					text: "🔎 Search",
					switch_inline_query_current_chat:
						"",
				},

				{
					text: "🏷 Topics",
					callback_data:
						"menu:topics",
				},
			],

			[
				{
					text: "🌍 Locations",
					callback_data:
						"menu:locations",
				},
			],

			[
				{
					text: "⭐ Saved",
					callback_data:
						"list:saved:1",
				},

				{
					text: "🔔 Reminders",
					callback_data:
						"reminders",
				},
			],

			[
				{
					text: "🎯 My Feed",
					callback_data:
						"list:feed:1",
				},

				{
					text: "⚙️ Settings",
					callback_data:
						"settings",
				},
			],

			[
				{
					text: "ℹ️ Help",
					callback_data:
						"help",
				},
			],
		],
	};
}

/* =========================================================
	 TOPICS
	 ========================================================= */

export const TOPICS: Record<
	string,
	string
> = {
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

export function topicsMenu():
	InlineKeyboardMarkup {

	const buttons =
		Object.entries(TOPICS)
			.map(
				([code, label]) => ({
					text: label,
					callback_data:
						`list:topic:${code}:1`,
				})
			);

	const rows:
		Array<
			ReturnType<
				typeof topicsMenu
			>["inline_keyboard"][number]
		> = [];

	for (
		let i = 0;
		i < buttons.length;
		i += 2
	) {

		rows.push(
			buttons.slice(
				i,
				i + 2
			)
		);
	}

	rows.push([
		{
			text: "◀ Back",
			callback_data: "menu:main",
		},
	]);

	return {
		inline_keyboard: rows,
	};
}

/* =========================================================
	 LOCATIONS
	 ========================================================= */

const LOCATIONS = [
	["🇹🇷 Turkey", "Turkey"],
	["🇳🇱 Netherlands", "Netherlands"],
	["🇩🇪 Germany", "Germany"],
	["🇫🇷 France", "France"],
	["🇬🇧 United Kingdom", "UK"],
	["🇮🇹 Italy", "Italy"],
	["🇪🇸 Spain", "Spain"],
	["🇬🇷 Greece", "Greece"],
	["🇨🇭 Switzerland", "Switzerland"],
	["🇺🇸 USA", "USA"],
	["🇨🇦 Canada", "Canada"],
	["🇯🇵 Japan", "Japan"],
	["🇰🇷 Korea", "Korea"],
	["🇨🇳 China", "China"],
] as const;

export function locationsMenu():
	InlineKeyboardMarkup {

	const rows:
		Array<
			{
				text: string;
				callback_data: string;
			}[]
		> = [];

	for (
		let i = 0;
		i < LOCATIONS.length;
		i += 2
	) {

		rows.push(
			LOCATIONS
				.slice(i, i + 2)
				.map(
					([text, value]) => ({
						text,
						callback_data:
							`list:location:${value}:1`,
					})
				)
		);
	}

	rows.push([
		{
			text: "🇪🇺 Europe",
			callback_data:
				"list:region:europe:1",
		},

		{
			text: "🌏 Asia",
			callback_data:
				"list:region:asia:1",
		},
	]);

	rows.push([
		{
			text: "🌎 North America",
			callback_data:
				"list:region:north-america:1",
		},
	]);

	rows.push([
		{
			text: "🌍 Worldwide",
			callback_data:
				"list:upcoming:1",
		},
	]);

	rows.push([
		{
			text: "◀ Back",
			callback_data:
				"menu:main",
		},
	]);

	return {
		inline_keyboard: rows,
	};
}

/* =========================================================
	 PAGINATION
	 ========================================================= */

export function pagination(
	page: number,
	total: number,
	prefix: string
): InlineKeyboardMarkup {

	const pages =
		Math.max(
			1,
			Math.ceil(
				total / PAGE_SIZE
			)
		);

	const row: {
		text: string;
		callback_data: string;
	}[] = [];

	if (page > 1) {
		row.push({
			text: "◀",
			callback_data:
				`${prefix}:${page - 1}`,
		});
	}

	row.push({
		text:
			`${page} / ${pages}`,
		callback_data:
			"noop",
	});

	if (page < pages) {
		row.push({
			text: "▶",
			callback_data:
				`${prefix}:${page + 1}`,
		});
	}

	return {
		inline_keyboard: [
			row,
			[
				{
					text: "🏠 Menu",
					callback_data:
						"menu:main",
				},
			],
		],
	};
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
			(conference) => [

				{
					text:
						`${savedIds.has(conference.id) ? "⭐" : "📌"} ` +
						`${conference.title} ${conference.year}`,

					callback_data:
						`conf:${conference.id}`,
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
	saved: boolean
): InlineKeyboardMarkup {

	const rows = [];

	if (conference.link) {

		rows.push([
			{
				text:
					"🌐 Official Website",
				url:
					conference.link,
			},
		]);
	}

	rows.push([
		{
			text:
				saved
					? "❌ Remove from Saved"
					: "⭐ Save",

			callback_data:
				saved
					? `unsave:${conference.id}`
					: `save:${conference.id}`,
		},
	]);

	rows.push([
		{
			text: "🔔 Remind Me",
			callback_data:
				`remind:${conference.id}`,
		},
	]);

	rows.push([
		{
			text: "◀ Back",
			callback_data:
				"menu:main",
		},
	]);

	return {
		inline_keyboard:
			rows,
	};
}

/* =========================================================
	 REMINDER MENU
	 ========================================================= */

export function reminderMenu(
	conferenceId: string
): InlineKeyboardMarkup {

	const options = [
		[30, 14],
		[7, 3],
		[1],
	];

	const rows =
		options.map(
			(row) =>
				row.map(
					(days) => ({
						text:
							`${days} days before`,
						callback_data:
							`setrem:${conferenceId}:${days}`,
					})
				)
		);

	rows.push([
		{
			text: "◀ Back",
			callback_data:
				`conf:${conferenceId}`,
		},
	]);

	return {
		inline_keyboard:
			rows,
	};
}

/* =========================================================
	 SETTINGS
	 ========================================================= */

export function settingsMenu(
	digestEnabled: boolean
):
	InlineKeyboardMarkup {

	return {
		inline_keyboard: [

			[
				{
					text:
						digestEnabled
							? "🔕 Disable Daily Digest"
							: "🔔 Enable Daily Digest",

					callback_data:
						digestEnabled
							? "digest:off"
							: "digest:on",
				},
			],

			[
				{
					text:
						"🧠 Topics",
					callback_data:
						"settings:topics",
				},

				{
					text:
						"🌍 Locations",
					callback_data:
						"settings:locations",
				},
			],

			[
				{
					text:
						"🏠 Main Menu",
					callback_data:
						"menu:main",
				},
			],
		],
	};
}

/* =========================================================
	 PREFERENCES
	 ========================================================= */

export function preferenceTopicsMenu(
	selected: string[]
):
	InlineKeyboardMarkup {

	const selectedSet =
		new Set(selected);

	const rows = [];

	const entries =
		Object.entries(TOPICS);

	for (
		let i = 0;
		i < entries.length;
		i += 2
	) {

		rows.push(
			entries
				.slice(i, i + 2)
				.map(
					([code, label]) => ({
						text:
							`${selectedSet.has(code) ? "✅" : "⬜"} ` +
							label,

						callback_data:
							`pref:topic:${code}`,
					})
				)
		);
	}

	rows.push([
		{
			text:
				"◀ Settings",
			callback_data:
				"settings",
		},
	]);

	return {
		inline_keyboard:
			rows,
	};
}

export function preferenceLocationsMenu(
	selected: string[]
):
	InlineKeyboardMarkup {

	const selectedSet =
		new Set(selected);

	const rows =
		LOCATIONS.map(
			([text, value]) => [
				{
					text:
						`${selectedSet.has(value) ? "✅" : "⬜"} ${text}`,

					callback_data:
						`pref:location:${value}`,
				},
			]
		);

	rows.push([
		{
			text:
				"◀ Settings",
			callback_data:
				"settings",
		},
	]);

	return {
		inline_keyboard:
			rows,
	};
}
