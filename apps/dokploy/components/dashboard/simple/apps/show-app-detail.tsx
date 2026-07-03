"use client";
import {
	AlertOctagon,
	ArrowLeft,
	ArrowUpRight,
	ChevronDown,
	ChevronRight,
	ExternalLink,
	FileText,
	Globe,
	KeyRound,
	LayoutGrid,
	Link2,
	Plus,
	RotateCw,
	Trash2,
	Wifi,
	X,
} from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/utils/api";
import { useShellMode } from "../../../layouts/shell-mode";
import { statusMeta } from "../shared";

const ADV_ITEMS = [
	{ icon: FileText, label: "Logs", sub: "See what the app is doing" },
	{
		icon: KeyRound,
		label: "Environment variables",
		sub: "Settings the app reads at startup",
	},
	{
		icon: LayoutGrid,
		label: "Volumes & raw compose",
		sub: "Storage and the underlying definition",
	},
];

export const ShowAppDetail = ({ appId }: { appId: string }) => {
	const router = useRouter();
	const { setMode } = useShellMode();
	const utils = api.useUtils();
	const { data: apps } = api.computebay.listApps.useQuery();
	const { data: config } = api.computebay.getConfig.useQuery();
	const reloadApp = api.application.reload.useMutation();
	const redeployCompose = api.compose.redeploy.useMutation();
	const deleteApp = api.application.delete.useMutation();
	const deleteCompose = api.compose.delete.useMutation();
	const setExposure = api.computebay.setExposure.useMutation();
	const addCustomDomain = api.computebay.addCustomDomain.useMutation();
	const removeCustomDomain = api.computebay.removeCustomDomain.useMutation();

	const [advOpen, setAdvOpen] = useState(false);
	const [exposureConfirm, setExposureConfirm] = useState(false);
	const [customHost, setCustomHost] = useState("");

	const app = apps?.find((a) => a.id === appId);

	const { data: customDomains } = api.computebay.customDomains.useQuery(
		{ id: appId, kind: app?.kind ?? "application" },
		{ enabled: !!app },
	);

	if (!app) {
		return (
			<div className="cb-fade" style={{ maxWidth: 880, margin: "0 auto" }}>
				<button
					type="button"
					className="cb-btn"
					onClick={() => router.push("/dashboard/simple/apps")}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						color: "var(--cb-text-muted)",
						background: "transparent",
						marginBottom: 16,
					}}
				>
					<ArrowLeft size={13} /> All apps
				</button>
				<div style={{ fontSize: 13, color: "var(--cb-text-muted)" }}>
					App not found.
				</div>
			</div>
		);
	}

	const advancedServiceHref = `/dashboard/project/${app.projectId}/environment/${app.environmentId}/services/${app.kind}/${app.id}`;
	const s = statusMeta(app.status);
	const isPublic = app.exposureMode === "public";
	const isError = app.status === "error";

	const restart = async () => {
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

	const uninstall = async () => {
		if (
			!window.confirm(
				`Uninstall ${app.name}? It will stop running. Backups are kept.`,
			)
		)
			return;
		try {
			if (app.kind === "application") {
				await deleteApp.mutateAsync({ applicationId: app.id });
			} else {
				await deleteCompose.mutateAsync({
					composeId: app.id,
					deleteVolumes: false,
				});
			}
			toast.success(`${app.name} uninstalled`);
			await utils.computebay.listApps.invalidate();
			router.push("/dashboard/simple/apps");
		} catch {
			toast.error(`Couldn't uninstall ${app.name}`);
		}
	};

	// Exposure change (spec §5.5): flip the app between "office only" and "anyone
	// with the link" in one click. Apps with no routable address yet fall back to
	// the Advanced domain settings, where an address can be added.
	const openAdvancedDomains = () => {
		setExposureConfirm(false);
		setMode("advanced");
		router.push(advancedServiceHref);
	};
	const applyExposure = async (next: "lan" | "public") => {
		setExposureConfirm(false);
		try {
			await setExposure.mutateAsync({ id: app.id, kind: app.kind, mode: next });
			toast.success(
				next === "public"
					? `${app.name} is now available on the internet`
					: `${app.name} is now office-only`,
			);
			await utils.computebay.listApps.invalidate();
		} catch {
			toast.error("Couldn't change who can use this app");
		}
	};
	const chooseExposure = (next: "lan" | "public") => {
		if (next === app.exposureMode || setExposure.isPending) return;
		if (!app.canToggleExposure) {
			// No address to move — send them to Advanced to add one.
			openAdvancedDomains();
			return;
		}
		if (next === "public") {
			setExposureConfirm(true);
		} else {
			void applyExposure("lan");
		}
	};

	const exposureBtn = (value: "lan" | "public") => {
		const active = app.exposureMode === value;
		return (
			<button
				type="button"
				className="cb-btn"
				onClick={() => chooseExposure(value)}
				style={{
					padding: "6px 12px",
					borderRadius: 9999,
					fontWeight: 500,
					fontSize: 12,
					color: active ? "#fff" : "var(--cb-text-muted)",
					background: active ? "var(--cb-brand)" : "transparent",
					display: "flex",
					alignItems: "center",
					gap: 5,
				}}
			>
				{value === "public" ? <Globe size={12} /> : <Wifi size={12} />}
				{value === "public" ? "Anyone with the link" : "Just this office"}
			</button>
		);
	};

	// Custom domains (spec §5.5 advanced action).
	const isSelfHost = config?.tier === "self-host";
	const submitCustomDomain = async () => {
		const host = customHost.trim();
		if (!host || addCustomDomain.isPending) return;
		try {
			await addCustomDomain.mutateAsync({ id: app.id, kind: app.kind, host });
			setCustomHost("");
			toast.success(`${host} is now pointing at ${app.name}`);
			await utils.computebay.customDomains.invalidate();
			await utils.computebay.listApps.invalidate();
		} catch (e) {
			toast.error(
				e instanceof Error ? e.message : "Couldn't add that domain",
			);
		}
	};
	const deleteCustomDomain = async (domainId: string, host: string) => {
		if (!window.confirm(`Remove ${host}? It will stop pointing at this app.`))
			return;
		try {
			await removeCustomDomain.mutateAsync({ domainId });
			toast.success(`${host} removed`);
			await utils.computebay.customDomains.invalidate();
			await utils.computebay.listApps.invalidate();
		} catch {
			toast.error("Couldn't remove that domain");
		}
	};

	return (
		<div className="cb-fade" style={{ maxWidth: 880, margin: "0 auto" }}>
			<button
				type="button"
				className="cb-btn cb-eyebrow"
				onClick={() => router.push("/dashboard/simple/apps")}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 6,
					marginBottom: 16,
					background: "transparent",
				}}
			>
				<ArrowLeft size={13} /> All apps
			</button>

			{/* Header */}
			<div
				style={{
					display: "flex",
					alignItems: "flex-start",
					gap: 16,
					marginBottom: 24,
				}}
			>
				<div
					style={{
						width: 56,
						height: 56,
						borderRadius: 10,
						background: "var(--cb-surface-2)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						flexShrink: 0,
						color: "var(--cb-brand)",
					}}
				>
					<LayoutGrid size={28} strokeWidth={1.5} />
				</div>
				<div style={{ flex: 1, minWidth: 0 }}>
					<h1
						style={{
							font: "600 24px/1.2 'Inter'",
							color: "var(--cb-text)",
							margin: 0,
							letterSpacing: "-0.01em",
						}}
					>
						{app.name}
					</h1>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 12,
							marginTop: 8,
						}}
					>
						<span
							style={{
								display: "inline-flex",
								alignItems: "center",
								gap: 6,
								fontWeight: 500,
								fontSize: 12,
								color: "var(--cb-text)",
							}}
						>
							<span
								className={s.pulse ? "cb-pulse" : undefined}
								style={{
									width: 7,
									height: 7,
									borderRadius: "50%",
									background: s.color,
								}}
							/>
							{s.label}
						</span>
						{app.url && (
							<a
								className="cb-mono"
								href={app.url}
								target="_blank"
								rel="noreferrer"
								style={{
									fontWeight: 500,
									fontSize: 12,
									color: "var(--cb-brand)",
								}}
							>
								{app.url}
							</a>
						)}
					</div>
				</div>
				<div style={{ display: "flex", gap: 8 }}>
					<button
						type="button"
						className="cb-btn"
						onClick={restart}
						style={{
							padding: "9px 14px",
							border: "1px solid var(--cb-border)",
							borderRadius: 6,
							fontWeight: 500,
							fontSize: 13,
							color: "var(--cb-text)",
							display: "flex",
							alignItems: "center",
							gap: 6,
						}}
					>
						<RotateCw size={13} /> Restart
					</button>
					{app.url && (
						<a
							className="cb-btn cb-btn-primary"
							href={app.url}
							target="_blank"
							rel="noreferrer"
							style={{
								padding: "9px 14px",
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
							<ExternalLink size={13} /> Open app
						</a>
					)}
				</div>
			</div>

			{/* Error banner */}
			{isError && (
				<div
					style={{
						marginBottom: 20,
						padding: "14px 18px",
						border:
							"1px solid color-mix(in srgb, var(--cb-error) 40%, transparent)",
						background: "color-mix(in srgb, var(--cb-error) 8%, transparent)",
						borderRadius: 8,
						display: "flex",
						alignItems: "flex-start",
						gap: 12,
					}}
				>
					<AlertOctagon
						size={18}
						style={{ color: "var(--cb-error)", flexShrink: 0, marginTop: 1 }}
					/>
					<div style={{ flex: 1 }}>
						<div
							style={{ fontWeight: 600, fontSize: 13, color: "var(--cb-text)" }}
						>
							This app isn't running
						</div>
						<div
							style={{
								fontSize: 12,
								lineHeight: 1.5,
								color: "var(--cb-text-muted)",
								marginTop: 4,
							}}
						>
							Try restarting it. If it keeps failing, open the logs in the
							Advanced view.
						</div>
					</div>
				</div>
			)}

			{/* Exposure card */}
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
						padding: "18px 20px",
						display: "flex",
						alignItems: "center",
						gap: 16,
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
						}}
					>
						{isPublic ? (
							<Globe size={18} style={{ color: "var(--cb-brand)" }} />
						) : (
							<Wifi size={18} style={{ color: "var(--cb-brand)" }} />
						)}
					</div>
					<div style={{ flex: 1 }}>
						<div
							style={{ fontWeight: 600, fontSize: 13, color: "var(--cb-text)" }}
						>
							Who can use this app
						</div>
						<div
							style={{
								fontSize: 12,
								color: "var(--cb-text-muted)",
								marginTop: 2,
							}}
						>
							{isPublic
								? "Anyone with the link can reach it over the internet."
								: "Only people on this office Wi-Fi can reach it."}
						</div>
					</div>
					<div
						style={{
							display: "flex",
							background: "var(--cb-surface)",
							border: "1px solid var(--cb-border)",
							borderRadius: 9999,
							padding: 3,
							gap: 2,
						}}
					>
						{exposureBtn("lan")}
						{exposureBtn("public")}
					</div>
				</div>
			</section>

			{/* Custom domain (spec §5.5). Only meaningful once the app is public. */}
			{isPublic && (
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
							padding: "16px 20px",
							display: "flex",
							alignItems: "center",
							gap: 12,
							borderBottom: "1px solid var(--cb-border-subtle)",
						}}
					>
						<Link2 size={16} style={{ color: "var(--cb-text-muted)" }} />
						<div style={{ flex: 1 }}>
							<div
								style={{
									fontWeight: 600,
									fontSize: 13,
									color: "var(--cb-text)",
								}}
							>
								Use your own domain
							</div>
							<div
								style={{
									fontSize: 12,
									color: "var(--cb-text-muted)",
									marginTop: 2,
								}}
							>
								Point a domain you own — like shop.yourbusiness.com — at this
								app.
							</div>
						</div>
					</div>

					{/* Existing custom domains */}
					{customDomains?.map((d) => (
						<div
							key={d.domainId}
							style={{
								padding: "12px 20px",
								display: "flex",
								alignItems: "center",
								gap: 12,
								borderBottom: "1px solid var(--cb-border-subtle)",
							}}
						>
							<a
								className="cb-mono"
								href={`https://${d.host}`}
								target="_blank"
								rel="noreferrer"
								style={{
									flex: 1,
									fontSize: 13,
									color: "var(--cb-brand)",
									minWidth: 0,
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								{d.host}
							</a>
							<button
								type="button"
								className="cb-btn"
								onClick={() => deleteCustomDomain(d.domainId, d.host)}
								title="Remove"
								style={{
									display: "flex",
									alignItems: "center",
									gap: 5,
									fontSize: 12,
									color: "var(--cb-text-muted)",
									background: "transparent",
								}}
							>
								<X size={13} /> Remove
							</button>
						</div>
					))}

					{/* Add form */}
					<div style={{ padding: "14px 20px" }}>
						<div style={{ display: "flex", gap: 8 }}>
							<input
								value={customHost}
								onChange={(e) => setCustomHost(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") void submitCustomDomain();
								}}
								placeholder="shop.yourbusiness.com"
								className="cb-mono"
								style={{
									flex: 1,
									padding: "9px 12px",
									border: "1px solid var(--cb-border)",
									borderRadius: 6,
									background: "var(--cb-bg)",
									fontSize: 13,
									color: "var(--cb-text)",
								}}
							/>
							<button
								type="button"
								className="cb-btn cb-btn-primary"
								onClick={() => void submitCustomDomain()}
								disabled={addCustomDomain.isPending || !customHost.trim()}
								style={{
									padding: "9px 14px",
									background: "var(--cb-brand)",
									color: "#fff",
									borderRadius: 6,
									fontWeight: 500,
									fontSize: 13,
									display: "flex",
									alignItems: "center",
									gap: 6,
									opacity:
										addCustomDomain.isPending || !customHost.trim() ? 0.6 : 1,
								}}
							>
								<Plus size={14} />
								{addCustomDomain.isPending ? "Adding…" : "Add"}
							</button>
						</div>
						{/* Self-host owners manage their own DNS; managed is automatic. */}
						{isSelfHost ? (
							<div
								style={{
									fontSize: 12,
									lineHeight: 1.6,
									color: "var(--cb-text-muted)",
									marginTop: 10,
								}}
							>
								After adding it here, create a{" "}
								<span style={{ fontWeight: 600 }}>CNAME</span> record at your
								domain provider pointing to{" "}
								<span className="cb-mono" style={{ color: "var(--cb-text)" }}>
									{config?.wildcardDomain ?? "your appliance address"}
								</span>
								. It can take a few minutes to start working.
							</div>
						) : (
							<div
								style={{
									fontSize: 12,
									lineHeight: 1.6,
									color: "var(--cb-text-muted)",
									marginTop: 10,
								}}
							>
								We'll publish it for you automatically. It can take a few
								minutes to start working.
							</div>
						)}
					</div>
				</section>
			)}

			{/* Stats */}
			<section
				style={{
					border: "1px solid var(--cb-border)",
					borderRadius: 8,
					background: "var(--cb-elevated)",
					marginBottom: 16,
					display: "grid",
					gridTemplateColumns: "repeat(3, 1fr)",
				}}
			>
				{[
					{ label: "Status", value: s.label },
					{ label: "Exposure", value: isPublic ? "Public" : "Office only" },
					{
						label: "Installed",
						value: app.createdAt
							? new Date(app.createdAt).toLocaleDateString("en-PH")
							: "—",
					},
				].map((cell, i) => (
					<div
						key={cell.label}
						style={{
							padding: "16px 20px",
							borderRight:
								i < 2 ? "1px solid var(--cb-border-subtle)" : undefined,
						}}
					>
						<div className="cb-eyebrow" style={{ marginBottom: 6 }}>
							{cell.label}
						</div>
						<div
							style={{ fontWeight: 600, fontSize: 14, color: "var(--cb-text)" }}
						>
							{cell.value}
						</div>
					</div>
				))}
			</section>

			{/* Advanced fold */}
			<section
				style={{
					border: "1px solid var(--cb-border)",
					borderRadius: 8,
					background: "var(--cb-elevated)",
					overflow: "hidden",
				}}
			>
				<button
					type="button"
					className="cb-row"
					onClick={() => setAdvOpen((v) => !v)}
					style={{
						width: "100%",
						padding: "16px 20px",
						display: "flex",
						alignItems: "center",
						gap: 12,
						background: "transparent",
					}}
				>
					{advOpen ? (
						<ChevronDown size={16} style={{ color: "var(--cb-text-muted)" }} />
					) : (
						<ChevronRight size={16} style={{ color: "var(--cb-text-muted)" }} />
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
							Logs, environment, volumes, raw compose — opens in the Dokploy
							view
						</div>
					</div>
				</button>
				{advOpen && (
					<div
						style={{
							borderTop: "1px solid var(--cb-border-subtle)",
							padding: "8px 0",
						}}
					>
						{ADV_ITEMS.map((it) => {
							const Icon = it.icon;
							return (
								<button
									key={it.label}
									type="button"
									className="cb-row"
									onClick={() => {
										setMode("advanced");
										router.push(advancedServiceHref);
									}}
									style={{
										width: "100%",
										display: "flex",
										alignItems: "center",
										gap: 14,
										padding: "12px 20px",
										borderBottom: "1px solid var(--cb-border-subtle)",
										background: "transparent",
									}}
								>
									<Icon size={15} style={{ color: "var(--cb-text-muted)" }} />
									<div style={{ flex: 1, textAlign: "left" }}>
										<div
											style={{
												fontWeight: 500,
												fontSize: 13,
												color: "var(--cb-text)",
											}}
										>
											{it.label}
										</div>
										<div
											style={{
												fontSize: 12,
												color: "var(--cb-text-muted)",
												marginTop: 1,
											}}
										>
											{it.sub}
										</div>
									</div>
									<span
										className="cb-mono"
										style={{
											display: "inline-flex",
											alignItems: "center",
											gap: 5,
											fontSize: 10,
											color: "var(--cb-text-muted)",
											letterSpacing: ".06em",
											textTransform: "uppercase",
										}}
									>
										Dokploy <ArrowUpRight size={12} />
									</span>
								</button>
							);
						})}
					</div>
				)}
			</section>

			{/* Danger zone */}
			<section
				style={{
					marginTop: 24,
					display: "flex",
					alignItems: "center",
					gap: 12,
					padding: "14px 20px",
					border: "1px solid var(--cb-border)",
					borderRadius: 8,
				}}
			>
				<Trash2 size={16} style={{ color: "var(--cb-error)" }} />
				<div style={{ flex: 1 }}>
					<div
						style={{ fontWeight: 500, fontSize: 13, color: "var(--cb-text)" }}
					>
						Uninstall this app
					</div>
					<div
						style={{
							fontSize: 12,
							color: "var(--cb-text-muted)",
							marginTop: 2,
						}}
					>
						Removes the app and stops it from running. Backups are kept.
					</div>
				</div>
				<button
					type="button"
					className="cb-btn cb-btn-danger"
					onClick={uninstall}
					style={{
						padding: "8px 14px",
						border: "1px solid var(--cb-border)",
						borderRadius: 6,
						fontWeight: 500,
						fontSize: 12,
						color: "var(--cb-text)",
					}}
				>
					Uninstall
				</button>
			</section>

			{/* Exposure confirm modal (LAN -> public, spec §5.4) */}
			{exposureConfirm && (
				<div
					className="cb-shell cb-overlay-in"
					onClick={() => setExposureConfirm(false)}
					style={{
						position: "fixed",
						inset: 0,
						background: "rgba(15,20,25,.55)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						zIndex: 100,
						padding: 24,
					}}
				>
					<div
						onClick={(e) => e.stopPropagation()}
						style={{
							background: "var(--cb-bg)",
							borderRadius: 12,
							width: 460,
							maxWidth: "100%",
							boxShadow: "0 24px 64px rgba(0,0,0,.3)",
							border: "1px solid var(--cb-border)",
							overflow: "hidden",
						}}
					>
						<div style={{ padding: 24, display: "flex", gap: 14 }}>
							<div
								style={{
									width: 40,
									height: 40,
									borderRadius: 9999,
									background:
										"color-mix(in srgb, var(--cb-warning) 15%, transparent)",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									flexShrink: 0,
								}}
							>
								<Globe size={20} style={{ color: "var(--cb-warning)" }} />
							</div>
							<div style={{ flex: 1 }}>
								<div
									style={{
										fontWeight: 600,
										fontSize: 15,
										color: "var(--cb-text)",
									}}
								>
									Make this app available on the internet?
								</div>
								<div
									style={{
										fontSize: 13,
										lineHeight: 1.5,
										color: "var(--cb-text-muted)",
										marginTop: 8,
									}}
								>
									Anyone with the link will be able to reach it. Make sure the
									app has a strong password and that you mean to expose it.
								</div>
							</div>
						</div>
						<div
							style={{
								padding: "14px 24px",
								background: "var(--cb-surface)",
								borderTop: "1px solid var(--cb-border-subtle)",
								display: "flex",
								justifyContent: "flex-end",
								gap: 10,
							}}
						>
							<button
								type="button"
								className="cb-btn"
								onClick={() => setExposureConfirm(false)}
								style={{
									padding: "8px 14px",
									border: "1px solid var(--cb-border)",
									borderRadius: 6,
									fontWeight: 500,
									fontSize: 13,
									color: "var(--cb-text)",
								}}
							>
								Cancel
							</button>
							<button
								type="button"
								className="cb-btn cb-btn-primary"
								onClick={() => void applyExposure("public")}
								disabled={setExposure.isPending}
								style={{
									padding: "8px 16px",
									background: "var(--cb-brand)",
									color: "#fff",
									borderRadius: 6,
									fontWeight: 500,
									fontSize: 13,
									opacity: setExposure.isPending ? 0.6 : 1,
								}}
							>
								{setExposure.isPending ? "Working…" : "Yes, make it public"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
