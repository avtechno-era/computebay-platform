"use client";
import { HEALTH } from "@/lib/computebay-strings";
import { api } from "@/utils/api";

export type HealthLevel = "ok" | "warning" | "critical";

export interface ApplianceHealth {
	level: HealthLevel;
	label: string;
	/** Number of apps currently in an error state. */
	erroredApps: number;
	color: string;
	softBg: string;
	icon: "check-circle-2" | "alert-triangle" | "alert-octagon";
}

const LEVEL_META: Record<
	HealthLevel,
	{
		color: string;
		softBg: string;
		icon: ApplianceHealth["icon"];
		label: string;
	}
> = {
	ok: {
		color: "var(--cb-success)",
		softBg: "color-mix(in srgb, var(--cb-success) 14%, transparent)",
		icon: "check-circle-2",
		label: HEALTH.ok,
	},
	warning: {
		color: "var(--cb-warning)",
		softBg: "color-mix(in srgb, var(--cb-warning) 14%, transparent)",
		icon: "alert-triangle",
		label: HEALTH.warning,
	},
	critical: {
		color: "var(--cb-error)",
		softBg: "color-mix(in srgb, var(--cb-error) 14%, transparent)",
		icon: "alert-octagon",
		label: HEALTH.critical,
	},
};

/**
 * Overall appliance health (spec §5.6 "Is everything working?").
 *
 * Phase 1 derives the level from app statuses only. Phase 2/3 fold in tunnel
 * health (from the broker/Cloudflare API) and resource headroom — those are
 * additive; the worst signal wins.
 */
export const useApplianceHealth = (): ApplianceHealth => {
	const { data: apps } = api.computebay.listApps.useQuery(undefined, {
		staleTime: 30_000,
	});

	const erroredApps = (apps ?? []).filter((a) => a.status === "error").length;
	const level: HealthLevel = erroredApps > 0 ? "critical" : "ok";
	const meta = LEVEL_META[level];

	return {
		level,
		label: meta.label,
		erroredApps,
		color: meta.color,
		softBg: meta.softBg,
		icon: meta.icon,
	};
};

/** Compact health pill for the top bar. */
export const ApplianceHealthPill = ({
	health,
}: {
	health: ApplianceHealth;
}) => {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "6px 12px",
				border: "1px solid var(--cb-border)",
				borderRadius: 9999,
				fontWeight: 500,
				fontSize: 12,
				color: "var(--cb-text)",
			}}
		>
			<span
				className="cb-pulse"
				style={{
					width: 8,
					height: 8,
					borderRadius: "50%",
					background: health.color,
					flexShrink: 0,
				}}
			/>
			<span>{health.label}</span>
		</div>
	);
};
