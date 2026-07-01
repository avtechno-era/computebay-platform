import os from "node:os";
import { TRPCError } from "@trpc/server";
import { scheduleJob } from "node-schedule";
import {
	initializeCloudflared,
	isCloudflaredRunning,
	stopCloudflared,
} from "../setup/cloudflared-setup";
import {
	type ComputeBayConfig,
	getComputeBayConfig,
	updateComputeBayConfig,
} from "./computebay-config";

// Managed-tier activation + the appliance's ongoing broker conversation (Phase 3).
//
// The appliance never talks to Cloudflare. It redeems an activation code against
// the Fleet Manager broker, which provisions the tunnel + wildcard DNS and hands
// back a one-time bundle: the cloudflared connector token, a device token (used
// to authenticate every later broker call), and the appliance's public identity
// (wildcard domain + customer slug). We persist those into the `computeBay`
// config and bring cloudflared up locally.

type BrokerActivation = {
	tunnel_token: string;
	wildcard_domain: string;
	customer_slug: string;
	device_token: string;
} | null;

type ActivateResponse = {
	ok?: boolean;
	activation?: BrokerActivation;
	error?: { code?: string; message?: string };
};

// Best-effort machine facts sent to the broker. On a real appliance the hostname
// is set to the device serial; telemetry beyond CPU count is enriched by the
// heartbeat. Kept small so activation stays fast and can't hang on metrics.
const collectTelemetry = () => ({
	cpu: os.cpus().length,
	ram: Math.round((1 - os.freemem() / os.totalmem()) * 100),
});

const normalizeBaseUrl = (url: string) => url.replace(/\/+$/, "");

const brokerError = (res: ActivateResponse | null, fallback: string) =>
	new TRPCError({
		code: "BAD_REQUEST",
		message: res?.error?.message || fallback,
	});

/**
 * Redeem an activation code against the broker and, if the broker successfully
 * provisioned Cloudflare, persist the tunnel/device secrets and start cloudflared.
 *
 * Returns the merged config plus a `tunnelReady` flag: false means the appliance
 * is activated (managed) but the broker could not stand up the tunnel yet, so it
 * serves LAN-only until an operator resolves the Cloudflare side.
 */
export const activateManagedAppliance = async (params: {
	activationCode: string;
	brokerBaseUrl: string;
	serialNumber?: string;
}): Promise<{ config: ComputeBayConfig; tunnelReady: boolean }> => {
	const brokerBaseUrl = normalizeBaseUrl(params.brokerBaseUrl);
	const serial = (params.serialNumber || os.hostname() || "").trim();
	if (!serial) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "This appliance has no serial number to activate with",
		});
	}

	let res: ActivateResponse | null = null;
	try {
		const response = await fetch(
			`${brokerBaseUrl}/appliances/activate-appliance`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					activation_code: params.activationCode.trim(),
					serial_number: serial,
					fork_version: process.env.DOKPLOY_VERSION || null,
					...collectTelemetry(),
				}),
			},
		);
		res = (await response.json().catch(() => null)) as ActivateResponse | null;
		if (!response.ok) {
			throw brokerError(res, "The activation code was rejected by the broker");
		}
	} catch (err) {
		if (err instanceof TRPCError) throw err;
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Could not reach the ComputeBay broker to activate this appliance",
		});
	}

	const activation = res?.activation ?? null;

	// The appliance is managed regardless; the tunnel may or may not be ready.
	const base: Partial<ComputeBayConfig> = {
		tier: "managed",
		brokerBaseUrl,
	};

	if (!activation) {
		const config = await updateComputeBayConfig({
			...base,
			tunnelConfigured: false,
		});
		return { config, tunnelReady: false };
	}

	const config = await updateComputeBayConfig({
		...base,
		wildcardDomain: activation.wildcard_domain,
		customerSlug: activation.customer_slug,
		tunnelToken: activation.tunnel_token,
		deviceToken: activation.device_token,
		tunnelConfigured: true,
	});

	// Bring cloudflared up with the connector token. If the container can't start,
	// the config is still saved (state is authoritative); report the failure so the
	// owner knows the public address isn't live yet.
	try {
		await initializeCloudflared(activation.tunnel_token);
	} catch {
		return { config, tunnelReady: false };
	}

	return { config, tunnelReady: true };
};

// --- Ongoing broker calls (device-authenticated) ---------------------------

const requireBrokerContext = (config: ComputeBayConfig) => {
	if (
		config.tier !== "managed" ||
		!config.brokerBaseUrl ||
		!config.deviceToken
	) {
		return null;
	}
	return {
		baseUrl: normalizeBaseUrl(config.brokerBaseUrl),
		deviceToken: config.deviceToken,
	};
};

