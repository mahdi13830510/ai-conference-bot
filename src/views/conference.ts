import {
	Env,
} from "../types";

import {
	sendMessage,
	editMessageText,
} from "../telegram";

import {
	getConference,
	isSaved,
	createReminder,
} from "../database";

import {
	conferenceDetailKeyboard,
	reminderMenu,
} from "../ui";

import {
	conferenceText,
	formatDate,
} from "../format";

/**
 * Conference detail view and the reminder flow that
 * hangs off it.
 */

export async function showConference(
	env: Env,
	chatId: number,
	conferenceId: string,
	messageId?: number
) {

	const conference =
		await getConference(
			env,
			conferenceId
		);

	if (!conference) {

		await sendMessage(
			env,
			chatId,
			"❌ Conference not found."
		);

		return;
	}

	const saved =
		await isSaved(
			env,
			String(chatId),
			conferenceId
		);

	const text =
		conferenceText(
			conference
		);

	const markup =
		conferenceDetailKeyboard(
			conference,
			saved
		);

	if (messageId) {

		await editMessageText(
			env,
			chatId,
			messageId,
			text,
			markup
		);

	} else {

		await sendMessage(
			env,
			chatId,
			text,
			markup
		);
	}
}

/* =========================================================
	 REMINDER MENU
	 ========================================================= */

export async function showReminderMenu(
	env: Env,
	chatId: number,
	conferenceId: string
) {

	const conference =
		await getConference(
			env,
			conferenceId
		);

	if (!conference) {
		return;
	}

	await sendMessage(
		env,
		chatId,
		`🔔 Reminders for ${conference.title} ${conference.year}

Choose when you want to be reminded.`,
		reminderMenu(
			conferenceId
		)
	);
}

/* =========================================================
	 REMINDERS
	 ========================================================= */

export async function createConferenceReminder(
	env: Env,
	chatId: number,
	conferenceId: string,
	daysBefore: number
) {

	const conference =
		await getConference(
			env,
			conferenceId
		);

	if (
		!conference ||
		!conference.deadline_utc
	) {
		await sendMessage(
			env,
			chatId,
			"❌ This conference does not have a usable deadline."
		);

		return;
	}

	const deadline =
		new Date(
			conference.deadline_utc
		);

	const remindAt =
		new Date(
			deadline.getTime() -
			daysBefore *
			24 *
			60 *
			60 *
			1000
		);

	if (
		remindAt.getTime() <=
		Date.now()
	) {

		await sendMessage(
			env,
			chatId,
			"⚠️ That reminder time has already passed."
		);

		return;
	}

	await createReminder(
		env,
		String(chatId),
		conferenceId,
		daysBefore,
		remindAt.toISOString()
	);

	await sendMessage(
		env,
		chatId,
		`✅ Reminder set.

${conference.title} ${conference.year}

🔔 ${daysBefore} days before the deadline
📅 ${formatDate(
			conference.deadline_utc
		)}`
	);
}
