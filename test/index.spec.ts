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
	init?: RequestInit
) {

	const request =
		new IncomingRequest(url, init);

	const ctx =
		createExecutionContext();

	const response =
		await worker.fetch(request, env, ctx);

	await waitOnExecutionContext(ctx);

	return response;
}

describe("worker routing", () => {

	it("reports health on GET /health", async () => {

		const response =
			await call("http://example.com/health");

		expect(response.status).toBe(200);

		expect(await response.json()).toEqual({
			status: "ok",
			service: "ai-conference-deadlines-bot",
		});
	});

	it("rejects a malformed webhook body", async () => {

		const response =
			await call(
				"http://example.com/telegram",
				{
					method: "POST",
					body: "not json",
				}
			);

		expect(response.status).toBe(400);
	});

	it("returns 404 for unknown paths", async () => {

		const response =
			await call("http://example.com/nope");

		expect(response.status).toBe(404);
	});
});
