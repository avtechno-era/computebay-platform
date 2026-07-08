"use client";
import { AlertOctagon, ArrowRight } from "lucide-react";
import { useRouter } from "next/router";
import { api } from "@/utils/api";
import { useApplianceHealth } from "../../../layouts/simple/health";
import { CbIcon } from "../cb-icon";

const greetingForHour = (h: number) =>
	h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";

interface Resource {
	label: string;
	percent: number;
	detail: string;
}

/** Docker reports memory as strings like "1.5GiB" — normalise to bytes. */
const memToBytes = (raw: unknown): number => {
	const s = String(raw ?? "");
	const value = Number.parseFloat(s) || 0;
	const unit = s.replace(/[0-9.]/g, "").trim();
	const mult: Record<string, number> = {
		KiB: 1024,
		MiB: 1024 ** 2,
		GiB: 1024 ** 3,
		TiB: 1024 ** 4,
	};
	return value * (mult[unit] ?? 1);
};

/** Plain-language headroom instead of a raw percentage (spec §5.6, §7). */
const headroomLabel = (percent: number) =>
	percent < 70
		? "Plenty of room"
		: percent < 90
			? "Getting full"
			: "Almost full";

/**
 * Resource headroom (storage / memory) for the whole appliance.
 *
 * Reuses the existing free container-monitoring feed: the `dokploy` container's
 * stats carry host-level disk and memory (same source the Advanced monitoring
 * screen reads). Returns null until a sample arrives so the UI honestly shows
 * "Checking…" rather than inventing a number.
 */
const useApplianceResources = (): {
	storage: Resource | null;
	memory: Resource | null;
} => {
	const { data } = api.application.readAppMonitoring.useQuery(
		{ appName: "dokploy" },
		{ refetchOnWindowFocus: false, retry: false },
	);

	if (!data) return { storage: null, memory: null };

	const disk = data.disk?.[data.disk.length - 1]?.value;
	const mem = data.memory?.[data.memory.length - 1]?.value;

	const storage: Resource | null =
		disk && disk.diskTotal > 0
			? {
					label: headroomLabel(disk.diskUsedPercentage),
					percent: Math.min(100, Math.round(disk.diskUsedPercentage)),
					detail: `${disk.diskUsage} GB of ${disk.diskTotal} GB used`,
				}
			: null;

	const usedBytes = memToBytes(mem?.used);
	const totalBytes = memToBytes(mem?.total);
	const memory: Resource | null =
		totalBytes > 0
			? {
					label: headroomLabel((usedBytes / totalBytes) * 100),
					percent: Math.min(100, Math.round((usedBytes / totalBytes) * 100)),
					detail: `${mem?.used} of ${mem?.total} in use`,
				}
			: null;

	return { storage, memory };
};

