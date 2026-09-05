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
	sweepCallbackTokens,
	sweepProcessedUpdates,
	sweepNotificationLog,
} from "../database";

import {
	getFutureConferences,
} from "../conferences";

import {
	fetchAllSources,
	SOURCES,
} from "../sources";

import {
	escapeHtml,
	formatDate,
} from "../format";

import {
	CORE_SOURCE,
} from "../enrich";

/**
 * Admin-only commands, gated on ADMIN_TELEGRAM_ID.
 */
export async function handleAdmin(
	env: Env,
	chatId: number,
	argument: string
): Promise<void> {

	if (String(chatId) !== env.ADMIN_TELEGRAM_ID) {

		await sendMessage(
			env,
			chatId,
			"❌ Unauthorized."
		);

		return;
	}

	const [subcommand, ...rest] =
		argument.trim().split(/\s+/);

	if (subcommand === "sync") {

		await runSync(env, chatId, rest);
		return;
	}

	if (subcommand === "sources") {

		await sendMessage(
			env,
			chatId,
			`🔌 <b>Sources</b>\n\n` +
			SOURCES.map(
				source =>
					`• <code>${escapeHtml(source.name)}</code> — ` +
					`${escapeHtml(source.label)}` +
					`${source.enabledByDefault ? " (default)" : ""}`
			).join("\n") +
			`\n\nRun one with <code>/admin sync ${SOURCES
				.map(source => source.name)
				.join(",")}</code>`
		);

		return;
	}

	if (subcommand === "sweep") {

		await Promise.all([
			sweepCallbackTokens(env),
			sweepProcessedUpdates(env),
			sweepNotificationLog(env),
		]);

		await sendMessage(env, chatId, "🧹 Housekeeping done.");
		return;
	}

	await showStats(env, chatId);
}

async function runSync(
	env: Env,
	chatId: number,
	rest: string[]
): Promise<void> {

	const include =
		rest[0]
			? rest[0].split(",").map(name => name.trim())
			: undefined;

	await sendMessage(
		env,
		chatId,
		`🔄 Synchronizing${
			include ? ` from ${escapeHtml(include.join(", "))}` : ""
		}…`
	);

	try {

		const { conferences, results } =
			await fetchAllSources({ include });

		const future =
			getFutureConferences(conferences);

		const result =
			await syncConferences(env, future);

		const report =
			results
				.map(
					entry =>
						`• <code>${escapeHtml(entry.source)}</code>: ` +
						(entry.error
							? `❌ ${escapeHtml(entry.error)}`
							: `${entry.fetched} fetched`)
				)
				.join("\n");

		await sendMessage(
			env,
			chatId,
			`✅ <b>Sync complete</b>\n\n` +
			`${report}\n\n` +
			`Merged: ${conferences.length}\n` +
			`With future deadlines: ${future.length}\n` +
			`New: ${result.inserted.length}\n` +
			`Updated: ${result.updated}\n` +
			`Deadlines moved: ${result.changed.length}`
		);

	} catch (error) {

		console.error("Admin sync failed:", error);

		await sendMessage(
			env,
			chatId,
			`❌ Sync failed.\n\n<code>${escapeHtml(
				error instanceof Error ? error.message : String(error)
			)}</code>`
		);
	}
}

async function showStats(
	env: Env,
	chatId: number
): Promise<void> {

	const [stats, lastSync] =
		await Promise.all([
			getStats(env),
			getMetadata(env, "last_sync"),
		]);

	await sendMessage(
		env,
		chatId,
		`👨‍💻 <b>Admin</b>\n\n` +
		`👥 Users: ${stats.users}\n` +
		`📅 Future conferences: ${stats.conferences}\n` +
		`⭐ Saved: ${stats.saved}\n` +
		`🔔 Active reminders: ${stats.reminders}\n\n` +
		`🔄 Last sync: ${
			lastSync ? escapeHtml(formatDate(lastSync, "UTC", true)) : "never"
		}\n` +
		`🏅 Rankings: ${escapeHtml(CORE_SOURCE)}\n\n` +
		`<b>Commands</b>\n` +
		`<code>/admin sync</code>\n` +
		`<code>/admin sync ai-deadlines,wikicfp</code>\n` +
		`<code>/admin sources</code>\n` +
		`<code>/admin sweep</code>`
	);
}
