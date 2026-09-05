import {
	Conference,
} from "../types";

/**
 * A conference source adapter.
 *
 * Adapters return records in the ai-deadlines shape; the
 * registry is responsible for merging and de-duplicating them.
 */
export interface ConferenceSource {

	/**
	 * Stable identifier stored on each conference row.
	 */
	name: string;

	/**
	 * Human-readable name, shown in /admin output.
	 */
	label: string;

	/**
	 * Whether this source contributes on a normal sync.
	 * Slower sources can be opt-in.
	 */
	enabledByDefault: boolean;

	fetch(): Promise<Conference[]>;
}
