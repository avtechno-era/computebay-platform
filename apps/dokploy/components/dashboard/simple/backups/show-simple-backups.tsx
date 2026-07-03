"use client";
import { HardDrive, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/utils/api";
import { useShellMode } from "../../../layouts/shell-mode";
import { AddDestinationModal } from "./add-destination-modal";

export const ShowSimpleBackups = () => {
	const { setMode } = useShellMode();
	const utils = api.useUtils();
	const { data: destinations } = api.destination.all.useQuery();
	const removeDestination = api.destination.remove.useMutation();
	const [adding, setAdding] = useState(false);

	const remove = async (destinationId: string, name: string) => {
		if (
			!window.confirm(
				`Remove "${name}"? Existing backups stored there are not deleted, but no new backups will be sent to it.`,
			)
		)
			return;
		try {
			await removeDestination.mutateAsync({ destinationId });
			await utils.destination.all.invalidate();
			toast.success(`Removed ${name}`);
		} catch {
			toast.error("Couldn't remove that storage");
		}
	};

	return (
		<div className="cb-fade" style={{ maxWidth: 1000, margin: "0 auto" }}>
			<div style={{ marginBottom: 24 }}>
				<h1
					style={{
						font: "600 24px/1.2 'Inter'",
						color: "var(--cb-text)",
						margin: 0,
						letterSpacing: "-0.01em",
					}}
				>
					Backups
				</h1>
				<div
					style={{ fontSize: 13, color: "var(--cb-text-muted)", marginTop: 4 }}
				>
					Where your data is kept, and how to get it back.
				</div>
			</div>

			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: 10,
				}}
			>
				<div className="cb-eyebrow">Where backups go</div>
				<button
					type="button"
					className="cb-btn cb-btn-primary"
					onClick={() => setAdding(true)}
					style={{
						padding: "7px 13px",
						background: "var(--cb-brand)",
						color: "#fff",
						borderRadius: 6,
						fontWeight: 500,
						fontSize: 12,
						display: "flex",
						alignItems: "center",
						gap: 6,
					}}
				>
					<Plus size={13} />
					Add storage
				</button>
			</div>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(2, 1fr)",
					gap: 12,
					marginBottom: 32,
				}}
			>
				{(destinations ?? []).length === 0 && (
					<div
						style={{
							gridColumn: "1 / -1",
							padding: "20px",
							border: "1px solid var(--cb-border)",
							borderRadius: 8,
							background: "var(--cb-elevated)",
							fontSize: 13,
							color: "var(--cb-text-muted)",
						}}
					>
						No backup storage yet. Add cloud storage with “Add storage” above to
						start keeping backups.
						{/* Deferred: USB / network share / Google Drive destinations. */}
					</div>
				)}
				{(destinations ?? []).map((d) => (
					<div
						key={d.destinationId}
						style={{
							border: "1px solid var(--cb-border)",
							borderRadius: 8,
							background: "var(--cb-elevated)",
							padding: "16px 18px",
							display: "flex",
							alignItems: "flex-start",
							gap: 14,
						}}
					>
						<div
							style={{
								width: 36,
								height: 36,
								borderRadius: 8,
								background: "var(--cb-surface-2)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								color: "var(--cb-brand)",
								flexShrink: 0,
							}}
						>
							<HardDrive size={18} />
						</div>
						<div style={{ flex: 1, minWidth: 0 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
								<div
									style={{
										fontWeight: 600,
										fontSize: 13,
										color: "var(--cb-text)",
									}}
								>
									{d.name}
								</div>
								<span
									className="cb-mono"
									style={{
										fontSize: 10,
										color: "var(--cb-success)",
										background:
											"color-mix(in srgb, var(--cb-success) 12%, transparent)",
										padding: "2px 6px",
										borderRadius: 9999,
									}}
								>
									CONNECTED
								</span>
							</div>
							<div
								className="cb-mono"
								style={{
									fontSize: 12,
									lineHeight: 1.5,
									color: "var(--cb-text-muted)",
									marginTop: 4,
								}}
							>
								{d.bucket}
							</div>
						</div>
						<button
							type="button"
							className="cb-btn"
							title="Remove"
							onClick={() => remove(d.destinationId, d.name)}
							style={{
								width: 28,
								height: 28,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								borderRadius: 6,
								color: "var(--cb-text-muted)",
								flexShrink: 0,
							}}
						>
							<Trash2 size={14} />
						</button>
					</div>
				))}
			</div>

			{/* Deferred-surface stub (Phase 5): USB drives, office network shares
			    (SMB/NFS), and Google Drive are planned backup destinations. Only S3
			    cloud storage is wired today, so we set expectations honestly here. */}
			<div
				style={{
					fontSize: 12,
					color: "var(--cb-text-muted)",
					marginTop: -22,
					marginBottom: 32,
				}}
			>
				Backing up to a USB drive, an office network share, or Google Drive is
				coming in a later update.
			</div>

			<div
				style={{
					marginTop: 8,
					padding: "14px 18px",
					border: "1px solid var(--cb-border)",
					borderRadius: 8,
					background: "var(--cb-surface)",
					display: "flex",
					alignItems: "center",
					gap: 12,
				}}
			>
				<RotateCcw size={18} style={{ color: "var(--cb-brand)" }} />
				<div style={{ flex: 1 }}>
					<div
						style={{ fontWeight: 500, fontSize: 13, color: "var(--cb-text)" }}
					>
						Restore from a backup
					</div>
					<div
						style={{
							fontSize: 12,
							color: "var(--cb-text-muted)",
							marginTop: 2,
						}}
					>
						Works even if the app has been uninstalled.
					</div>
				</div>
				<button
					type="button"
					className="cb-btn"
					onClick={() => setMode("advanced")}
					style={{
						padding: "8px 14px",
						border: "1px solid var(--cb-border)",
						borderRadius: 6,
						fontWeight: 500,
						fontSize: 12,
						color: "var(--cb-text)",
					}}
				>
					Browse restore points
				</button>
			</div>

			{adding && <AddDestinationModal onClose={() => setAdding(false)} />}
		</div>
	);
};
