"use client";
import { CheckCircle2, Info } from "lucide-react";
import { useState } from "react";
import {
	CURATED_APPS,
	type CuratedApp,
	PARTNER_APPS,
} from "@/templates/curated-catalog";
import { api } from "@/utils/api";
import { useShellMode } from "../../../layouts/shell-mode";
import { CbIcon } from "../cb-icon";
import { InstallModal } from "./install-modal";

type Tab = "curated" | "partner" | "marketplace";

export const ShowCatalog = () => {
	const [tab, setTab] = useState<Tab>("curated");
	const [installTarget, setInstallTarget] = useState<CuratedApp | null>(null);
	const { setMode } = useShellMode();
	const { data: apps } = api.computebay.listApps.useQuery();

	const installedNames = new Set((apps ?? []).map((a) => a.name.toLowerCase()));
	const isInstalled = (name: string) => installedNames.has(name.toLowerCase());

	const tabButton = (value: Tab, label: string, badge?: React.ReactNode) => {
		const active = tab === value;
		return (
			<button
				type="button"
				className="cb-tab"
				onClick={() => setTab(value)}
				style={{
					padding: "10px 0",
					borderBottom: `2px solid ${active ? "var(--cb-brand)" : "transparent"}`,
					color: active ? "var(--cb-text)" : "var(--cb-text-muted)",
					fontWeight: 500,
					fontSize: 13,
					display: "flex",
					alignItems: "center",
					gap: 8,
					background: "transparent",
				}}
			>
				{label}
				{badge}
			</button>
		);
	};

	return (
		<div className="cb-fade" style={{ maxWidth: 1080, margin: "0 auto" }}>
			<div style={{ marginBottom: 8 }}>
				<h1
					style={{
						font: "600 24px/1.2 'Inter'",
						color: "var(--cb-text)",
						margin: 0,
						letterSpacing: "-0.01em",
					}}
				>
					Catalog
				</h1>
				<div
					style={{ fontSize: 13, color: "var(--cb-text-muted)", marginTop: 4 }}
				>
					Install software for your business. The curated list is checked by
					Avante.
				</div>
			</div>

			<div
				style={{
					display: "flex",
					gap: 24,
					borderBottom: "1px solid var(--cb-border)",
					marginTop: 20,
					marginBottom: 24,
				}}
			>
				{tabButton("curated", "Curated by Avante")}
				{tabButton(
					"partner",
					"Partner-endorsed",
					<span
						className="cb-mono"
						style={{
							fontSize: 10,
							background: "var(--cb-brand-muted)",
							color: "var(--cb-brand)",
							padding: "1px 6px",
							borderRadius: 9999,
						}}
					>
						PH
					</span>,
				)}
				{tabButton(
					"marketplace",
					"Template marketplace",
					<span
						className="cb-mono"
						style={{
							fontSize: 10,
							color: "var(--cb-text-muted)",
							marginLeft: 8,
						}}
					>
						ADVANCED
					</span>,
				)}
			</div>

			{/* Curated */}
			{tab === "curated" && (
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(3, 1fr)",
						gap: 16,
					}}
				>
					{CURATED_APPS.map((c) => {
						const installed = isInstalled(c.name);
						return (
							<div
								key={c.id}
								className="cb-card-hover"
								style={{
									border: "1px solid var(--cb-border)",
									borderRadius: 8,
									background: "var(--cb-elevated)",
									padding: 18,
									display: "flex",
									flexDirection: "column",
									minHeight: 200,
								}}
							>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: 12,
										marginBottom: 12,
									}}
								>
									<div
										style={{
											width: 36,
											height: 36,
											borderRadius: 8,
											background: c.iconBg,
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											color: c.iconColor,
										}}
									>
										<CbIcon name={c.icon} size={18} />
									</div>
									<div
										style={{
											fontWeight: 600,
											fontSize: 14,
											color: "var(--cb-text)",
										}}
									>
										{c.name}
									</div>
								</div>
								<div
									style={{
										fontSize: 13,
										lineHeight: 1.5,
										color: "var(--cb-text-muted)",
										flex: 1,
									}}
								>
									{c.desc}
								</div>
								<div
									className="cb-mono"
									style={{
										fontSize: 11,
										color: "var(--cb-text-muted)",
										marginTop: 14,
										paddingTop: 12,
										borderTop: "1px solid var(--cb-border-subtle)",
									}}
								>
									{c.resource}
								</div>
								<div style={{ marginTop: 12 }}>
									{installed ? (
										<div
											style={{
												display: "flex",
												alignItems: "center",
												gap: 6,
												fontWeight: 500,
												fontSize: 12,
												color: "var(--cb-success)",
											}}
										>
											<CheckCircle2 size={14} />
											Installed
										</div>
									) : (
										<button
											type="button"
											className="cb-btn cb-btn-primary"
											onClick={() => setInstallTarget(c)}
											style={{
												width: "100%",
												padding: "8px 14px",
												background: "var(--cb-brand)",
												color: "#fff",
												borderRadius: 6,
												fontWeight: 500,
												fontSize: 13,
											}}
										>
											Install
										</button>
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}

			{/* Partner */}
			{tab === "partner" && (
				<div>
					{PARTNER_APPS.length === 0 ? (
						<div
							style={{
								padding: "40px 20px",
								textAlign: "center",
								color: "var(--cb-text-muted)",
								fontSize: 13,
								border: "1px solid var(--cb-border)",
								borderRadius: 8,
								background: "var(--cb-elevated)",
							}}
						>
							Partner-endorsed apps are coming soon — independent products from
							Philippine developers Avante has reviewed.
						</div>
					) : (
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(2, 1fr)",
								gap: 16,
							}}
						>
							{PARTNER_APPS.map((p) => (
								<div
									key={p.id}
									className="cb-card-hover"
									style={{
										border: "1px solid var(--cb-border)",
										borderRadius: 8,
										background: "var(--cb-elevated)",
										padding: 20,
									}}
								>
									<div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
									<div style={{ fontSize: 12, color: "var(--cb-text-muted)" }}>
										by {p.vendor}
									</div>
									<div
										style={{
											fontSize: 13,
											color: "var(--cb-text-muted)",
											marginTop: 8,
										}}
									>
										{p.desc}
									</div>
									<button
										type="button"
										className="cb-btn cb-btn-primary"
										onClick={() => setInstallTarget(p)}
										style={{
											marginTop: 12,
											padding: "7px 14px",
											background: "var(--cb-brand)",
											color: "#fff",
											borderRadius: 6,
											fontWeight: 500,
											fontSize: 12,
										}}
									>
										Install
									</button>
								</div>
							))}
						</div>
					)}
					<div
						style={{
							marginTop: 16,
							fontSize: 12,
							color: "var(--cb-text-muted)",
						}}
					>
						Partner-endorsed apps are independent products from Philippine
						developers Avante has reviewed. They are not Avante software.
					</div>
				</div>
			)}

			{/* Marketplace → routes into the Advanced (Dokploy) template flow */}
			{tab === "marketplace" && (
				<div>
					<div
						style={{
							marginBottom: 16,
							padding: "12px 16px",
							border: "1px solid var(--cb-border)",
							borderRadius: 8,
							background: "var(--cb-surface)",
							display: "flex",
							gap: 12,
							alignItems: "flex-start",
						}}
					>
						<Info
							size={16}
							style={{ color: "var(--cb-info)", flexShrink: 0, marginTop: 1 }}
						/>
						<div
							style={{
								fontSize: 12,
								lineHeight: 1.5,
								color: "var(--cb-text-muted)",
							}}
						>
							Template marketplace apps come from the Dokploy ecosystem. They
							expose full configuration — ports, environment variables, volumes.{" "}
							<strong style={{ color: "var(--cb-text)", fontWeight: 600 }}>
								For technical users.
							</strong>
						</div>
					</div>
					<button
						type="button"
						className="cb-btn cb-btn-primary"
						onClick={() => setMode("advanced")}
						style={{
							padding: "9px 16px",
							background: "var(--cb-brand)",
							color: "#fff",
							borderRadius: 6,
							fontWeight: 500,
							fontSize: 13,
						}}
					>
						Open the template marketplace
					</button>
				</div>
			)}

			{installTarget && (
				<InstallModal
					app={installTarget}
					onClose={() => setInstallTarget(null)}
				/>
			)}
		</div>
	);
};
