import type { CompleteTemplate } from "../templates/github";
import { getComputeBayConfig } from "./computebay-config";

/**
 * ComputeBay catalog registry client (fork spec §5.2).
 *
 * Fleet Manager is the authoring source of truth for the curated catalog. This
 * module lets the appliance consume it as its template registry, replacing the
 * public Dokploy registry for curated installs:
 *
 *  - Managed appliances read from their broker (`brokerBaseUrl`) authenticated
 *    with the long-lived device token, so they can additionally receive
 *    beta-staged versions targeted at their customer.
 *  - Self-host appliances never phone home, so they read the same catalog from
 *    the public, unauthenticated mirror (stable channel only).
 *
 * The binary is identical for both tiers — only the config state (tier + broker
 * URL + device token) decides the source.
 */

// Public read-only mirror for self-host appliances. Overridable for staging.
const CATALOG_MIRROR_URL = (
	process.env.COMPUTEBAY_CATALOG_MIRROR_URL ?? "https://catalog.computebay.app"
).replace(/\/$/, "");

// Browse-list item — the metadata the Simple catalog renders. Shaped to match
// the static `CuratedApp` so the existing UI consumes it unchanged.
export interface ComputeBayCatalogApp {
	id: string;
	templateId: string;
	name: string;
	icon: string;
	iconBg: string;
	iconColor: string;
	desc: string;
	resource: string;
	partner: boolean;
	vendor?: string;
	source: "computebay";
	domains: Array<{
		serviceName: string;
		subdomain: string;
		port: number;
		path?: string;
	}>;
}

// The full FM-native artifact returned for a single entry (install path).
interface FmArtifact {
	slug: string;
	name: string;
	description?: string;
	logo?: string | null;
	tags?: string[];
	version: string;
	compose: string;
	variables?: Record<string, string>;
	env?: Record<string, string>;
	domains?: Array<{
		serviceName: string;
		subdomain: string;
		port: number;
		path?: string;
	}>;
	mounts?: Array<{ filePath: string; content: string }>;
	isolated?: boolean;
}

const normalizeBaseUrl = (url: string) => url.replace(/\/$/, "");

const fetchJson = async (
	url: string,
	headers: Record<string, string> = {},
): Promise<any> => {
	const response = await fetch(url, {
		headers: { "content-type": "application/json", ...headers },
		signal: AbortSignal.timeout(10000),
	});
	const body = (await response.json().catch(() => null)) as any;
	if (!response.ok) {
		throw new Error(body?.error?.message || "Catalog request failed");
	}
	return body;
};

// Resolve where this appliance reads its catalog from: the device-authed broker
// (managed) or the public mirror (self-host / not-yet-activated).
const resolveSource = async () => {
	const config = await getComputeBayConfig();
	if (config.tier === "managed" && config.brokerBaseUrl && config.deviceToken) {
		return {
			base: normalizeBaseUrl(config.brokerBaseUrl),
			headers: { authorization: `Bearer ${config.deviceToken}` },
			listPath: "/catalog/published",
			entryPath: "/catalog/published-entry",
		};
	}
	return {
		base: CATALOG_MIRROR_URL,
		headers: {} as Record<string, string>,
		listPath: "/public/catalog/list",
		entryPath: "/public/catalog/entry",
	};
};

/** Browse list of published curated apps for the Simple catalog grid. */
export const fetchComputebayCatalog = async (): Promise<
	ComputeBayCatalogApp[]
> => {
	const src = await resolveSource();
	const body = await fetchJson(`${src.base}${src.listPath}`, src.headers);
	const apps = (body?.apps ?? []) as any[];
	return apps.map((a) => ({
		id: a.slug,
		templateId: a.slug,
		name: a.name,
		icon: a.icon ?? "box",
		iconBg: a.iconBg ?? "#F1F5F9",
		iconColor: a.iconColor ?? "#0F172A",
		desc: a.description ?? "",
		resource: a.resource ?? "",
		partner: !!a.partner,
		vendor: a.vendor ?? undefined,
		source: "computebay" as const,
		domains: Array.isArray(a.domains)
			? a.domains.map((d: any) => ({
					serviceName: String(d.serviceName ?? ""),
					subdomain: String(d.subdomain ?? ""),
					port: Number(d.port ?? 0),
					...(d.path ? { path: String(d.path) } : {}),
				}))
			: [],
	}));
};

/**
 * Fetch one entry's deployable artifact and map it into the Dokploy
 * `CompleteTemplate` shape `deployTemplate` → `processTemplate` already
 * consumes. Returns the same `{ config, dockerCompose }` contract as
 * `fetchTemplateFiles`, so the install pipeline is reused unchanged.
 */
export const fetchComputebayTemplate = async (
	slug: string,
): Promise<{ config: CompleteTemplate; dockerCompose: string }> => {
	const src = await resolveSource();
	const body = await fetchJson(
		`${src.base}${src.entryPath}?slug=${encodeURIComponent(slug)}`,
		src.headers,
	);
	const app = body?.app as FmArtifact | undefined;
	if (!app) throw new Error(`Catalog app "${slug}" not found`);

	const config: CompleteTemplate = {
		metadata: {
			id: app.slug,
			name: app.name,
			description: app.description ?? "",
			tags: app.tags ?? [],
			version: app.version ?? "",
			logo: app.logo ?? "",
			links: { github: "" },
		},
		variables: app.variables ?? {},
		config: {
			isolated: app.isolated,
			// `subdomain` carries the author's label; deployTemplate resolves it to
			// `<subdomain>.<appliance-wildcard-domain>` at install, honoring any
			// per-service subdomain override the customer chose. `host` is left
			// unset so the no-wildcard fallback still generates a valid host.
			domains: (app.domains ?? []).map((d) => ({
				serviceName: d.serviceName,
				port: d.port,
				subdomain: d.subdomain,
				...(d.path ? { path: d.path } : {}),
			})),
			env: app.env ?? {},
			mounts: app.mounts ?? [],
		},
	};

	return { config, dockerCompose: app.compose };
};
