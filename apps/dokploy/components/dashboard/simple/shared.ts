import type { SimpleAppStatus } from "@dokploy/server/services/computebay-apps";
import { STATUS } from "@/lib/computebay-strings";

export interface StatusMeta {
	label: string;
	color: string;
	/** Whether the status dot should pulse (live/transitional states). */
	pulse: boolean;
}

/** Maps a Dokploy app status to the Simple shell's one-word status + colour. */
export const statusMeta = (status: SimpleAppStatus): StatusMeta => {
	switch (status) {
		case "running":
		case "done":
			return { label: STATUS.running, color: "var(--cb-success)", pulse: true };
		case "error":
			return { label: STATUS.error, color: "var(--cb-error)", pulse: false };
		case "idle":
			return {
				label: STATUS.stopped,
				color: "var(--cb-text-subtle)",
				pulse: false,
			};
		default:
			return {
				label: STATUS.idle,
				color: "var(--cb-text-subtle)",
				pulse: false,
			};
	}
};
