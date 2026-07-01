/**
 * ComputeBay Simple-shell copy.
 *
 * Single source of truth for the plain-language strings shown in the Simple
 * shell, so the tone stays consistent (spec §7 "Plain language, not jargon").
 * The Advanced shell keeps Dokploy's own strings — do not route those through
 * here. Localization is deferred (English-only MVP, spec §7), but keeping every
 * string in one module makes a future i18n pass mechanical.
 */

export const BRAND = {
	name: "ComputeBay",
	productName: "ComputeBay Platform",
	tagline: "Your business, running on your own hardware.",
} as const;

// Simple-shell top-level navigation labels (spec §4).
export const NAV = {
	home: "Home",
	apps: "Apps",
	catalog: "Catalog",
	backups: "Backups",
	settings: "Settings",
} as const;

// The single install-time question (spec §5.3).
export const EXPOSURE = {
	question: "Who should be able to use this app?",
	lan: {
		label: "Just people in this office",
		hint: "This Wi-Fi network",
		icon: "wifi",
	},
	public: {
		label: "Anyone with the link",
		hint: "Available on the internet",
		icon: "globe",
	},
	changeLater: "You can change this later.",
	// Confirmation when moving an app from LAN-only to public (spec §5.4).
	goPublicTitle: "Make this app available on the internet?",
	goPublicBody:
		"This app will be accessible from anywhere on the internet. Make sure it has a strong password.",
} as const;

// App status, in one word (spec §5.4).
export const STATUS = {
	running: "Running",
	stopped: "Stopped",
	updating: "Updating",
	error: "Error",
	idle: "Idle",
} as const;

// Plain-language resource headroom (spec §5.6, §7). Keyed by severity so the
// Home indicator can pick a colour without leaking percentages into the copy.
export const RESOURCE = {
	ok: "Plenty of room",
	warning: "Getting full — consider freeing space",
	critical: "Almost out of space",
} as const;

// Overall health badge (spec §5.6, §7 "Honest status").
export const HEALTH = {
	ok: "Everything's working",
	warning: "Some apps need attention",
	critical: "Something's wrong",
} as const;

// Support access indicator (managed tier, spec §5.9).
export const SUPPORT = {
	allowed: "Support access: Allowed",
	paused: "Support access: Paused",
	pauseAction: "Pause support access",
	resumeAction: "Allow support access",
} as const;
