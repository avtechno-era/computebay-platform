/**
 * ComputeBay curated catalog (spec §5.2).
 *
 * A small, Avante-vetted list shown as the primary install surface in the Simple
 * shell. Each entry is plain-language and maps to an existing Dokploy template id
 * (`templateId`) so installation reuses `compose.deployTemplate` — we do not
 * re-implement app packaging.
 *
 * FLAG (Phase 1 seam): `templateId` values must be reconciled against the live
 * Dokploy template registry (templates.dokploy.com/meta.json). The slugs below
 * follow the registry's naming convention but should be verified before launch;
 * an unknown id will surface as "not available" rather than silently failing.
 *
 * `resource` is a human estimate used both for display and (later, Phase 2) for
 * the "installing this would over-allocate" dashboard warning.
 */

export interface CuratedApp {
	id: string;
	/** Dokploy template id used by compose.deployTemplate. */
	templateId: string;
	name: string;
	/** lucide icon name. */
	icon: string;
	iconBg: string;
	iconColor: string;
	/** Plain-language, one sentence. */
	desc: string;
	/** e.g. "~500 MB RAM · 2 GB disk". */
	resource: string;
}

export interface PartnerApp extends CuratedApp {
	vendor: string;
}

// Launch set (spec §5.2 / §8.7). Icons + colours mirror the approved design.
export const CURATED_APPS: CuratedApp[] = [
	{
		id: "nextcloud",
		templateId: "nextcloud",
		name: "Nextcloud",
		icon: "cloud",
		iconBg: "#E0F2FE",
		iconColor: "#0369A1",
		desc: "Keep your files, calendar, and contacts in one place.",
		resource: "~500 MB RAM · 2 GB disk",
	},
	{
		id: "wordpress",
		templateId: "wordpress",
		name: "WordPress",
		icon: "globe",
		iconBg: "#DBEAFE",
		iconColor: "#1D4ED8",
		desc: "Build and run your business website.",
		resource: "~200 MB RAM · 500 MB disk",
	},
	{
		id: "invoice-ninja",
		templateId: "invoiceninja",
		name: "Invoice Ninja",
		icon: "receipt",
		iconBg: "#FEF3C7",
		iconColor: "#B45309",
		desc: "Send invoices and track who has paid.",
		resource: "~300 MB RAM · 800 MB disk",
	},
	{
		id: "n8n",
		templateId: "n8n",
		name: "n8n",
		icon: "workflow",
		iconBg: "#FCE7F3",
		iconColor: "#9D174D",
		desc: "Automate everyday tasks across your apps.",
		resource: "~150 MB RAM · 500 MB disk",
	},
	{
		id: "syncthing",
		templateId: "syncthing",
		name: "Syncthing",
		icon: "refresh-ccw",
		iconBg: "#E0E7FF",
		iconColor: "#3730A3",
		desc: "Sync files automatically to your staff's devices.",
		resource: "~100 MB RAM · varies",
	},
	{
		id: "dolibarr",
		templateId: "dolibarr",
		name: "Dolibarr",
		icon: "briefcase",
		iconBg: "#DCFCE7",
		iconColor: "#166534",
		desc: "Manage sales, stock, and accounting in one system.",
		resource: "~400 MB RAM · 1 GB disk",
	},
	{
		id: "checkmate",
		templateId: "checkmate",
		name: "Checkmate",
		icon: "activity",
		iconBg: "#F1F5F9",
		iconColor: "#0F172A",
		desc: "Check whether your website is up and reachable.",
		resource: "~150 MB RAM · 500 MB disk",
	},
];

// Partner-endorsed apps (spec §5.2). Independent PH/regional products Avante has
// reviewed — badged, never white-labelled. Empty at launch; populated as partners
// are onboarded (kept here so the tab renders and the shape is stable).
export const PARTNER_APPS: PartnerApp[] = [];

export const curatedById = (id: string): CuratedApp | undefined =>
	CURATED_APPS.find((a) => a.id === id);
