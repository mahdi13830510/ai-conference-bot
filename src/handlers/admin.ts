import {
	Env,
} from "../types";

import {
	sendMessage,
} from "../telegram";

import {
	syncConferences,
	getMetadata,
	getStats,
} from "../database";

import {
	fetchConferences,
	getFutureConferences,
} from "../conferences";

/**
 * Admin-only commands, gated on ADMIN_TELEGRAM_ID.
 */

export async function handleAdmin(
	env: Env,
	chatId: number,
	argument: string
) {

	if (
		String(chatId) !==
		env.ADMIN_TELEGRAM_ID
	) {

		await sendMessage(
			env,
			chatId,
			"❌ Unauthorized."
		);

		return;
	}

	if (
		argument === "sync"
	) {

		await sendMessage(
			env,
			chatId,
			"🔄 Synchronizing conferences..."
		);

		try {

			const conferences =
				await fetchConferences();

			const future =
				getFutureConferences(
					conferences
				);

			const result =
				await syncConferences(
					env,
					future
				);

			await sendMessage(
				env,
				chatId,
				`✅ Sync completed.

Fetched: ${future.length}
New: ${result.inserted.length}
Updated: ${result.updated}`
			);

		} catch (error) {

			console.error(
				error
			);

			await sendMessage(
				env,
				chatId,
				"❌ Sync failed. Check Worker logs."
			);
		}

		return;
	}

	const stats =
		await getStats(
			env
		);

	const lastSync =
		await getMetadata(
			env,
			"last_sync"
		);

	await sendMessage(
		env,
		chatId,
		`👨‍💻 Admin

👥 Users: ${stats.users}

📅 Future conferences:
${stats.conferences}

⭐ Saved:
${stats.saved}

🔔 Active reminders:
${stats.reminders}

🔄 Last sync:
${lastSync || "Never"}

Commands:

/admin sync`
	);
}
