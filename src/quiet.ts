/**
 * Quiet hours.
 *
 * A held notification is never dropped: the job simply leaves
 * it unsent and picks it up on the next run, once the window
 * has passed.
 */

/**
 * The hour of day, 0–23, in the given timezone.
 */
export function localHour(
	timezone: string,
	now: Date = new Date()
): number {

	try {

		return Number(
			new Intl.DateTimeFormat("en-GB", {
				hour: "numeric",
				hour12: false,
				timeZone: timezone,
			}).format(now)
		) % 24;

	} catch {

		/*
		 * A bad stored timezone falls back to UTC rather than
		 * suppressing the notification entirely.
		 */
		return now.getUTCHours();
	}
}

/**
 * The weekday, 0 (Sunday) – 6, in the given timezone.
 */
export function localWeekday(
	timezone: string,
	now: Date = new Date()
): number {

	const names = [
		"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
	];

	try {

		const label =
			new Intl.DateTimeFormat("en-US", {
				weekday: "short",
				timeZone: timezone,
			}).format(now);

		const index =
			names.indexOf(label);

		return index >= 0 ? index : now.getUTCDay();

	} catch {
		return now.getUTCDay();
	}
}

/**
 * The local calendar date, so "one digest per day" means the
 * user's day rather than UTC's.
 */
export function localDate(
	timezone: string,
	now: Date = new Date()
): string {

	try {

		return new Intl.DateTimeFormat("en-CA", {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			timeZone: timezone,
		}).format(now);

	} catch {
		return now.toISOString().slice(0, 10);
	}
}

/**
 * Whether now falls inside the user's quiet window. Windows
 * that wrap past midnight (22:00–08:00) are the normal case.
 */
export function isQuiet(
	timezone: string,
	start: number | null,
	end: number | null,
	now: Date = new Date()
): boolean {

	if (start === null || end === null) {
		return false;
	}

	const hour =
		localHour(timezone, now);

	if (start === end) {
		return false;
	}

	return start < end
		? hour >= start && hour < end
		: hour >= start || hour < end;
}
