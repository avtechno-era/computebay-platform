import { db } from "@dokploy/server/db";
import { environments, projects } from "@dokploy/server/db/schema";
import { manageDomain, removeDomain } from "@dokploy/server/utils/traefik/domain";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { findApplicationById } from "./application";
import {
	provisionCustomRoute,
	revokeCustomRoute,
} from "./computebay-activation";
import { getComputeBayConfig } from "./computebay-config";
import {
	createDomain,
	findDomainById,
	findDomainsByApplicationId,
	findDomainsByComposeId,
	removeDomainById,
	updateDomainById,
} from "./domain";
import { createProject } from "./project";

export type SimpleAppStatus = "idle" | "running" | "done" | "error";
export type ExposureMode = "lan" | "public";

/**
 * Traefik entrypoint a domain rides while it is "office only" (§5.5). Public
 * apps use the default `web` entrypoint that cloudflared forwards to the
 * internet; LAN apps are moved onto this entrypoint instead.
 *
 * HOST SEAM (flagged): the appliance image must define a `weblan` Traefik
 * entrypoint bound to the LAN network interface, and cloudflared must forward
 * only the public `web` entrypoint. Until that wiring lands, the DB + UI state
 * is authoritative but a LAN app is simply not reachable over the internet
 * (which is the intended security outcome).
 */
export const LAN_ENTRYPOINT = "weblan";

/** Public when at least one domain rides the internet-facing entrypoint. */
const deriveExposure = (
	domains: { customEntrypoint: string | null }[],
): ExposureMode =>
	domains.some((d) => d.customEntrypoint !== LAN_ENTRYPOINT) ? "public" : "lan";

export interface SimpleApp {
	/** Stable id (applicationId or composeId). */
	id: string;
	kind: "application" | "compose";
	name: string;
	appName: string;
	status: SimpleAppStatus;
	exposureMode: ExposureMode;
	/** Whether the exposure toggle can act — an app needs a domain to route. */
	canToggleExposure: boolean;
	/** Primary reachable address, if the app has a domain. */
	url: string | null;
	/** Ids needed to deep-link into the Advanced (Dokploy) service page. */
	projectId: string;
	environmentId: string;
	createdAt: string | null;
}

const firstDomainUrl = (
	domains: { host: string; https: boolean }[],
): string | null => {
	const domain = domains[0];
	if (!domain) return null;
	return `${domain.https ? "https" : "http"}://${domain.host}`;
};

/**
 * Flattened list of installed apps (applications + compose) across every project
 * in the organization — the data behind the Simple "Apps" screen (spec §5.4).
 *
 * ComputeBay Uno is single-node / single-org, so this is the whole appliance.
 *
 * `exposureMode` reflects the Traefik entrypoint each domain rides — see
 * {@link LAN_ENTRYPOINT} and {@link setAppExposure}.
 */
export const listSimpleApps = async (
	organizationId: string,
): Promise<SimpleApp[]> => {
	const projectList = await db.query.projects.findMany({
		where: eq(projects.organizationId, organizationId),
		columns: { projectId: true },
		with: {
			environments: {
				columns: { environmentId: true },
				with: {
					applications: {
						columns: {
							applicationId: true,
							name: true,
							appName: true,
							applicationStatus: true,
							createdAt: true,
						},
						with: {
							domains: {
								columns: {
									host: true,
									https: true,
									customEntrypoint: true,
								},
							},
						},
					},
					compose: {
						columns: {
							composeId: true,
							name: true,
							appName: true,
							composeStatus: true,
							createdAt: true,
						},
						with: {
							domains: {
								columns: {
									host: true,
									https: true,
									customEntrypoint: true,
								},
							},
						},
					},
				},
			},
		},
	});

	const apps: SimpleApp[] = [];
	for (const project of projectList) {
		for (const environment of project.environments) {
			for (const app of environment.applications) {
				apps.push({
					id: app.applicationId,
					kind: "application",
					name: app.name,
					appName: app.appName,
					status: app.applicationStatus,
					exposureMode: deriveExposure(app.domains),
					canToggleExposure: app.domains.length > 0,
					url: firstDomainUrl(app.domains),
					projectId: project.projectId,
					environmentId: environment.environmentId,
					createdAt: app.createdAt ?? null,
				});
			}
			for (const service of environment.compose) {
				apps.push({
					id: service.composeId,
					kind: "compose",
					name: service.name,
					appName: service.appName,
					status: service.composeStatus,
					exposureMode: deriveExposure(service.domains),
					canToggleExposure: service.domains.length > 0,
					url: firstDomainUrl(service.domains),
					projectId: project.projectId,
					environmentId: environment.environmentId,
					createdAt: service.createdAt ?? null,
				});
			}
		}
	}

	return apps.sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Resolve the environment a curated install should target. ComputeBay hides the
 * Projects layer (spec §4), so installs land in a single default project's
 * production environment, created on first use if it doesn't exist yet.
 */
export const ensureDefaultEnvironment = async (
	organizationId: string,
): Promise<string> => {
	const existing = await db.query.projects.findFirst({
		where: eq(projects.organizationId, organizationId),
		with: {
			environments: {
				where: eq(environments.name, "production"),
				columns: { environmentId: true },
			},
		},
	});

	const existingEnv = existing?.environments[0]?.environmentId;
	if (existingEnv) return existingEnv;

	const { environment } = await createProject(
		{
			name: "My Apps",
			description: "Apps installed from the ComputeBay catalog",
		},
		organizationId,
	);
	return environment.environmentId;
};

/**
 * Flip an app between "office only" (LAN) and "anyone with the link" (public)
 * exposure (spec §5.5) by moving every domain the app owns on/off the
 * {@link LAN_ENTRYPOINT} Traefik entrypoint. The domain rows (host / port /
 * service) are preserved, so the switch is one-click and fully reversible.
 *
 * Applications re-render their Traefik file config immediately. Compose services
 * carry their routing as labels inside the compose file, so the caller must
 * redeploy them for the change to take effect — hence `needsRedeploy`.
 */
export const setAppExposure = async (params: {
	id: string;
	kind: "application" | "compose";
	mode: ExposureMode;
}): Promise<{ needsRedeploy: boolean }> => {
	const { id, kind, mode } = params;

	const domainList =
		kind === "application"
			? await findDomainsByApplicationId(id)
			: await findDomainsByComposeId(id);

	if (domainList.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"This app has no address yet, so its exposure can't be changed here.",
		});
	}

	// Public rides the default `web` entrypoint (customEntrypoint = null); LAN is
	// parked on the LAN-only entrypoint.
	const targetEntrypoint = mode === "lan" ? LAN_ENTRYPOINT : null;

	for (const domain of domainList) {
		await updateDomainById(domain.domainId, {
			customEntrypoint: targetEntrypoint,
		});
	}

	if (kind === "application") {
		const application = await findApplicationById(id);
		for (const domain of domainList) {
			const fresh = await findDomainById(domain.domainId);
			await manageDomain(application, fresh);
		}
		return { needsRedeploy: false };
	}

	return { needsRedeploy: true };
};

