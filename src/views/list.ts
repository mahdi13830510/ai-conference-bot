import {
	Env,
	DbConference,
} from "../types";

import {
	sendMessage,
	editMessageText,
} from "../telegram";

import {
	countConferences,
	listConferences,
	searchConferences,
	listSaved,
	getPersonalFeed,
} from "../database";

import {
	pagination,
	conferenceListKeyboard,
	TOPICS,
} from "../ui";

import {
	listText,
} from "../format";

import {
	PAGE_SIZE,
	REGION_COUNTRIES,
} from "../config";

/**
 * Renders a paginated conference list for a given mode
 * (upcoming, topic, location, region, search, deadline,
 * saved or feed) and either edits or sends the message.
 */

export async function showList(
	env: Env,
	chatId: number,
	mode: string,
	value: string | undefined,
	page: number,
	messageId?: number
) {

	let rows: DbConference[] = [];
	let total = 0;

	let title =
		"📅 Conferences";

	let callbackPrefix =
		"list:upcoming";

	if (mode === "upcoming") {

		title =
			"📅 Upcoming Conference Deadlines";

		callbackPrefix =
			"list:upcoming";

		total =
			await countConferences(
				env,
				`
          deadline_utc IS NOT NULL
          AND deadline_utc > datetime('now')
        `
			);

		rows =
			await listConferences(
				env,
				{
					page,
					pageSize: PAGE_SIZE,
				}
			);
	}

	else if (
		mode === "topic"
	) {

		const topic =
			value!.toUpperCase();

		title =
			`${TOPICS[topic] ?? topic} Conferences`;

		callbackPrefix =
			`list:topic:${topic}`;

		const where = `
      deadline_utc IS NOT NULL
      AND deadline_utc > datetime('now')
      AND topics LIKE ?
    `;

		const params = [
			`%"${topic}"%`,
		];

		total =
			await countConferences(
				env,
				where,
				params
			);

		rows =
			await listConferences(
				env,
				{
					page,
					pageSize: PAGE_SIZE,
					where,
					params,
				}
			);
	}

	else if (
		mode === "location"
	) {

		title =
			`🌍 Conferences in ${value}`;

		callbackPrefix =
			`list:location:${value}`;

		const where = `
      deadline_utc IS NOT NULL
      AND deadline_utc > datetime('now')
      AND place LIKE ? COLLATE NOCASE
    `;

		const params = [
			`%${value}%`,
		];

		total =
			await countConferences(
				env,
				where,
				params
			);

		rows =
			await listConferences(
				env,
				{
					page,
					pageSize: PAGE_SIZE,
					where,
					params,
				}
			);
	}

	else if (
		mode === "region"
	) {

		const countries =
			REGION_COUNTRIES[
			value!
			] ?? [];

		title =
			`🌍 ${value!.replace(
				/-/g,
				" "
			)} Conferences`;

		callbackPrefix =
			`list:region:${value}`;

		if (!countries.length) {

			rows = [];
			total = 0;

		} else {

			const locationConditions =
				countries.map(
					() =>
						`place LIKE ? COLLATE NOCASE`
				);

			const where = `
        deadline_utc IS NOT NULL
        AND deadline_utc > datetime('now')
        AND (
          ${locationConditions.join(
				" OR "
			)}
        )
      `;

			const params =
				countries.map(
					country =>
						`%${country}%`
				);

			total =
				await countConferences(
					env,
					where,
					params
				);

			rows =
				await listConferences(
					env,
					{
						page,
						pageSize: PAGE_SIZE,
						where,
						params,
					}
				);
		}
	}

	else if (
		mode === "search"
	) {

		const result =
			await searchConferences(
				env,
				value || "",
				page,
				PAGE_SIZE
			);

		rows =
			result.rows;

		total =
			result.total;

		title =
			`🔎 Search: "${value}"`;

		callbackPrefix =
			`list:search:${encodeURIComponent(
				value || ""
			)}`;
	}

	else if (
		mode === "deadline"
	) {

		const days =
			Number(value || 30);

		const maxDate =
			new Date(
				Date.now() +
				days *
				24 *
				60 *
				60 *
				1000
			).toISOString();

		const where = `
      deadline_utc IS NOT NULL
      AND deadline_utc > datetime('now')
      AND deadline_utc <= ?
    `;

		const params = [
			maxDate,
		];

		title =
			`⏰ Deadlines in the next ${days} days`;

		callbackPrefix =
			`list:deadline:${days}`;

		total =
			await countConferences(
				env,
				where,
				params
			);

		rows =
			await listConferences(
				env,
				{
					page,
					pageSize: PAGE_SIZE,
					where,
					params,
				}
			);
	}

	else if (
		mode === "saved"
	) {

		const userId =
			value!;

		const result =
			await listSaved(
				env,
				userId,
				page,
				PAGE_SIZE
			);

		rows =
			result.rows;

		total =
			result.total;

		title =
			"⭐ Saved Conferences";

		callbackPrefix =
			"list:saved";
	}

	else if (
		mode === "feed"
	) {

		const userId =
			value!;

		const result =
			await getPersonalFeed(
				env,
				userId,
				page,
				PAGE_SIZE
			);

		rows =
			result.rows;

		total =
			result.total;

		title =
			"🎯 Your Conference Feed";

		callbackPrefix =
			"list:feed";
	}

	const text =
		listText(
			title,
			rows,
			page,
			total
		);

	const markup =
		pagination(
			page,
			total,
			callbackPrefix
		);

	/*
	 * Add conference buttons above pagination.
	 */
	markup.inline_keyboard =
		[
			...conferenceListKeyboard(
				rows
			).inline_keyboard,

			...markup.inline_keyboard,
		];

	if (messageId) {

		try {

			await editMessageText(
				env,
				chatId,
				messageId,
				text,
				markup
			);

		} catch (error) {

			console.error(
				"editMessageText failed:",
				error
			);

			await sendMessage(
				env,
				chatId,
				text,
				markup
			);
		}

	} else {

		await sendMessage(
			env,
			chatId,
			text,
			markup
		);
	}
}
