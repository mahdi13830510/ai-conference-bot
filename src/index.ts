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
	processDailyDigests,
} from "./jobs";

/**
 * Worker entry point.
 *
 * `fetch` serves the health check and the Telegram
 * webhook; `scheduled` runs the cron jobs.
 */

export default {

	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {

		const url =
			new URL(request.url);

		if (
			request.method === "GET" &&
			url.pathname === "/health"
		) {

			return Response.json({
				status: "ok",
				service:
					"ai-conference-deadlines-bot",
			});
		}

		if (
			request.method === "POST" &&
			url.pathname === "/telegram"
		) {

			let update: TelegramUpdate;

			try {

				update =
					await request.json<TelegramUpdate>();

			} catch (error) {

				console.error(
					"Webhook parsing failed:",
					error
				);

				return new Response(
					"Bad Request",
					{
						status: 400,
					}
				);
			}

			/*
			 * Process asynchronously so Telegram gets a
			 * fast HTTP 200 response.
			 */

			ctx.waitUntil(
				handleUpdate(
					env,
					update
				).catch(
					error =>
						console.error(
							"Update processing failed:",
							error
						)
				)
			);

			return new Response(
				"OK"
			);
		}

		return new Response(
			"Not Found",
			{
				status: 404,
			}
		);
	},

	/*
	 * Cloudflare Cron.
	 */
	async scheduled(
		controller: ScheduledController,
		env: Env,
		ctx: ExecutionContext
	) {

		const jobs: [string, () => Promise<void>][] = [
			["sync", () => scheduledSync(env)],
			["reminders", () => processReminders(env)],
			["digest", () => processDailyDigests(env)],
		];

		ctx.waitUntil(
			(async () => {

				for (const [name, run] of jobs) {

					try {

						await run();

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
