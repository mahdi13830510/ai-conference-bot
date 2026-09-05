import {
	Env,
	User,
	ReminderKind,
} from "../types";

import {
	sendMessage,
	editMessageText,
} from "../telegram";

import {
	getConference,
	isSaved,
	isMuted,
	createReminder,
	getUser,
	getAcceptanceRates,
	getVenueHistory,
	getCountryInfo,
} from "../database";

import {
	conferenceDetailKeyboard,
	reminderMenu,
} from "../ui";

import {
	conferenceText,
	formatDate,
} from "../format";

import {
	ESCALATING_OFFSETS,
	REMINDER_KIND_LABELS,
	EFFECT_CONFETTI,
} from "../config";

/**
 * Conference detail view, enriched with the ranking, historical
 * acceptance rates, past editions and travel pointers.
 */
export async function showConference(
	env: Env,
	chatId: number,
	conferenceId: string,
	messageId?: number,
	user?: User | null
): Promise<void> {

	const conference =
		await getConference(env, conferenceId);

	if (!conference) {

		await sendMessage(
			env,
			chatId,
			"❌ Conference not found."
		);

		return;
	}

	const userId =
		String(chatId);

	const viewer =
		user ?? await getUser(env, userId);

	const [saved, muted, rates, history, country] =
		await Promise.all([
			isSaved(env, userId, conferenceId),
			isMuted(env, userId, conferenceId),
			getAcceptanceRates(env, conference.title),
			getVenueHistory(env, conference.title, conference.year),
			conference.country
				? getCountryInfo(env, conference.country)
				: Promise.resolve(null),
		]);

	const text =
		conferenceText(
			conference,
			{
				timezone: viewer?.timezone ?? "UTC",
				rates,
				history,
				country,
			}
		);

	const markup =
		conferenceDetailKeyboard(conference, saved, muted);

	/*
	 * The website link is worth a preview; everything else is
	 * noise, so previews stay off unless there is a link.
	 */
	const options =
		conference.link
			? {
				linkPreview: {
					url: conference.link,
					prefer_small_media: true,
				},
			}
			: {};

	if (messageId) {

		await editMessageText(
			env,
			chatId,
			messageId,
			text,
			markup,
			options
		);

		return;
	}

	await sendMessage(env, chatId, text, markup, options);
}

/* =========================================================
	 REMINDERS
	 ========================================================= */

export async function showReminderMenu(
	env: Env,
	chatId: number,
	conferenceId: string,
	messageId?: number
): Promise<void> {

	const conference =
		await getConference(env, conferenceId);

	if (!conference) {
		return;
	}

	const text =
		`🔔 <b>Reminders for ${conference.title} ` +
		`${conference.year}</b>\n\n` +
		`Pick a single offset, or turn on the escalating ` +
		`sequence to be nudged at 30, 7, 3 and 1 days.`;

	const markup =
		reminderMenu(
			conferenceId,
			!!conference.abstract_deadline_utc,
			!!conference.start
		);

	if (messageId) {

		await editMessageText(
			env,
			chatId,
			messageId,
			text,
			markup
		);

		return;
	}

	await sendMessage(env, chatId, text, markup);
}

/**
 * The date a reminder counts back from, per kind.
 */
function baseDate(
	conference: {
		deadline_utc: string | null;
		abstract_deadline_utc: string | null;
		start: string | null;
	},
	kind: ReminderKind
): string | null {

	switch (kind) {

		case "abstract":
			return conference.abstract_deadline_utc;

		case "event":
			return conference.start
				? `${conference.start}T09:00:00Z`
				: null;

		default:
			return conference.deadline_utc;
	}
}

export async function createConferenceReminder(
	env: Env,
	chatId: number,
	conferenceId: string,
	kind: ReminderKind,
	daysBefore: number | "escalate"
): Promise<void> {

	const conference =
		await getConference(env, conferenceId);

	if (!conference) {

		await sendMessage(
			env,
			chatId,
			"❌ Conference not found."
		);

		return;
	}

	const base =
		baseDate(conference, kind);

	if (!base) {

		await sendMessage(
			env,
			chatId,
			`❌ This conference has no ` +
			`${REMINDER_KIND_LABELS[kind] ?? kind} to count back from.`
		);

		return;
	}

	const baseTime =
		new Date(base).getTime();

	const offsets =
		daysBefore === "escalate"
			? ESCALATING_OFFSETS
			: [daysBefore];

	const created: number[] = [];

	const skipped: number[] = [];

	for (const days of offsets) {

		const remindAt =
			new Date(baseTime - days * 86_400_000);

		if (remindAt.getTime() <= Date.now()) {
			skipped.push(days);
			continue;
		}

		await createReminder(
			env,
			String(chatId),
			conferenceId,
			days,
			remindAt.toISOString(),
			kind
		);

		created.push(days);
	}

	if (!created.length) {

		await sendMessage(
			env,
			chatId,
			`⚠️ Every one of those reminder times has already ` +
			`passed — the deadline is ${formatDate(base)}.`
		);

		return;
	}

	const viewer =
		await getUser(env, String(chatId));

	let text =
		`✅ <b>Reminder${created.length > 1 ? "s" : ""} set</b>\n\n` +
		`${conference.title} ${conference.year}\n` +
		`${REMINDER_KIND_LABELS[kind] ?? kind}\n\n` +
		`🔔 ${created.map(days => `${days}d`).join(" · ")} before\n` +
		`📅 ${formatDate(base, viewer?.timezone ?? "UTC", true)}`;

	if (skipped.length) {

		text +=
			`\n\n<i>Skipped ${skipped
				.map(days => `${days}d`)
				.join(", ")} — already in the past.</i>`;
	}

	await sendMessage(
		env,
		chatId,
		text,
		{
			inline_keyboard: [
				[
					{
						text: "◀ Back to conference",
						callback_data: `conf:${conferenceId}`,
					},
				],
				[
					{
						text: "🔔 My reminders",
						callback_data: "reminders",
					},
				],
			],
		},
		{ messageEffectId: EFFECT_CONFETTI }
	);
}
