"use client";
import { CheckCircle2, Download, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/utils/api";

/**
 * Plain-language appliance software updates (spec §5.7). Reuses Dokploy's own
 * update checker (`settings.getUpdateData`) and applier (`settings.updateServer`,
 * which runs `docker service update` on the control plane). No auto-updates —
 * the owner decides when to apply.
 *
 * Rendered as the body of a Settings <Card>, so it only returns the inner rows.
 */
export const SoftwareUpdate = () => {
	const { data: version } = api.settings.getDokployVersion.useQuery();
	const check = api.settings.getUpdateData.useMutation();
	const applyUpdate = api.settings.updateServer.useMutation();

	// Check once when the section mounts. It's a network call, so it's a mutation.
	useEffect(() => {
		check.mutate();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const updateAvailable = check.data?.updateAvailable === true;

	const runUpdate = async () => {
		if (
			!window.confirm(
				"Update the appliance software now? It will restart and may be unavailable for a few minutes. Your apps keep running.",
			)
		)
			return;
		try {
			await applyUpdate.mutateAsync();
			toast.success("Update started. This can take a few minutes.");
		} catch {
			toast.error("Couldn't start the update");
		}
	};

	return (
		<>
			<div
				style={{
					padding: "18px 20px",
					display: "flex",
					alignItems: "center",
					gap: 16,
					borderBottom: "1px solid var(--cb-border-subtle)",
				}}
			>
				<div
					style={{
						width: 36,
						height: 36,
						borderRadius: 8,
						background: updateAvailable
							? "color-mix(in srgb, var(--cb-brand) 15%, transparent)"
							: "color-mix(in srgb, var(--cb-success) 15%, transparent)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						flexShrink: 0,
					}}
				>
					{updateAvailable ? (
						<Download size={18} style={{ color: "var(--cb-brand)" }} />
					) : (
						<CheckCircle2 size={18} style={{ color: "var(--cb-success)" }} />
					)}
				</div>
				<div style={{ flex: 1 }}>
					<div
						style={{ fontWeight: 500, fontSize: 13, color: "var(--cb-text)" }}
					>
						{check.isPending
							? "Checking for updates…"
							: updateAvailable
								? "An update is available"
								: "You're up to date"}
					</div>
					<div
						style={{
							fontSize: 12,
							color: "var(--cb-text-muted)",
							marginTop: 2,
						}}
					>
						{updateAvailable && check.data?.latestVersion
							? `Version ${check.data.latestVersion} is ready to install.`
							: "The appliance software checks are automatic. Applying is up to you."}
					</div>
				</div>
				{updateAvailable ? (
					<button
						type="button"
						className="cb-btn cb-btn-primary"
						onClick={runUpdate}
						disabled={applyUpdate.isPending}
						style={{
							padding: "8px 14px",
							background: "var(--cb-brand)",
							color: "#fff",
							borderRadius: 6,
							fontWeight: 500,
							fontSize: 12,
							opacity: applyUpdate.isPending ? 0.6 : 1,
						}}
					>
						{applyUpdate.isPending ? "Updating…" : "Update now"}
					</button>
				) : (
					<button
						type="button"
						className="cb-btn"
						onClick={() => check.mutate()}
						disabled={check.isPending}
						title="Check again"
						style={{
							width: 32,
							height: 32,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							borderRadius: 6,
							color: "var(--cb-text-muted)",
						}}
					>
						<RefreshCw size={14} />
					</button>
				)}
			</div>
			<div
				style={{
					padding: "12px 20px",
					fontSize: 12,
					color: "var(--cb-text-muted)",
					display: "flex",
					gap: 8,
				}}
			>
				<span>Installed version</span>
				<span className="cb-mono" style={{ color: "var(--cb-text)" }}>
					{version ?? "—"}
				</span>
			</div>
		</>
	);
};
