"use client";
import {
	ChevronDown,
	ChevronRight,
	LayoutDashboard,
	LifeBuoy,
	Terminal,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/utils/api";
import { rememberShellMode, useShellMode } from "../../../layouts/shell-mode";
import { SoftwareUpdate } from "./software-update";

const Card = ({
	title,
	badge,
	children,
}: {
	title: string;
	badge?: React.ReactNode;
	children: React.ReactNode;
}) => (
	<section
		style={{
			border: "1px solid var(--cb-border)",
			borderRadius: 8,
			background: "var(--cb-elevated)",
			marginBottom: 16,
		}}
	>
		<div
			style={{
				padding: "14px 20px",
				borderBottom: "1px solid var(--cb-border-subtle)",
				display: "flex",
				alignItems: "center",
				gap: 10,
			}}
		>
			<div
				style={{
					fontWeight: 600,
					fontSize: 13,
					flex: 1,
					color: "var(--cb-text)",
				}}
			>
				{title}
			</div>
			{badge}
		</div>
		{children}
	</section>
);

const Toggle = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
	<button
		type="button"
		className="cb-btn"
		onClick={onClick}
		aria-pressed={on}
		style={{ background: "transparent" }}
	>
		<span className="cb-toggle-track" data-on={on}>
			<span className="cb-toggle-knob" />
		</span>
	</button>
);