export const ShowSimpleHome = () => {
	const router = useRouter();
	const { data: config } = api.computebay.getConfig.useQuery();
	const { data: apps } = api.computebay.listApps.useQuery();
	const health = useApplianceHealth();
	const resources = useApplianceResources();

	const isManaged = config?.tier === "managed";

	// Honest public-reachability status from the broker (§5.6). Managed only —
	// self-host has no broker to ask, so we fall back to the stored tunnel flag.
	const { data: tunnelHealth } = api.computebay.tunnelHealth.useQuery(
		undefined,
		{
			enabled: isManaged,
			refetchInterval: 60_000,
		},
	);
	const businessName = config?.businessName?.trim();
	const now = new Date();
	const greeting = greetingForHour(now.getHours());
	const todayStr = now.toLocaleDateString("en-PH", {
		weekday: "long",
		month: "long",
		day: "numeric",
	});

	const erroredApps = (apps ?? []).filter((a) => a.status === "error");
	const recentApps = [...(apps ?? [])]
		.filter((a) => a.createdAt)
		.sort((a, b) => (a.createdAt! < b.createdAt! ? 1 : -1))
		.slice(0, 4);

	const healthHeadline =
		health.level === "ok"
			? "Everything's working"
			: health.level === "critical"
				? `${erroredApps.length} app${erroredApps.length === 1 ? "" : "s"} need attention`
				: "Some apps need attention";
	const healthSub =
		health.level === "ok"
			? "All your apps are running normally."
			: "Open the app to see what's wrong and restart it.";

	// Prefer the broker's honest health when we have it; otherwise reflect the
	// stored config so self-host and pre-heartbeat appliances still read sensibly.
	const tunnelConfigured = config?.tunnelConfigured === true;
	const tunnelState: {
		label: string;
		live: boolean;
		tone: "success" | "warning" | "subtle";
	} = (() => {
		if (isManaged && tunnelHealth?.configured) {
			switch (tunnelHealth.status) {
				case "healthy":
					return { label: "Connected", live: true, tone: "success" };
				case "degraded":
					return { label: "Reconnecting", live: false, tone: "warning" };
				case "down":
					return { label: "Offline", live: false, tone: "warning" };
				default:
					break;
			}
		}
		return tunnelConfigured
			? { label: "Connected", live: true, tone: "success" }
			: { label: "Not set up", live: false, tone: "subtle" };
	})();
	const tunnelDotColor =
		tunnelState.tone === "success"
			? "var(--cb-success)"
			: tunnelState.tone === "warning"
				? "var(--cb-warning)"
				: "var(--cb-text-subtle)";

	const statCell = (label: string, body: React.ReactNode, last?: boolean) => (
		<div
			style={{
				padding: "18px 24px",
				borderRight: last ? undefined : "1px solid var(--cb-border-subtle)",
			}}
		>
			<div className="cb-eyebrow" style={{ marginBottom: 8 }}>
				{label}
			</div>
			{body}
		</div>
	);

	const resourceBody = (
		res: { label: string; percent: number; detail: string } | null,
	) => {
		if (!res) {
			return (
				<div
					style={{
						fontWeight: 500,
						fontSize: 14,
						color: "var(--cb-text-muted)",
					}}
				>
					Checking…
				</div>
			);
		}
		return (
			<>
				<div style={{ fontWeight: 500, fontSize: 14, color: "var(--cb-text)" }}>
					{res.label}
				</div>
				<div
					style={{
						marginTop: 8,
						height: 5,
						background: "var(--cb-surface-2)",
						borderRadius: 9999,
						overflow: "hidden",
					}}
				>
					<div
						style={{
							width: `${res.percent}%`,
							height: "100%",
							background:
								res.percent >= 90
									? "var(--cb-error)"
									: res.percent >= 70
										? "var(--cb-warning)"
										: "var(--cb-success)",
							borderRadius: 9999,
						}}
					/>
				</div>
				<div
					style={{ fontSize: 12, color: "var(--cb-text-muted)", marginTop: 6 }}
				>
					{res.detail}
				</div>
			</>
		);
	};

	return (
		<div className="cb-fade" style={{ maxWidth: 1080, margin: "0 auto" }}>
			<div
				style={{
					display: "flex",
					alignItems: "flex-end",
					justifyContent: "space-between",
					marginBottom: 8,
				}}
			>
				<div>
					<div className="cb-eyebrow" style={{ color: "var(--cb-brand)" }}>
						{businessName ?? "ComputeBay"}
					</div>
					<h1
						style={{
							font: "600 26px/1.2 'Inter'",
							color: "var(--cb-text)",
							margin: "6px 0 0",
							letterSpacing: "-0.01em",
						}}
					>
						{greeting}
					</h1>
				</div>
				<div style={{ fontSize: 13, color: "var(--cb-text-muted)" }}>
					{todayStr}
				</div>
			</div>

			{/* Finish-setup banner: shown until the appliance has an internet tunnel.
				    Apps already work on the LAN, so this is an invitation, not a block. */}
			{config && config.tunnelConfigured !== true && (
				<button
					type="button"
					className="cb-card-hover"
					onClick={() => router.push("/dashboard/simple/setup")}
					style={{
						marginTop: 20,
						width: "100%",
						textAlign: "left",
						display: "flex",
						alignItems: "center",
						gap: 14,
						border: "1px solid var(--cb-brand)",
						borderRadius: 8,
						background: "var(--cb-brand-muted)",
						padding: "16px 20px",
						cursor: "pointer",
					}}
				>
					<div style={{ flex: 1 }}>
						<div
							style={{ fontWeight: 600, fontSize: 14, color: "var(--cb-text)" }}
						>
							Finish setting up your appliance
						</div>
						<div
							style={{
								fontSize: 12.5,
								color: "var(--cb-text-muted)",
								marginTop: 2,
							}}
						>
							Connect it to the internet so your apps get a public address. Your
							apps already work on your office network.
						</div>
					</div>
					<ArrowRight
						size={18}
						style={{ color: "var(--cb-brand)", flexShrink: 0 }}
					/>
				</button>
			)}

			{/* Health panel */}
			<div
				style={{
					marginTop: 24,
					border: "1px solid var(--cb-border)",
					borderRadius: 8,
					background: "var(--cb-elevated)",
					overflow: "hidden",
				}}
			>
				<div
					style={{
						padding: "20px 24px",
						display: "flex",
						alignItems: "center",
						gap: 20,
						borderBottom: "1px solid var(--cb-border-subtle)",
					}}
				>
					<div
						style={{
							width: 48,
							height: 48,
							borderRadius: 9999,
							background: health.softBg,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							flexShrink: 0,
						}}
					>
						<CbIcon
							name={health.icon}
							size={24}
							style={{ color: health.color }}
						/>
					</div>
					<div style={{ flex: 1 }}>
						<div
							style={{ fontWeight: 600, fontSize: 17, color: "var(--cb-text)" }}
						>
							{healthHeadline}
						</div>
						<div
							style={{
								fontSize: 13,
								color: "var(--cb-text-muted)",
								marginTop: 2,
							}}
						>
							{healthSub}
						</div>
					</div>
					<button
						type="button"
						className="cb-btn"
						onClick={() => router.push("/dashboard/simple/apps")}
						style={{
							padding: "8px 14px",
							border: "1px solid var(--cb-border)",
							borderRadius: 6,
							fontWeight: 500,
							fontSize: 13,
							color: "var(--cb-text)",
						}}
					>
						Open apps
					</button>
				</div>

				<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
					{statCell(
						"Internet tunnel",
						<>
							<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
								<span
									className={tunnelState.live ? "cb-pulse" : undefined}
									style={{
										width: 8,
										height: 8,
										borderRadius: "50%",
										background: tunnelDotColor,
									}}
								/>
								<span
									style={{
										fontWeight: 500,
										fontSize: 14,
										color: "var(--cb-text)",
									}}
								>
									{tunnelState.label}
								</span>
							</div>
							<div
								className="cb-mono"
								style={{
									fontSize: 12,
									color: "var(--cb-text-muted)",
									marginTop: 4,
								}}
							>
								{config?.wildcardDomain ?? "—"}
							</div>
						</>,
					)}
					{statCell("Storage", resourceBody(resources.storage))}
					{statCell("Memory", resourceBody(resources.memory), true)}
				</div>
			</div>

			{/* Attention + activity */}
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "1fr 1fr",
					gap: 20,
					marginTop: 24,
				}}
			>
				<section
					style={{
						border: "1px solid var(--cb-border)",
						borderRadius: 8,
						background: "var(--cb-elevated)",
					}}
				>
					<div
						style={{
							padding: "16px 20px",
							borderBottom: "1px solid var(--cb-border-subtle)",
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
						}}
					>
						<div
							style={{ fontWeight: 600, fontSize: 13, color: "var(--cb-text)" }}
						>
							Needs attention
						</div>
						<div
							className="cb-mono"
							style={{ fontSize: 11, color: "var(--cb-text-muted)" }}
						>
							{erroredApps.length} item{erroredApps.length === 1 ? "" : "s"}
						</div>
					</div>
					{erroredApps.length === 0 ? (
						<div
							style={{
								padding: "20px",
								fontSize: 13,
								color: "var(--cb-text-muted)",
							}}
						>
							Nothing needs your attention right now.
						</div>
					) : (
						erroredApps.map((a) => (
							<div
								key={a.id}
								style={{
									padding: "14px 20px",
									borderBottom: "1px solid var(--cb-border-subtle)",
									display: "flex",
									gap: 12,
									alignItems: "flex-start",
								}}
							>
								<AlertOctagon
									size={16}
									style={{
										color: "var(--cb-error)",
										flexShrink: 0,
										marginTop: 2,
									}}
								/>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div
										style={{
											fontWeight: 500,
											fontSize: 13,
											color: "var(--cb-text)",
										}}
									>
										{a.name} isn't running
									</div>
									<div
										style={{
											fontSize: 12,
											color: "var(--cb-text-muted)",
											marginTop: 2,
										}}
									>
										Open the app to restart it or view logs.
									</div>
								</div>
								<button
									type="button"
									className="cb-btn"
									onClick={() => router.push(`/dashboard/simple/apps/${a.id}`)}
									style={{
										fontWeight: 500,
										fontSize: 12,
										color: "var(--cb-brand)",
										flexShrink: 0,
										background: "transparent",
									}}
								>
									View
								</button>
							</div>
						))
					)}
				</section>

				<section
					style={{
						border: "1px solid var(--cb-border)",
						borderRadius: 8,
						background: "var(--cb-elevated)",
					}}
				>
					<div
						style={{
							padding: "16px 20px",
							borderBottom: "1px solid var(--cb-border-subtle)",
							fontWeight: 600,
							fontSize: 13,
							color: "var(--cb-text)",
						}}
					>
						Recent activity
					</div>
					{recentApps.length === 0 ? (
						<div
							style={{
								padding: "20px",
								fontSize: 13,
								color: "var(--cb-text-muted)",
							}}
						>
							No recent activity yet.
						</div>
					) : (
						recentApps.map((a) => (
							<div
								key={a.id}
								style={{
									padding: "12px 20px",
									borderBottom: "1px solid var(--cb-border-subtle)",
									fontSize: 13,
									color: "var(--cb-text)",
								}}
							>
								Installed {a.name}
								<div
									className="cb-mono"
									style={{
										fontSize: 11,
										color: "var(--cb-text-muted)",
										marginTop: 2,
									}}
								>
									{a.createdAt
										? new Date(a.createdAt).toLocaleDateString("en-PH")
										: ""}
								</div>
							</div>
						))
					)}
				</section>
			</div>

			{/* Support strip (managed only) */}
			{isManaged && (
				<div
					style={{
						marginTop: 24,
						border: "1px solid var(--cb-border)",
						borderRadius: 8,
						background: "var(--cb-surface)",
						padding: "16px 20px",
						display: "flex",
						alignItems: "center",
						gap: 16,
					}}
				>
					<CbIcon
						name="life-buoy"
						size={18}
						style={{ color: "var(--cb-brand)" }}
					/>
					<div style={{ flex: 1 }}>
						<div
							style={{ fontWeight: 500, fontSize: 13, color: "var(--cb-text)" }}
						>
							Avante support access —{" "}
							{config?.supportAccessPaused ? "Paused" : "Allowed"}
						</div>
						<div
							style={{
								fontSize: 12,
								color: "var(--cb-text-muted)",
								marginTop: 2,
							}}
						>
							{config?.supportAccessPaused
								? "Avante can't connect until you allow it again."
								: "Avante can connect to help when you ask."}
						</div>
					</div>
					<button
						type="button"
						className="cb-btn"
						onClick={() => router.push("/dashboard/simple/settings")}
						style={{
							fontWeight: 500,
							fontSize: 12,
							color: "var(--cb-brand)",
							padding: "6px 10px",
							background: "transparent",
						}}
					>
						Manage →
					</button>
				</div>
			)}
		</div>
	);
};
