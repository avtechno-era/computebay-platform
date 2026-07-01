import type { computeBayConfigSchema } from "@dokploy/server/db/schema";
import type { z } from "zod";
import {
	getWebServerSettings,
	updateWebServerSettings,
} from "./web-server-settings";

export type ComputeBayConfig = z.infer<typeof computeBayConfigSchema>;

// Mirrors the column default in web-server-settings.ts. Used to backfill any
// field a persisted row is missing (e.g. rows created before a field was added).
export const DEFAULT_COMPUTE_BAY_CONFIG: ComputeBayConfig = {
	tier: "self-host",
	businessName: null,
	timezone: "Asia/Manila",
	defaultView: "simple",
	showAdvancedToggle: true,
	supportAccessPaused: false,
	supportEmailOptIn: false,
	wildcardDomain: null,
	customerSlug: null,
	brokerBaseUrl: null,
	tunnelConfigured: false,
	tunnelToken: null,
	deviceToken: null,
	tunnelId: null,
};

/**
 * Read the ComputeBay fork configuration, always returning a fully-populated
 * object (persisted values take precedence over defaults).
 */
export const getComputeBayConfig = async (): Promise<ComputeBayConfig> => {
	const settings = await getWebServerSettings();
	return {
		...DEFAULT_COMPUTE_BAY_CONFIG,
		...(settings?.computeBay ?? {}),
	};
};

/**
 * Merge a partial update into the ComputeBay config and persist it. Returns the
 * merged config.
 */
export const updateComputeBayConfig = async (
	updates: Partial<ComputeBayConfig>,
): Promise<ComputeBayConfig> => {
	const current = await getComputeBayConfig();
	const next: ComputeBayConfig = { ...current, ...updates };
	await updateWebServerSettings({ computeBay: next });
	return next;
};