const brokerFetch = async (
	config: ComputeBayConfig,
	path: string,
	init: RequestInit,
) => {
	const ctx = requireBrokerContext(config);
	if (!ctx) throw new Error("Appliance is not managed or has no device token");
	const response = await fetch(`${ctx.baseUrl}${path}`, {
		...init,
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${ctx.deviceToken}`,
			...(init.headers ?? {}),
		},
	});
	const body = (await response.json().catch(() => null)) as any;
	if (!response.ok) {
		throw new Error(body?.error?.message || "Broker request failed");
	}
	return body;
};

export type TunnelHealth = {
	status: "healthy" | "degraded" | "down" | "unknown";
	connections: number;
	configured: boolean;
};

/**
 * Ask the broker (which owns the Cloudflare API) for honest tunnel health. This
 * is the source of the public-reachability badge on Home (§5.6) — we never infer
 * it from the local cloudflared container. Returns "unknown"/unconfigured for
 * self-host or not-yet-activated appliances rather than throwing.
 */
export const getTunnelHealth = async (): Promise<TunnelHealth> => {
	const config = await getComputeBayConfig();
	if (!requireBrokerContext(config)) {
		return { status: "unknown", connections: 0, configured: false };
	}
	try {
		const body = (await brokerFetch(config, "/appliances/tunnel-health", {
			method: "GET",
		})) as TunnelHealth;
		return {
			status: body.status ?? "unknown",
			connections: body.connections ?? 0,
			configured: !!body.configured,
		};
	} catch {
		return { status: "unknown", connections: 0, configured: true };
	}
};

/** Post a telemetry heartbeat so the fleet dashboard sees this appliance as alive. */
export const sendHeartbeat = async (telemetry?: {
	appsTotal?: number;
	appsRunning?: number;
}): Promise<void> => {
	const config = await getComputeBayConfig();
	if (!requireBrokerContext(config)) return;
	await brokerFetch(config, "/appliances/heartbeat", {
		method: "POST",
		body: JSON.stringify({
			...collectTelemetry(),
			apps_total: telemetry?.appsTotal,
			apps_running: telemetry?.appsRunning,
			fork_version: process.env.DOKPLOY_VERSION || null,
		}),
	}).catch(() => {
		// Heartbeat is best-effort; a missed beat just delays the "last seen" tick.
	});
};

/** Publish a custom domain through this appliance's tunnel (broker adds the DNS). */
export const provisionCustomRoute = async (hostname: string): Promise<void> => {
	const config = await getComputeBayConfig();
	if (!requireBrokerContext(config)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Custom domains require a managed, activated appliance",
		});
	}
	await brokerFetch(config, "/appliances/route-provision", {
		method: "POST",
		body: JSON.stringify({ hostname }),
	});
};

/** Withdraw a custom domain's public route (broker removes the DNS). */
export const revokeCustomRoute = async (hostname: string): Promise<void> => {
	const config = await getComputeBayConfig();
	if (!requireBrokerContext(config)) return;
	await brokerFetch(config, "/appliances/route-revoke", {
		method: "POST",
		body: JSON.stringify({ hostname }),
	}).catch(() => {
		// Best-effort: the app is going away regardless of the DNS cleanup result.
	});
};

/** Stop the local tunnel connector (self-host teardown / deactivation). */
export const teardownTunnel = async (): Promise<void> => {
	await stopCloudflared();
};

const HEARTBEAT_JOB_NAME = "computebay-heartbeat";

/**
 * Boot-time tunnel wiring for the appliance. Called once during server startup
 * (production, non-cloud). On a managed, activated appliance it makes sure
 * cloudflared is running with the stored connector token — the host may have
 * rebooted — and schedules a periodic heartbeat to the broker. No-op for
 * self-host or not-yet-activated appliances.
 */
export const initComputeBayTunnel = async (): Promise<void> => {
	const config = await getComputeBayConfig();

	if (
		config.tier === "managed" &&
		config.tunnelConfigured &&
		config.tunnelToken
	) {
		try {
			if (!(await isCloudflaredRunning())) {
				await initializeCloudflared(config.tunnelToken);
			}
		} catch (err) {
			console.log("cloudflared could not be started on boot", err);
		}
	}

	// Heartbeat every two minutes; the call itself no-ops unless managed + activated.
	scheduleJob(HEARTBEAT_JOB_NAME, "*/2 * * * *", async () => {
		await sendHeartbeat();
	});
};
