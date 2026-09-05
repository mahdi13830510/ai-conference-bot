import {
	Env,
} from "../types";

import {
	sendMessage,
} from "../telegram";

import {
	getUser,
	listReminders,
} from "../database";

import {
	mainMenu,
	settingsMenu,
} from "../ui";

import {
	formatDate,
} from "../format";

/**
 * Static views: the welcome screen, the reminder list,
 * settings and help.
 */

export async function showStart(
	env: Env,
	chatId: number
) {

	await sendMessage(
		env,
		chatId,
		`🤖 AI Conference Deadlines

Find AI/ML conferences, paper deadlines, locations and topics.

You can search, filter, save conferences and receive deadline reminders.

Choose an option below:`,
		mainMenu()
	);
}

export async function showReminders(
	env: Env,
	chatId: number
) {

	const reminders =
		await listReminders(
			env,
			String(chatId)
		);

	if (!reminders.length) {

		await sendMessage(
			env,
			chatId,
			`🔔 You don't have any reminders yet.

Open a conference and press "🔔 Remind Me".`,
			{
				inline_keyboard: [
					[
						{
							text:
								"📅 Upcoming Conferences",
							callback_data:
								"list:upcoming:1",
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
			}
		);

		return;
	}

	let text =
		"🔔 Your Reminders\n\n";

	for (const reminder of reminders) {

		text +=
			`• ${reminder.title}\n` +
			`  ${reminder.days_before} days before\n` +
			`  ${formatDate(
				reminder.deadline
			)}\n\n`;
	}

	await sendMessage(
		env,
		chatId,
		text,
		{
			inline_keyboard: [
				[
					{
						text:
							"🏠 Main Menu",
						callback_data:
							"menu:main",
					},
				],
			],
		}
	);
}

/* =========================================================
	 SETTINGS
	 ========================================================= */

export async function showSettings(
	env: Env,
	chatId: number
) {

	const user =
		await getUser(
			env,
			String(chatId)
		);

	const enabled =
		!!user?.daily_digest_enabled;

	await sendMessage(
		env,
		chatId,
		`⚙️ Settings

Daily digest:
${enabled
			? "🟢 Enabled"
			: "🔴 Disabled"
		}

Timezone:
${user?.timezone || "UTC"}`,
		settingsMenu(
			enabled
		)
	);
}

/* =========================================================
	 HELP
	 ========================================================= */

export async function showHelp(
	env: Env,
	chatId: number
) {

	await sendMessage(
		env,
		chatId,
		`ℹ️ AI Conference Deadlines

Find AI conferences and paper deadlines.

Commands:

/upcoming
/search federated learning
/topics
/locations
/saved
/reminders
/myfeed
/settings

Examples:

/search federated learning

/search privacy

/location Germany

You can also use the bot inline from any chat:

@YourBot machine learning

Features:

📅 Deadline tracking
🏷 Topic filtering
🌍 Location filtering
🔎 Search
⭐ Saved conferences
🔔 Reminders
🎯 Personalized feed
📨 Daily digest

⚠️ Some deadlines in the source are predicted. Always verify important deadlines on the official conference website.`
	);
}
