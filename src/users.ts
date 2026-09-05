import {
	Env,
} from "./types";

import {
	upsertUser,
} from "./database";

export async function ensureUser(
	env: Env,
	user?: {
		id: number;
		username?: string;
		first_name?: string;
	}
) {

	if (!user) {
		return;
	}

	await upsertUser(
		env,
		String(user.id),
		user.username,
		user.first_name
	);
}
