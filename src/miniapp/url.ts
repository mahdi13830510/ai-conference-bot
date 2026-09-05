import {
	Env,
} from "../types";

/**
 * The Mini App is served by this same Worker, but Telegram only
 * accepts an absolute HTTPS URL, so it has to be configured.
 */
export function miniAppUrl(
	env: Env
): string | undefined {

	if (!env.PUBLIC_URL) {
		return undefined;
	}

	return `${env.PUBLIC_URL.replace(/\/$/, "")}/app`;
}