// --- Custom domains (§5.5 advanced action) ---------------------------------

export interface CustomDomain {
	domainId: string;
	host: string;
	https: boolean;
}

/** Normalise a user-entered hostname to a bare, lower-cased host. */
const normalizeHost = (raw: string): string =>
	raw
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.replace(/^\*\./, "")
		.replace(/[/.]+$/, "")
		.split("/")[0]!;

/**
 * A custom domain is any host the owner brought that isn't under the appliance's
 * own wildcard (e.g. `shop.acme.com` rather than `wordpress.acme.computebay.app`).
 * When no wildcard is configured yet, every host is treated as custom.
 */
const isCustomHost = (host: string, wildcardDomain: string | null): boolean =>
	!wildcardDomain || !host.endsWith(wildcardDomain);

const domainListFor = (id: string, kind: "application" | "compose") =>
	kind === "application"
		? findDomainsByApplicationId(id)
		: findDomainsByComposeId(id);

/** The custom domains (owner-supplied hosts) attached to one app. */
export const listCustomDomains = async (params: {
	id: string;
	kind: "application" | "compose";
}): Promise<CustomDomain[]> => {
	const config = await getComputeBayConfig();
	const domainList = await domainListFor(params.id, params.kind);
	return domainList
		.filter((d) => isCustomHost(d.host, config.wildcardDomain))
		.map((d) => ({ domainId: d.domainId, host: d.host, https: d.https }));
};

/**
 * Point an owner-supplied domain (e.g. `shop.acme.com`) at one of the appliance's
 * apps (spec §5.5). We clone the routing (port / service / path) from the app's
 * existing address so the app answers on the new host with no port questions, then:
 *
 *  - **managed:** ask the broker to add the DNS/ingress for the host (the broker
 *    owns the Cloudflare zone), so it "just works".
 *  - **self-host:** the owner controls their own DNS, so we only create the route;
 *    the UI shows the CNAME they must point at the appliance's wildcard host.
 *
 * Cloudflare terminates TLS, so custom domains use `certificateType: "none"` and
 * ride the public `web` entrypoint — never the Simple SSL surface (§5.5).
 */
export const addCustomDomain = async (params: {
	id: string;
	kind: "application" | "compose";
	host: string;
}): Promise<{ needsRedeploy: boolean }> => {
	const host = normalizeHost(params.host);
	if (!host || !host.includes(".")) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Enter a full domain, like shop.yourbusiness.com",
		});
	}

	const domainList = await domainListFor(params.id, params.kind);
	if (domainList.some((d) => d.host === host)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "That domain is already pointed at this app",
		});
	}

	// Clone routing from the app's existing address so the owner never sees a port.
	const template = domainList[0];
	if (!template) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Give this app its address first, then add a custom domain to it.",
		});
	}

	await createDomain({
		host,
		port: template.port,
		path: template.path,
		serviceName: template.serviceName,
		https: false,
		certificateType: "none",
		customEntrypoint: null,
		domainType: params.kind === "compose" ? "compose" : "application",
		applicationId: params.kind === "application" ? params.id : undefined,
		composeId: params.kind === "compose" ? params.id : undefined,
	});

	// Managed appliances let the broker publish the DNS; self-host owners do it
	// themselves (provisionCustomRoute no-ops for non-broker tiers via the guard).
	const config = await getComputeBayConfig();
	if (config.tier === "managed") {
		await provisionCustomRoute(host);
	}

	// Applications re-render Traefik config on create; compose carries its routing
	// as labels, so the caller must redeploy for the new host to take effect.
	return { needsRedeploy: params.kind === "compose" };
};

/** Remove a custom domain from an app and withdraw its public DNS (managed). */
export const removeCustomDomain = async (params: {
	domainId: string;
}): Promise<{ needsRedeploy: boolean; composeId: string | null }> => {
	const domain = await findDomainById(params.domainId);
	const host = domain.host;

	await removeDomainById(params.domainId);

	if (domain.applicationId) {
		const application = await findApplicationById(domain.applicationId);
		await removeDomain(application, domain.uniqueConfigKey);
	}

	const config = await getComputeBayConfig();
	if (config.tier === "managed") {
		await revokeCustomRoute(host);
	}

	return {
		needsRedeploy: !!domain.composeId,
		composeId: domain.composeId ?? null,
	};
};
