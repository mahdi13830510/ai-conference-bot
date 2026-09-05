import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
} from "cloudflare:test";

import { describe, it, expect } from "vitest";

import worker from "../src/index";

const IncomingRequest =
	Request<unknown, IncomingRequestCfProperties>;

async function call(
	url: string,
	init?: RequestInit,
	overrides: Record<string, unknown> = {}
) {

	const request =
		new IncomingRequest(url, init);

	const ctx =
		createExecutionContext();

	const response =
		await worker.fetch(
			request,
			{ ...env, ...overrides } as typeof env,
			ctx
		);

	await waitOnExecutionContext(ctx);

	return response;
}

describe("routing", () => {

	it("reports health on GET /health", async () => {

		const response =
			await call("http://example.com/health");

		expect(response.status).toBe(200);

		expect(await response.json()).toEqual({
			status: "ok",
			service: "ai-conference-deadlines-bot",
		});
	});

	it("returns 404 for unknown paths", async () => {
		expect(
			(await call("http://example.com/nope")).status
		).toBe(404);
	});

	it("rejects a malformed webhook body", async () => {

		const response =
			await call(
				"http://example.com/telegram",
				{ method: "POST", body: "not json" }
			);

		expect(response.status).toBe(400);
	});
});

describe("mini app", () => {

	it("serves the app shell", async () => {

		const response =
			await call("http://example.com/app");

		expect(response.status).toBe(200);

		expect(response.headers.get("Content-Type"))
			.toContain("text/html");

		/* Telegram must be allowed to frame it. */
		expect(response.headers.get("Content-Security-Policy"))
			.toContain("telegram.org");

		expect(await response.text())
			.toContain("telegram-web-app.js");
	});

	it("calls its API by absolute path", async () => {

		/*
		 * The shell is served at "/app" with no trailing slash, so
		 * a relative "api/..." would resolve to "/api/..." and 404
		 * for every request the app makes.
		 */
		const html =
			await (await call("http://example.com/app")).text();

		expect(html).toContain('fetch("/app/api/"');
		expect(html).not.toMatch(/fetch\(\s*"api\//);
	});

	it("rejects an unsigned API call", async () => {

		const response =
			await call(
				"http://example.com/app/api/list",
				{
					method: "POST",
					body: JSON.stringify({ initData: "" }),
				}
			);

		expect(response.status).toBe(401);
	});

	it("rejects a forged initData signature", async () => {

		const response =
			await call(
				"http://example.com/app/api/list",
				{
					method: "POST",

					body: JSON.stringify({
						initData:
							"user=%7B%22id%22%3A1%7D&auth_date=" +
							`${Math.floor(Date.now() / 1000)}` +
							"&hash=" + "0".repeat(64),
					}),
				},
				{ TELEGRAM_BOT_TOKEN: "123:test-token" }
			);

		expect(response.status).toBe(401);
	});

	it("rejects a non-POST API call", async () => {
		expect(
			(await call("http://example.com/app/api/list")).status
		).toBe(405);
	});
});

describe("webhook secret", () => {

	const body =
		JSON.stringify({ update_id: 1 });

	it("rejects a request with no secret header", async () => {

		const response =
			await call(
				"http://example.com/telegram",
				{ method: "POST", body },
				{ TELEGRAM_WEBHOOK_SECRET: "s3cret" }
			);

		expect(response.status).toBe(403);
	});

	it("rejects a wrong secret", async () => {

		const response =
			await call(
				"http://example.com/telegram",
				{
					method: "POST",
					body,
					headers: {
						"X-Telegram-Bot-Api-Secret-Token": "wrong!",
					},
				},
				{ TELEGRAM_WEBHOOK_SECRET: "s3cret" }
			);

		expect(response.status).toBe(403);
	});

	it("accepts the right secret", async () => {

		const response =
			await call(
				"http://example.com/telegram",
				{
					method: "POST",
					body,
					headers: {
						"X-Telegram-Bot-Api-Secret-Token": "s3cret",
					},
				},
				{ TELEGRAM_WEBHOOK_SECRET: "s3cret" }
			);

		expect(response.status).toBe(200);
	});
});
