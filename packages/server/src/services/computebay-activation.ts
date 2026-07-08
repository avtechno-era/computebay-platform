import { statfsSync } from "node:fs";
import os from "node:os";
import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import { scheduleJob } from "node-schedule";
import {
	CloudflareApiError,
	provisionSelfHostTunnel,
} from "../setup/cloudflare-api";
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

// Where the tunnel's single catch-all ingress points: the appliance's Traefik on
// the shared docker network. Matches the broker's managed-tier ingress target so
// managed and self-host behave identically once the tunnel is up.
const APPLIANCE_INGRESS_SERVICE =
	process.env.APPLIANCE_INGRESS_SERVICE || "http://dokploy-traefik:80";

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

// Avante-provisioned Dokploy admin login the appliance auto-creates from on
// first boot. Present on a managed activation regardless of tunnel success.
export type BrokerAdmin = {
	email: string;
	password: string;
	business_name: string;
	owner_name: string;
};

type ActivateResponse = {
	ok?: boolean;
	activation?: BrokerActivation;
	admin?: BrokerAdmin;
	error?: { code?: string; message?: string };
};

// Best-effort machine facts sent to the broker. On a real appliance the hostname
// is set to the device serial; telemetry beyond CPU count is enriched by the
// heartbeat. Kept small so activation stays fast and can't hang on metrics.
const collectTelemetry = () => ({
	cpu: os.cpus().length,
	ram: Math.round((1 - os.freemem() / os.totalmem()) * 100),
});

// Root filesystem usage for the heartbeat (the appliance is single-disk).
// undefined (field omitted) when the platform can't report it.
const collectDiskPct = (): number | undefined => {
	try {
		const s = statfsSync("/");
		if (!s.blocks) return undefined;
		return Math.round(((s.blocks - s.bfree) / s.blocks) * 100);
	} catch {
		return undefined;
	}
};

// Mirrors computebay-apps' LAN_ENTRYPOINT ("weblan"). Not imported from there
// because computebay-apps imports this module — that would be a cycle.
const HEARTBEAT_LAN_ENTRYPOINT = "weblan";

type HeartbeatApp = {
	name: string;
	version: string | null;
	exposure: "lan" | "public" | null;
	status: string;
};

/**
 * Per-app inventory for the heartbeat (spec §5.4): every application/compose
 * on the box with its exposure + status. The appliance is single-node, so this
 * intentionally spans all organizations rather than one session's org.
 */
const collectApps = async (): Promise<HeartbeatApp[]> => {
	const projectList = await db.query.projects.findMany({
		columns: { projectId: true },
		with: {
			environments: {
				columns: { environmentId: true },
				with: {
					applications: {
						columns: { name: true, applicationStatus: true },
						with: { domains: { columns: { customEntrypoint: true } } },
					},
					compose: {
						columns: { name: true, composeStatus: true },
						with: { domains: { columns: { customEntrypoint: true } } },
					},
				},
			},
		},
	});

	const exposure = (
		domains: { customEntrypoint: string | null }[],
	): "lan" | "public" | null => {
		if (domains.length === 0) return null;
		return domains.some((d) => d.customEntrypoint !== HEARTBEAT_LAN_ENTRYPOINT)
			? "public"
			: "lan";
	};

	const apps: HeartbeatApp[] = [];
	for (const project of projectList) {
		for (const environment of project.environments) {
			for (const app of environment.applications) {
				apps.push({
					name: app.name,
					version: null,
					exposure: exposure(app.domains),
					status: app.applicationStatus,
				});
			}
			for (const service of environment.compose) {
				apps.push({
					name: service.name,
					version: null,
					exposure: exposure(service.domains),
					status: service.composeStatus,
				});
			}
		}
	}
	return apps;
};

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
}): Promise<{
	config: ComputeBayConfig;
	tunnelReady: boolean;
	admin: BrokerAdmin | null;
}> => {
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
	// The broker returns the appliance's provisioned Dokploy admin login; the
	// caller uses it to auto-create the first admin. Present on a successful
	// managed activation whether or not the tunnel came up.
	const admin = res?.admin ?? null;

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
		return { config, tunnelReady: false, admin };
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
		return { config, tunnelReady: false, admin };
	}

	return { config, tunnelReady: true, admin };
};

// --- Self-host activation (no broker) ---------------------------------------

// Strip protocol, wildcard prefix, and trailing punctuation so the owner can
// paste "https://apps.acme.com/", "*.acme.com", or "acme.com" and it normalises
// to the bare apex/subdomain we publish a wildcard under.
const normalizeDomain = (raw: string) =>
	raw
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.replace(/^\*\./, "")
		.replace(/[/.]+$/, "");

