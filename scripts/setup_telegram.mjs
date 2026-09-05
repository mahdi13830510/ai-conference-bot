/**
 * Registers the bot's commands, profile text, menu button and
 * webhook with Telegram.
 *
 *   export TELEGRAM_BOT_TOKEN=...
 *   export WORKER_URL=https://<worker>.workers.dev
 *   export TELEGRAM_WEBHOOK_SECRET=...      # optional, recommended
 *   export ADMIN_TELEGRAM_ID=...            # optional
 *   node scripts/setup_telegram.mjs
 */

const token =
	process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
	console.error("Missing TELEGRAM_BOT_TOKEN");
	process.exit(1);
}

const api =
	`https://api.telegram.org/bot${token}`;

const workerUrl =
	process.env.WORKER_URL
		? process.env.WORKER_URL.replace(/\/$/, "")
		: null;

async function call(
	method,
	body
) {

	const response =
		await fetch(`${api}/${method}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

	const data =
		await response.json();

	if (!data.ok) {
		throw new Error(`${method}: ${data.description}`);
	}

	console.log(`${method}: OK`);

	return data.result;
}

/* =========================================================
	 COMMANDS
	 ========================================================= */

const PUBLIC_COMMANDS = [
	{ command: "start", description: "Open the main menu" },
	{ command: "upcoming", description: "Upcoming conference deadlines" },
	{ command: "myfeed", description: "Your personalized feed" },
	{ command: "timeline", description: "What is due when" },
	{ command: "search", description: "Search conferences" },
	{ command: "topics", description: "Browse by topic" },
	{ command: "locations", description: "Browse by location" },
	{ command: "rank", description: "Filter by CORE rank" },
	{ command: "format", description: "In person, virtual or hybrid" },
	{ command: "deadline", description: "Closing in the next N days" },
	{ command: "nextweek", description: "Deadlines within 7 days" },
	{ command: "thismonth", description: "Deadlines within 30 days" },
	{ command: "saved", description: "Your saved conferences" },
	{ command: "reminders", description: "View and delete reminders" },
	{ command: "watch", description: "Alert me on new matches" },
	{ command: "export", description: "Export saved conferences (.ics)" },
	{ command: "settings", description: "Digest, quiet hours, sorting" },
	{ command: "timezone", description: "Set your timezone" },
	{ command: "help", description: "How to use this bot" },
];

/*
 * Telegram shows at most 100 commands, but long lists are hard
 * to scan; groups get the browsing subset only.
 */
const GROUP_COMMANDS =
	PUBLIC_COMMANDS.filter(
		entry =>
			[
				"start", "upcoming", "search", "topics",
				"deadline", "help",
			].includes(entry.command)
	);

for (const scope of [
	{ type: "default" },
	{ type: "all_private_chats" },
]) {

	await call("setMyCommands", {
		commands: PUBLIC_COMMANDS,
		scope,
	});
}

await call("setMyCommands", {
	commands: GROUP_COMMANDS,
	scope: { type: "all_group_chats" },
});

/*
 * /admin is deliberately absent from every list above; it is
 * registered only for the admin's own chat.
 */
if (process.env.ADMIN_TELEGRAM_ID) {

	await call("setMyCommands", {
		commands: [
			...PUBLIC_COMMANDS,
			{ command: "admin", description: "Stats and manual sync" },
		],
		scope: {
			type: "chat",
			chat_id: Number(process.env.ADMIN_TELEGRAM_ID),
		},
	});
}

/* =========================================================
	 LOCALIZED COMMANDS
	 ========================================================= */

/*
 * Descriptions only; the commands themselves stay in English so
 * that muscle memory works across languages.
 */
const TRANSLATIONS = {
	es: {
		start: "Abrir el menú principal",
		upcoming: "Próximos plazos de conferencias",
		search: "Buscar conferencias",
		saved: "Tus conferencias guardadas",
		reminders: "Ver y borrar recordatorios",
		settings: "Ajustes",
		help: "Cómo usar este bot",
	},
	de: {
		start: "Hauptmenü öffnen",
		upcoming: "Kommende Einreichfristen",
		search: "Konferenzen suchen",
		saved: "Gespeicherte Konferenzen",
		reminders: "Erinnerungen ansehen und löschen",
		settings: "Einstellungen",
		help: "Anleitung",
	},
	fr: {
		start: "Ouvrir le menu principal",
		upcoming: "Prochaines dates limites",
		search: "Rechercher des conférences",
		saved: "Vos conférences enregistrées",
		reminders: "Voir et supprimer les rappels",
		settings: "Paramètres",
		help: "Comment utiliser ce bot",
	},
	zh: {
		start: "打开主菜单",
		upcoming: "即将到来的截稿日期",
		search: "搜索会议",
		saved: "已保存的会议",
		reminders: "查看和删除提醒",
		settings: "设置",
		help: "使用说明",
	},
};

for (const [language, descriptions] of Object.entries(TRANSLATIONS)) {

	const commands =
		Object.entries(descriptions).map(
			([command, description]) => ({ command, description })
		);

	await call("setMyCommands", {
		commands,
		scope: { type: "all_private_chats" },
		language_code: language,
	});
}

/* =========================================================
	 PROFILE
	 ========================================================= */

await call("setMyShortDescription", {
	short_description:
		"Track AI/ML conference paper deadlines, with reminders, " +
		"CORE rankings and a personalized feed.",
});

await call("setMyDescription", {
	description:
		"I track paper deadlines for AI and ML conferences.\n\n" +
		"Search by topic, location, CORE rank or format, save the " +
		"ones you care about, and get reminded before they close. " +
		"Works inline in any chat.\n\n" +
		"Press Start to begin.",
});

/* =========================================================
	 MENU BUTTON
	 ========================================================= */

if (workerUrl) {

	await call("setChatMenuButton", {
		menu_button: {
			type: "web_app",
			text: "Browse",
			web_app: { url: `${workerUrl}/app` },
		},
	});

} else {

	await call("setChatMenuButton", {
		menu_button: { type: "commands" },
	});
}

/* =========================================================
	 WEBHOOK
	 ========================================================= */

if (workerUrl) {

	await call("setWebhook", {
		url: `${workerUrl}/telegram`,

		secret_token:
			process.env.TELEGRAM_WEBHOOK_SECRET || undefined,

		allowed_updates: [
			"message",
			"callback_query",
			"inline_query",
			"my_chat_member",
		],

		drop_pending_updates: false,
	});

	if (!process.env.TELEGRAM_WEBHOOK_SECRET) {

		console.warn(
			"\n⚠️  TELEGRAM_WEBHOOK_SECRET was not set. Anyone who " +
			"learns your worker URL can post forged updates.\n"
		);
	}

} else {

	console.log("WORKER_URL not set, skipping setWebhook.");
}

console.log("\nTelegram configuration complete.");

if (workerUrl) {

	console.log(
		`\nInline mode and the Mini App must also be enabled via ` +
		`@BotFather:\n` +
		`  /setinline   — enable inline queries\n` +
		`  /newapp      — register ${workerUrl}/app as a Mini App\n`
	);
}