export const ShowSimpleSettings = () => {
	const { setMode } = useShellMode();
	const utils = api.useUtils();
	const { data: config } = api.computebay.getConfig.useQuery();
	const { data: user } = api.user.get.useQuery();
	const updateInterface = api.computebay.updateInterface.useMutation();
	const updateSupport = api.computebay.updateSupportAccess.useMutation();
	const [advOpen, setAdvOpen] = useState(false);

	const isManaged = config?.tier === "managed";

	const saveInterface = async (
		next: Partial<{
			defaultView: "simple" | "advanced";
			showAdvancedToggle: boolean;
		}>,
	) => {
		if (!config) return;
		try {
			await updateInterface.mutateAsync({
				defaultView: next.defaultView ?? config.defaultView,
				showAdvancedToggle:
					next.showAdvancedToggle ?? config.showAdvancedToggle,
			});
			if (next.defaultView) rememberShellMode(next.defaultView);
			await utils.computebay.getConfig.invalidate();
			toast.success("Saved");
		} catch {
			toast.error("Couldn't save");
		}
	};

	const saveSupport = async (
		next: Partial<{ supportAccessPaused: boolean; supportEmailOptIn: boolean }>,
	) => {
		try {
			await updateSupport.mutateAsync(next);
			await utils.computebay.getConfig.invalidate();
			toast.success("Saved");
		} catch {
			toast.error("Couldn't save");
		}
	};

	const viewRadio = (
		value: "simple" | "advanced",
		icon: React.ReactNode,
		title: string,
		sub: string,
		recommended?: boolean,
	) => {
		const active = config?.defaultView === value;
		return (
			<button
				type="button"
				className="cb-radio"
				onClick={() => saveInterface({ defaultView: value })}
				style={{
					flex: 1,
					display: "flex",
					gap: 12,
					padding: 14,
					border: `1px solid ${active ? "var(--cb-brand)" : "var(--cb-border)"}`,
					borderRadius: 8,
					background: active ? "var(--cb-brand-muted)" : "var(--cb-bg)",
					textAlign: "left",
				}}
			>
				<div
					style={{
						width: 16,
						height: 16,
						borderRadius: "50%",
						border: `2px solid ${active ? "var(--cb-brand)" : "var(--cb-border-strong)"}`,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						flexShrink: 0,
						marginTop: 2,
					}}
				>
					{active && (
						<div
							style={{
								width: 7,
								height: 7,
								borderRadius: "50%",
								background: "var(--cb-brand)",
							}}
						/>
					)}
				</div>
				<div style={{ flex: 1, minWidth: 0 }}>
					<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
						{icon}
						<span
							style={{ fontWeight: 500, fontSize: 13, color: "var(--cb-text)" }}
						>
							{title}
						</span>
						{recommended && (
							<span
								className="cb-mono"
								style={{
									fontSize: 9,
									color: "var(--cb-success)",
									background:
										"color-mix(in srgb, var(--cb-success) 12%, transparent)",
									padding: "2px 6px",
									borderRadius: 9999,
									letterSpacing: ".06em",
								}}
							>
								RECOMMENDED
							</span>
						)}
					</div>
					<div
						style={{
							fontSize: 12,
							lineHeight: 1.5,
							color: "var(--cb-text-muted)",
							marginTop: 4,
						}}
					>
						{sub}
					</div>
				</div>
			</button>
		);
	};

	const row = (
		label: string,
		value: React.ReactNode,
		action?: React.ReactNode,
	) => (
		<div
			style={{
				padding: "16px 20px",
				display: "grid",
				gridTemplateColumns: "160px 1fr 90px",
				gap: 16,
				alignItems: "center",
				borderBottom: "1px solid var(--cb-border-subtle)",
			}}
		>
			<div
				style={{ fontWeight: 500, fontSize: 13, color: "var(--cb-text-muted)" }}
			>
				{label}
			</div>
			<div style={{ fontSize: 13, color: "var(--cb-text)" }}>{value}</div>
			<div style={{ textAlign: "right" }}>{action}</div>
		</div>
	);

	return (
		<div className="cb-fade" style={{ maxWidth: 880, margin: "0 auto" }}>
			<div style={{ marginBottom: 24 }}>
				<h1
					style={{
						font: "600 24px/1.2 'Inter'",
						color: "var(--cb-text)",
						margin: 0,
						letterSpacing: "-0.01em",
					}}
				>
					Settings
				</h1>
				<div
					style={{ fontSize: 13, color: "var(--cb-text-muted)", marginTop: 4 }}
				>
					Account, network, updates, support access, and advanced.
				</div>
			</div>

			{/* Interface */}
			<Card
				title="Interface"
				badge={
					<span className="cb-eyebrow" style={{ letterSpacing: ".06em" }}>
						Per user
					</span>
				}
			>
				<div
					style={{
						padding: "16px 20px",
						borderBottom: "1px solid var(--cb-border-subtle)",
					}}
				>
					<div
						style={{
							fontWeight: 500,
							fontSize: 13,
							color: "var(--cb-text)",
							marginBottom: 4,
						}}
					>
						Default view
					</div>
					<div
						style={{
							fontSize: 12,
							color: "var(--cb-text-muted)",
							marginBottom: 14,
						}}
					>
						The view this account opens in. You can flip between them any time
						from the header.
					</div>
					<div style={{ display: "flex", gap: 10 }}>
						{viewRadio(
							"simple",
							<LayoutDashboard size={13} />,
							"Simple",
							"Curated for running a business. Apps, backups, one screen for each thing that matters.",
							true,
						)}
						{viewRadio(
							"advanced",
							<Terminal size={13} />,
							"Advanced (Dokploy)",
							"The full Dokploy control plane. Projects, services, raw compose, registries.",
						)}
					</div>
				</div>

				{isManaged && (
					<div
						style={{
							padding: "14px 20px",
							display: "flex",
							alignItems: "center",
							gap: 16,
						}}
					>
						<div style={{ flex: 1 }}>
							<div
								style={{
									fontWeight: 500,
									fontSize: 13,
									color: "var(--cb-text)",
								}}
							>
								Show the Advanced toggle in the header
							</div>
							<div
								style={{
									fontSize: 12,
									color: "var(--cb-text-muted)",
									marginTop: 2,
								}}
							>
								Off by default on Managed. Turn on for quick access to the
								Dokploy view from the top bar.
							</div>
						</div>
						<Toggle
							on={config?.showAdvancedToggle ?? false}
							onClick={() =>
								saveInterface({
									showAdvancedToggle: !config?.showAdvancedToggle,
								})
							}
						/>
					</div>
				)}
			</Card>

			{/* Account */}
			<Card title="Account">
				{row("Owner", <div>{user?.user?.email ?? "—"}</div>)}
				{row(
					"Password",
					<span style={{ color: "var(--cb-text-muted)" }}>
						Change in your profile
					</span>,
					<button
						type="button"
						className="cb-btn"
						onClick={() => setMode("advanced")}
						style={{
							fontWeight: 500,
							fontSize: 12,
							color: "var(--cb-brand)",
							background: "transparent",
						}}
					>
						Change
					</button>,
				)}
				<div
					style={{
						padding: "16px 20px",
						display: "grid",
						gridTemplateColumns: "160px 1fr 90px",
						gap: 16,
						alignItems: "center",
					}}
				>
					<div
						style={{
							fontWeight: 500,
							fontSize: 13,
							color: "var(--cb-text-muted)",
						}}
					>
						Two-factor auth
					</div>
					<div style={{ fontSize: 13, color: "var(--cb-text-muted)" }}>
						Coming in a later release.
					</div>
					<span className="cb-eyebrow" style={{ textAlign: "right" }}>
						Soon
					</span>
				</div>
			</Card>

			{/* Network */}
			<Card title="Network">
				<div
					style={{
						padding: "16px 20px",
						borderBottom: "1px solid var(--cb-border-subtle)",
					}}
				>
					<div
						style={{
							fontWeight: 500,
							fontSize: 13,
							color: "var(--cb-text-muted)",
							marginBottom: 6,
						}}
					>
						Your appliance address
					</div>
					<div
						className="cb-mono"
						style={{ fontWeight: 500, fontSize: 13, color: "var(--cb-text)" }}
					>
						{config?.wildcardDomain
							? `*.${config.wildcardDomain}`
							: "Not set up yet"}
					</div>
					<div
						style={{
							fontSize: 12,
							color: "var(--cb-text-muted)",
							marginTop: 4,
						}}
					>
						Every app gets a subdomain here automatically.
					</div>
				</div>
			</Card>

			{/* Software updates */}
			<Card title="Software updates">
				<SoftwareUpdate />
			</Card>

			{/* Support access (managed only) */}
			{isManaged && (
				<Card
					title="Avante support access"
					badge={
						<span
							className="cb-mono"
							style={{
								fontSize: 10,
								color: "var(--cb-brand)",
								background: "var(--cb-brand-muted)",
								padding: "2px 7px",
								borderRadius: 9999,
								letterSpacing: ".06em",
							}}
						>
							MANAGED TIER
						</span>
					}
				>
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
								background: config?.supportAccessPaused
									? "color-mix(in srgb, var(--cb-warning) 15%, transparent)"
									: "color-mix(in srgb, var(--cb-success) 15%, transparent)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							<LifeBuoy
								size={18}
								style={{
									color: config?.supportAccessPaused
										? "var(--cb-warning)"
										: "var(--cb-success)",
								}}
							/>
						</div>
						<div style={{ flex: 1 }}>
							<div
								style={{
									fontWeight: 500,
									fontSize: 13,
									color: "var(--cb-text)",
								}}
							>
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
									? "Avante can't connect to your appliance."
									: "Avante can connect to help when you ask."}
							</div>
						</div>
						<button
							type="button"
							className="cb-btn"
							onClick={() =>
								saveSupport({
									supportAccessPaused: !config?.supportAccessPaused,
								})
							}
							style={{
								padding: "8px 14px",
								border: "1px solid var(--cb-border)",
								borderRadius: 6,
								fontWeight: 500,
								fontSize: 12,
								color: "var(--cb-text)",
							}}
						>
							{config?.supportAccessPaused ? "Allow" : "Pause"}
						</button>
					</div>
					<div
						style={{
							padding: "14px 20px",
							display: "flex",
							alignItems: "center",
							gap: 16,
							borderBottom: "1px solid var(--cb-border-subtle)",
						}}
					>
						<div style={{ flex: 1 }}>
							<div
								style={{
									fontWeight: 500,
									fontSize: 13,
									color: "var(--cb-text)",
								}}
							>
								Email me when Avante connects
							</div>
							<div
								style={{
									fontSize: 12,
									color: "var(--cb-text-muted)",
									marginTop: 2,
								}}
							>
								Off by default. Some owners find it noisy.
							</div>
						</div>
						<Toggle
							on={config?.supportEmailOptIn ?? false}
							onClick={() =>
								saveSupport({ supportEmailOptIn: !config?.supportEmailOptIn })
							}
						/>
					</div>
					<div
						style={{
							padding: "16px 20px",
							fontSize: 13,
							color: "var(--cb-text-muted)",
						}}
					>
						Recent support sessions will appear here.{" "}
						{/* Phase 4: support_session table */}
						None yet.
					</div>
				</Card>
			)}

			{/* Subscription (managed only, read-only) */}
			{isManaged && (
				<Card title="Subscription">
					<div
						style={{
							padding: "18px 20px",
							display: "flex",
							alignItems: "center",
							gap: 16,
						}}
					>
						<div style={{ flex: 1 }}>
							<div
								style={{
									fontWeight: 600,
									fontSize: 15,
									color: "var(--cb-text)",
								}}
							>
								Negosyo Pro
							</div>
							<div
								style={{
									fontSize: 12,
									color: "var(--cb-text-muted)",
									marginTop: 2,
								}}
							>
								Contact Avante to change your plan or billing.
							</div>
						</div>
						<button
							type="button"
							className="cb-btn"
							style={{
								padding: "8px 14px",
								border: "1px solid var(--cb-border)",
								borderRadius: 6,
								fontWeight: 500,
								fontSize: 12,
								color: "var(--cb-text)",
							}}
						>
							Contact Avante
						</button>
					</div>
				</Card>
			)}

			{/* Advanced */}
			<section
				style={{
					border: "1px solid var(--cb-border)",
					borderRadius: 8,
					background: "var(--cb-elevated)",
				}}
			>
				<button
					type="button"
					className="cb-row"
					onClick={() => setAdvOpen((v) => !v)}
					style={{
						width: "100%",
						padding: "14px 20px",
						display: "flex",
						alignItems: "center",
						gap: 12,
						background: "transparent",
					}}
				>
					{advOpen ? (
						<ChevronDown size={15} style={{ color: "var(--cb-text-muted)" }} />
					) : (
						<ChevronRight size={15} style={{ color: "var(--cb-text-muted)" }} />
					)}
					<div style={{ flex: 1, textAlign: "left" }}>
						<div
							style={{ fontWeight: 600, fontSize: 13, color: "var(--cb-text)" }}
						>
							Advanced
						</div>
						<div
							style={{
								fontSize: 12,
								color: "var(--cb-text-muted)",
								marginTop: 2,
							}}
						>
							Raw Docker access, Projects mode, registries, image pinning
						</div>
					</div>
					<span
						className="cb-mono"
						style={{
							fontSize: 11,
							color: "var(--cb-warning)",
							background:
								"color-mix(in srgb, var(--cb-warning) 12%, transparent)",
							padding: "2px 7px",
							borderRadius: 9999,
						}}
					>
						I know what I'm doing
					</span>
				</button>
				{advOpen && (
					<div
						style={{
							borderTop: "1px solid var(--cb-border-subtle)",
							padding: "12px 20px",
						}}
					>
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
							Open the Dokploy control plane
						</button>
					</div>
				)}
			</section>
		</div>
	);
};