/**
 * Self-host activation (spec §5.1, second branch): the owner supplies their own
 * Cloudflare API token and a domain they already manage in Cloudflare. The
 * appliance provisions its own tunnel + wildcard DNS directly (no broker, no
 * device token, no support/kill-switch), then runs cloudflared locally — landing
 * on the exact same `computeBay` config shape as a managed appliance.
 *
 * The Cloudflare API token is used only for this call and never persisted; once
 * the tunnel exists, cloudflared runs on the per-tunnel connector token alone.
 */
export const activateSelfHostAppliance = async (params: {
	cfApiToken: string;
	domain: string;
	accountId?: string;
}): Promise<{ config: ComputeBayConfig; tunnelReady: boolean }> => {
	const domain = normalizeDomain(params.domain);
	if (!domain || !domain.includes(".")) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Enter a valid domain you manage in Cloudflare (e.g. acme.com)",
		});
	}

	let provisioned: Awaited<ReturnType<typeof provisionSelfHostTunnel>>;
	try {
		provisioned = await provisionSelfHostTunnel(params.cfApiToken.trim(), {
			domain,
			tunnelName: `cpb-selfhost-${domain.replace(/[^a-z0-9]+/g, "-")}`,
			ingressService: APPLIANCE_INGRESS_SERVICE,
			accountId: params.accountId?.trim() || undefined,
		});
	} catch (err) {
		if (err instanceof CloudflareApiError) {
			throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
		}
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Could not set up the Cloudflare tunnel for this appliance",
		});
	}

	const config = await updateComputeBayConfig({
		tier: "self-host",
		brokerBaseUrl: null,
		deviceToken: null,
		wildcardDomain: provisioned.wildcardDomain,
		customerSlug: provisioned.wildcardDomain.split(".")[0] ?? null,
		tunnelToken: provisioned.tunnelToken,
		tunnelId: provisioned.tunnelId,
		tunnelConfigured: true,
	});

	try {
		await initializeCloudflared(provisioned.tunnelToken);
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

// Edge-trigger state for the event channel: last observed status per app and
// the last cloudflared liveness, so we report transitions rather than spamming
// the broker with steady-state every two minutes. In-memory on purpose — a
// process restart re-baselines, which at worst re-reports a still-broken app once.
const lastAppStatus = new Map<string, string>();
let lastCloudflaredUp: boolean | null = null;

/**
 * Post a telemetry heartbeat so the fleet dashboard sees this appliance as
 * alive — machine facts, the per-app inventory (spec §5.4), and whether the
 * owner currently allows support access (§5.9, gates broker session opens).
 * Also pushes edge-triggered events (app errored / tunnel connector down) to
 * the broker's event channel. Everything here is best-effort.
 */
export const sendHeartbeat = async (): Promise<void> => {
	const config = await getComputeBayConfig();
	if (!requireBrokerContext(config)) return;

	let apps: HeartbeatApp[] | undefined;
	try {
		apps = await collectApps();
	} catch {
		// Inventory is enrichment; the liveness tick must still go out.
	}

	const disk = collectDiskPct();
	await brokerFetch(config, "/appliances/heartbeat", {
		method: "POST",
		body: JSON.stringify({
			...collectTelemetry(),
			...(disk === undefined ? {} : { disk }),
			...(apps === undefined ? {} : { apps }),
			support_access: !config.supportAccessPaused,
			fork_version: process.env.DOKPLOY_VERSION || null,
		}),
	}).catch(() => {
		// Heartbeat is best-effort; a missed beat just delays the "last seen" tick.
	});

	// Event channel: report transitions since the previous beat.
	const events: { kind: "warning" | "error" | "success"; label: string }[] = [];
	if (apps) {
		for (const app of apps) {
			const prev = lastAppStatus.get(app.name);
			if (app.status === "error" && prev !== "error") {
				events.push({
					kind: "error",
					label: `${app.name} entered error state`,
				});
			} else if (app.status !== "error" && prev === "error") {
				events.push({ kind: "success", label: `${app.name} recovered` });
			}
			lastAppStatus.set(app.name, app.status);
		}
	}
	if (config.tunnelConfigured) {
		const up = await isCloudflaredRunning().catch(() => true);
		if (lastCloudflaredUp === true && !up) {
			events.push({
				kind: "warning",
				label: "cloudflared tunnel connector is not running",
			});
		} else if (lastCloudflaredUp === false && up) {
			events.push({
				kind: "success",
				label: "cloudflared tunnel connector recovered",
			});
		}
		lastCloudflaredUp = up;
	}
	if (events.length > 0) {
		await brokerFetch(config, "/appliances/report-events", {
			method: "POST",
			body: JSON.stringify({ events }),
		}).catch(() => {
			// Events are enrichment; drop them rather than fail the beat.
		});
	}
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

	// Restart cloudflared with the stored connector token if a tunnel is
	// configured — the host may have rebooted. Applies to both managed and
	// self-host tiers; the token alone is what cloudflared needs.
	if (config.tunnelConfigured && config.tunnelToken) {
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
