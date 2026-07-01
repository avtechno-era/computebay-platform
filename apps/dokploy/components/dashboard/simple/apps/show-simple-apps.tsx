"use client";
import type { SimpleApp } from "@dokploy/server/services/computebay-apps";
import {
	ExternalLink,
	Globe,
	LayoutGrid,
	Plus,
	RotateCw,
	Wifi,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { toast } from "sonner";
import { api } from "@/utils/api";
import { statusMeta } from "../shared";

const COLS = "1fr 110px 150px 140px 100px";

export const ShowSimpleApps = () => {
	const router = useRouter();
	const { data: apps, isLoading } = api.computebay.listApps.useQuery();
	const utils = api.useUtils();
	const reloadApp = api.application.reload.useMutation();
	const redeployCompose = api.compose.redeploy.useMutation();

	const restart = async (app: SimpleApp) => {
		try {
			if (app.kind === "application") {
				await reloadApp.mutateAsync({
					applicationId: app.id,
					appName: app.appName,
				});
			} else {
				await redeployCompose.mutateAsync({ composeId: app.id });
			}
			toast.success(`Restarting ${app.name}`);
			await utils.computebay.listApps.invalidate();
		} catch {
			toast.error(`Couldn't restart ${app.name}`);
		}
	};

	const count = apps?.length ?? 0;

	return (
		<div className="cb-fade" style={{ maxWidth: 1080, margin: "0 auto" }}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: 20,
				}}
			>
				<div>
					<h1
						style={{
							font: "600 24px/1.2 'Inter'",
							color: "var(--cb-text)",
							margin: 0,
							letterSpacing: "-0.01em",
						}}
					>
						Apps
					</h1>
					<div
						style={{
							fontSize: 13,
							color: "var(--cb-text-muted)",
							marginTop: 4,
						}}
					>
						{isLoading
							? "Loading…"
							: `${count} app${count === 1 ? "" : "s"} installed`}
					</div>
				</div>
				<button
					type="button"
					className="cb-btn cb-btn-primary"
					onClick={() => router.push("/dashboard/simple/catalog")}
					style={{
						padding: "9px 16px",
						background: "var(--cb-brand)",
						color: "#fff",
						borderRadius: 6,
						fontWeight: 500,
						fontSize: 13,
						display: "flex",
						alignItems: "center",
						gap: 6,
					}}
				>
					<Plus size={14} />
					Install an app
				</button>
			</div>

			<div
				style={{
					border: "1px solid var(--cb-border)",
					borderRadius: 8,
					background: "var(--cb-elevated)",
					overflow: "hidden",
				}}
			>
				<div
					className="cb-eyebrow"
					style={{
						display: "grid",
						gridTemplateColumns: COLS,
						padding: "10px 20px",
						background: "var(--cb-surface)",
						borderBottom: "1px solid var(--cb-border)",
					}}
				>
					<div>App</div>
					<div>Status</div>
					<div>Available to</div>
					<div>Last accessed</div>
					<div />
				</div>

				{count === 0 && !isLoading && (
					<div
						style={{
							padding: "40px 20px",
							textAlign: "center",
							color: "var(--cb-text-muted)",
							fontSize: 13,
						}}
					>
						No apps yet. Install one from the Catalog to get started.
					</div>
				)}

				{apps?.map((app) => {
					const s = statusMeta(app.status);
					const isPublic = app.exposureMode === "public";
					return (
						<div
							key={`${app.kind}-${app.id}`}
							className="cb-row"
							style={{
								display: "grid",
								gridTemplateColumns: COLS,
								width: "100%",
								padding: "14px 20px",
								borderBottom: "1px solid var(--cb-border-subtle)",
								alignItems: "center",
							}}
						>
							<Link
								href={`/dashboard/simple/apps/${app.id}`}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 12,
									minWidth: 0,
									textDecoration: "none",
									color: "inherit",
								}}
							>
								<div
									style={{
										width: 32,
										height: 32,
										borderRadius: 6,
										background: "var(--cb-surface-2)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										flexShrink: 0,
										color: "var(--cb-brand)",
									}}
								>
									<LayoutGrid size={16} />
								</div>
								<div style={{ minWidth: 0 }}>
									<div
										style={{
											fontWeight: 500,
											fontSize: 13,
											color: "var(--cb-text)",
										}}
									>
										{app.name}
									</div>
									<div
										className="cb-mono"
										style={{
											fontSize: 12,
											color: "var(--cb-text-muted)",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
									>
										{app.url ?? "—"}
									</div>
								</div>
							</Link>

							<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
								<span
									className={s.pulse ? "cb-pulse" : undefined}
									style={{
										width: 7,
										height: 7,
										borderRadius: "50%",
										background: s.color,
									}}
								/>
								<span
									style={{
										fontWeight: 500,
										fontSize: 12,
										color: "var(--cb-text)",
									}}
								>
									{s.label}
								</span>
							</div>

							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 6,
									color: "var(--cb-text-muted)",
								}}
							>
								{isPublic ? <Globe size={13} /> : <Wifi size={13} />}
								<span
									style={{
										fontWeight: 500,
										fontSize: 12,
										color: "var(--cb-text)",
									}}
								>
									{isPublic ? "Anyone with the link" : "Just this office"}
								</span>
							</div>

							<div style={{ fontSize: 12, color: "var(--cb-text-muted)" }}>
								—
							</div>

							<div
								style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}
							>
								{app.url && (
									<a
										href={app.url}
										target="_blank"
										rel="noreferrer"
										title="Open"
										onClick={(e) => e.stopPropagation()}
										className="cb-btn"
										style={{
											width: 28,
											height: 28,
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											borderRadius: 6,
											color: "var(--cb-text-muted)",
										}}
									>
										<ExternalLink size={14} />
									</a>
								)}
								<button
									type="button"
									title="Restart"
									onClick={(e) => {
										e.stopPropagation();
										void restart(app);
									}}
									className="cb-btn"
									style={{
										width: 28,
										height: 28,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										borderRadius: 6,
										color: "var(--cb-text-muted)",
									}}
								>
									<RotateCw size={14} />
								</button>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
};
