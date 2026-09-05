import { describe, it, expect } from "vitest";

import { verifyInitData } from "../src/miniapp/auth";

const TOKEN = "111111:TEST-TOKEN";

const env = { TELEGRAM_BOT_TOKEN: TOKEN } as never;

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

/**
 * Signs a payload the way a Telegram client does.
 */
async function sign(
	fields: Record<string, string>
): Promise<string> {

	const dataCheckString =
		Object.keys(fields)
			.sort()
			.map(key => `${key}=${fields[key]}`)
			.join("\n");

	const secret =
		await hmac(new TextEncoder().encode("WebAppData"), TOKEN);

	const hash =
		[...new Uint8Array(await hmac(secret, dataCheckString))]
			.map(byte => byte.toString(16).padStart(2, "0"))
			.join("");

	return new URLSearchParams({ ...fields, hash }).toString();
}

function baseFields(): Record<string, string> {

	return {
		auth_date: String(Math.floor(Date.now() / 1000)),
		query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
		user: JSON.stringify({ id: 42, first_name: "Ada" }),
	};
}

describe("verifyInitData", () => {

	it("accepts a valid payload", async () => {

		const user =
			await verifyInitData(env, await sign(baseFields()));

		expect(user?.id).toBe(42);
	});

	it("accepts a payload carrying a signature field", async () => {

		/*
		 * Newer clients add "signature". It belongs in the
		 * data-check-string for the bot's own HMAC check, so
		 * stripping it would break every modern client.
		 */
		const user =
			await verifyInitData(
				env,
				await sign({
					...baseFields(),
					signature: "abcDEF123_-",
				})
			);

		expect(user?.id).toBe(42);
	});

	it("accepts unknown future fields", async () => {

		const user =
			await verifyInitData(
				env,
				await sign({ ...baseFields(), some_new_field: "x" })
			);

		expect(user?.id).toBe(42);
	});

	it("rejects a tampered field", async () => {

		const signed =
			await sign(baseFields());

		const tampered =
			signed.replace(/user=[^&]*/, "user=" +
				encodeURIComponent(
					JSON.stringify({ id: 999, first_name: "Mallory" })
				));

		expect(await verifyInitData(env, tampered)).toBeNull();
	});

	it("rejects a missing hash", async () => {
		expect(
			await verifyInitData(env, "user=%7B%22id%22%3A1%7D")
		).toBeNull();
	});

	it("rejects empty input", async () => {
		expect(await verifyInitData(env, "")).toBeNull();
	});

	it("rejects a stale payload", async () => {

		const stale =
			await sign({
				...baseFields(),
				auth_date: String(
					Math.floor(Date.now() / 1000) - 90_000
				),
			});

		expect(await verifyInitData(env, stale)).toBeNull();
	});

	it("rejects a payload with no user", async () => {

		const fields =
			baseFields();

		delete fields.user;

		expect(await verifyInitData(env, await sign(fields)))
			.toBeNull();
	});
});
