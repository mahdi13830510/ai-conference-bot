const token =
	process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
	console.error(
		"Missing TELEGRAM_BOT_TOKEN"
	);

	process.exit(1);
}

const api =
	`https://api.telegram.org/bot${token}`;

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
		description: "Your personalized conference feed",
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

async function call(
	method,
	body
) {

	const response =
		await fetch(
			`${api}/${method}`,
			{
				method: "POST",

				headers: {
					"Content-Type":
						"application/json",
				},

				body:
					JSON.stringify(body),
			}
		);

	const data =
		await response.json();

	if (!data.ok) {
		throw new Error(
			`${method}: ${data.description}`
		);
	}

	console.log(
		`${method}: OK`
	);
}

await call(
	"setMyCommands",
	{
		commands,

		scope: {
			type: "default",
		},
	}
);

await call(
	"setMyCommands",
	{
		commands,

		scope: {
			type: "all_private_chats",
		},
	}
);

await call(
	"setMyCommands",
	{
		commands,

		scope: {
			type: "all_group_chats",
		},
	}
);

await call(
	"setChatMenuButton",
	{
		menu_button: {
			type: "commands",
		},
	}
);

const workerUrl =
	process.env.WORKER_URL;

if (workerUrl) {

	await call(
		"setWebhook",
		{
			url:
				`${workerUrl.replace(/\/$/, "")}/telegram`,

			allowed_updates: [
				"message",
				"callback_query",
				"inline_query",
			],
		}
	);

} else {

	console.log(
		"WORKER_URL not set, skipping setWebhook."
	);
}

console.log(
	"Telegram configuration complete."
);
