import {
	Env,
} from "../types";

/**
 * Validates Telegram Mini App `initData`.
 *
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * The signature proves the payload came from Telegram for this
 * bot, so it is the only thing standing between the Mini App
 * API and anyone with the URL.
 */

const MAX_AGE_SECONDS = 86_400;

async function hmac(
	key: ArrayBuffer | Uint8Array,
	message: string
): Promise<ArrayBuffer> {

	const cryptoKey =
		await crypto.subtle.importKey(
			"raw",
			key as BufferSource,
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"]
		);

	return crypto.subtle.sign(
		"HMAC",
		cryptoKey,
		new TextEncoder().encode(message)
	);
}

function toHex(
	buffer: ArrayBuffer
): string {

	return [...new Uint8Array(buffer)]
		.map(byte => byte.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Constant-time comparison, so a bad signature leaks nothing
 * through timing.
 */
function timingSafeEqual(
	a: string,
	b: string
): boolean {

	if (a.length !== b.length) {
		return false;
	}

	let mismatch = 0;

	for (let index = 0; index < a.length; index += 1) {
		mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
	}

	return mismatch === 0;
}

export interface MiniAppUser {
	id: number;
	first_name?: string;
	username?: string;
	language_code?: string;
}

export type VerifyReason =
	| "ok"
	| "empty"
	| "no_hash"
	| "bad_hash"
	| "no_auth_date"
	| "stale"
	| "no_user";

export interface VerifyResult {
	user: MiniAppUser | null;
	reason: VerifyReason;

	/**
	 * Field names only, never values: enough to diagnose a
	 * client that sends something unexpected, without putting
	 * the hash or the user's data in a log.
	 */
	keys: string[];

	ageSeconds: number | null;
}

/**
 * Verification with a machine-readable reason, so a failure can
 * be diagnosed without guessing.
 */
export async function verifyInitDataDetailed(
	env: Env,
	initData: string
): Promise<VerifyResult> {

	if (!initData) {
		return { user: null, reason: "empty", keys: [], ageSeconds: null };
	}

	const params =
		new URLSearchParams(initData);

	const keys =
		[...params.keys()].sort();

	const hash =
		params.get("hash");

	const authDate =
		Number(params.get("auth_date") ?? 0);

	const ageSeconds =
		authDate
			? Math.round(Date.now() / 1000 - authDate)
			: null;

	if (!hash) {
		return { user: null, reason: "no_hash", keys, ageSeconds };
	}

	/*
	 * Only "hash" comes out. Newer clients also send "signature",
	 * which stays in: dropping it is correct only for the
	 * third-party Ed25519 flow, and removing it here makes every
	 * request from a modern client fail to validate.
	 */
	params.delete("hash");

	const dataCheckString =
		[...params.entries()]
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([key, value]) => `${key}=${value}`)
			.join("\n");

	const secretKey =
		await hmac(
			new TextEncoder().encode("WebAppData"),
			env.TELEGRAM_BOT_TOKEN
		);

	const expected =
		toHex(await hmac(secretKey, dataCheckString));

	if (!timingSafeEqual(expected, hash)) {
		return { user: null, reason: "bad_hash", keys, ageSeconds };
	}

	/*
	 * Reject stale payloads so a leaked initData string cannot
	 * be replayed indefinitely.
	 */
	if (!authDate) {
		return { user: null, reason: "no_auth_date", keys, ageSeconds };
	}

	if (Date.now() / 1000 - authDate > MAX_AGE_SECONDS) {
		return { user: null, reason: "stale", keys, ageSeconds };
	}

	try {

		const user =
			JSON.parse(params.get("user") ?? "null");

		if (user && typeof user.id === "number") {
			return { user: user as MiniAppUser, reason: "ok", keys, ageSeconds };
		}

	} catch {
		/* falls through to no_user */
	}

	return { user: null, reason: "no_user", keys, ageSeconds };
}

export async function verifyInitData(
	env: Env,
	initData: string
): Promise<MiniAppUser | null> {

	return (await verifyInitDataDetailed(env, initData)).user;
}
