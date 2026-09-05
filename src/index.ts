import {
	Env,
	TelegramUpdate,
} from "./types";

import {
	handleUpdate,
} from "./handlers/update";

import {
	scheduledSync,
	processReminders,
	processAutoReminders,
	processDigests,
	housekeeping,
} from "./jobs";

import {
	MINI_APP_HTML,
} from "./miniapp/page";

import {
	handleMiniAppApi,
} from "./miniapp/api";

/**
 * Constant-time comparison for the webhook secret.
 */
function secretMatches(
	expected: string,
	received: string | null
): boolean {

	if (!received || expected.length !== received.length) {
		return false;
	}

	let mismatch = 0;

	for (let index = 0; index < expected.length; index += 1) {
		mismatch |=
			expected.charCodeAt(index) ^ received.charCodeAt(index);
	}

	return mismatch === 0;
}

/**
 * Worker entry point.
 *
 * `fetch` serves the health check, the Telegram webhook and the
 * Mini App; `scheduled` runs the cron jobs.
 */
export default {

	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {

		const url =
			new URL(request.url);

		/* ---------- health ---------- */

		if (
			request.method === "GET" &&
			url.pathname === "/health"
		) {

			return Response.json({
				status: "ok",
				service: "ai-conference-deadlines-bot",
			});
		}

		/* ---------- mini app ---------- */

		if (url.pathname === "/app" || url.pathname === "/app/") {

			return new Response(MINI_APP_HTML, {
				headers: {
					"Content-Type": "text/html; charset=utf-8",

					/*
					 * Telegram loads the Mini App in an iframe, so
					 * framing has to stay open to telegram.org.
					 */
					"Content-Security-Policy":
						"frame-ancestors https://web.telegram.org " +
						"https://*.telegram.org",

					"Cache-Control": "public, max-age=300",
				},
			});
		}

		if (url.pathname.startsWith("/app/api/")) {

			return handleMiniAppApi(
				request,
				env,
				url.pathname.slice("/app/api/".length)
			);
		}

		/* ---------- telegram webhook ---------- */

		if (
			request.method === "POST" &&
			url.pathname === "/telegram"
		) {

			/*
			 * Without this check anyone who learns the worker URL
			 * can post forged updates as any user.
			 */
			if (env.TELEGRAM_WEBHOOK_SECRET) {

				const received =
					request.headers.get(
						"X-Telegram-Bot-Api-Secret-Token"
					);

				if (
					!secretMatches(env.TELEGRAM_WEBHOOK_SECRET, received)
				) {

					console.warn("Rejected webhook: bad secret token");

					return new Response("Forbidden", { status: 403 });
				}
			}

			let update: TelegramUpdate;

			try {
				update = await request.json<TelegramUpdate>();

			} catch (error) {

				console.error("Webhook parsing failed:", error);

				return new Response("Bad Request", { status: 400 });
			}

			/*
			 * Process asynchronously so Telegram gets a fast 200
			 * and does not redeliver.
			 */
			ctx.waitUntil(
				handleUpdate(env, update).catch(
					error =>
						console.error(
							"Update processing failed:",
							error
						)
				)
			);

			return new Response("OK");
		}

		return new Response("Not Found", { status: 404 });
	},

	/*
	 * Cloudflare Cron.
	 */
	async scheduled(
		controller: ScheduledController,
		env: Env,
		ctx: ExecutionContext
	): Promise<void> {

		/*
		 * Two schedules share this handler. The hourly tick keeps
		 * per-user digest hours and reminders punctual; fetching
		 * the sources every hour would be wasteful, so that runs
		 * on the six-hourly tick only.
		 */
		const withSync =
			controller.cron === "0 */6 * * *";

		const jobs: [string, () => Promise<void>][] = [
			...(withSync
				? ([["sync", () => scheduledSync(env)]] as
					[string, () => Promise<void>][])
				: []),

			["auto-reminders", () => processAutoReminders(env)],
			["reminders", () => processReminders(env)],
			["digests", () => processDigests(env)],

			...(withSync
				? ([["housekeeping", () => housekeeping(env)]] as
					[string, () => Promise<void>][])
				: []),
		];

		ctx.waitUntil(
			(async () => {

				for (const [name, run] of jobs) {

					const started =
						Date.now();

					try {

						await run();

						console.log(
							JSON.stringify({
								event: "job_ok",
								job: name,
								ms: Date.now() - started,
							})
						);

					} catch (error) {

						console.error(
							`Scheduled job "${name}" failed:`,
							error
						);
					}
				}

			})()
		);
	},
};
