import {
	Conference,
} from "../types";

import {
	ConferenceSource,
} from "./types";

const AI_DEADLINES_URL =
	"https://mlciv.com/ai-deadlines/api/upcoming.json";

const USER_AGENT =
	"ai-conference-telegram-bot/1.0";

/**
 * Primary source. Curated, deadline-first, and already in
 * exactly the shape the rest of the bot expects.
 */
export const aiDeadlines: ConferenceSource = {

	name: "ai-deadlines",

	label: "ai-deadlines",

	enabledByDefault: true,

	async fetch(): Promise<Conference[]> {

		const response =
			await fetch(
				AI_DEADLINES_URL,
				{
					headers: {
						Accept: "application/json",
						"User-Agent": USER_AGENT,
					},
				}
			);

		if (!response.ok) {
			throw new Error(
				`ai-deadlines returned ${response.status}`
			);
		}

		const data =
			await response.json();

		if (!Array.isArray(data)) {
			throw new Error(
				"Invalid ai-deadlines response"
			);
		}

		return (data as Conference[]).map(
			conference => ({
				...conference,
				source: "ai-deadlines",
			})
		);
	},
};
