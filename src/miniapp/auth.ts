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

export async function verifyInitData(
	env: Env,
	initData: string
): Promise<MiniAppUser | null> {

	if (!initData) {
		return null;
	}

	const params =
		new URLSearchParams(initData);

	const hash =
		params.get("hash");

	if (!hash) {
		return null;
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
		return null;
	}

	/*
	 * Reject stale payloads so a leaked initData string cannot
	 * be replayed indefinitely.
	 */
	const authDate =
		Number(params.get("auth_date") ?? 0);

	if (
		!authDate ||
		Date.now() / 1000 - authDate > MAX_AGE_SECONDS
	) {
		return null;
	}

	try {

		const user =
			JSON.parse(params.get("user") ?? "null");

		return user && typeof user.id === "number"
			? user as MiniAppUser
			: null;

	} catch {
		return null;
	}
}
