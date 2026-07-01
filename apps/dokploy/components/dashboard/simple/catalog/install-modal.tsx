"use client";
import { Globe, Link as LinkIcon, Wifi, X } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";
import type { CuratedApp } from "@/templates/curated-catalog";
import { api } from "@/utils/api";
import { CbIcon } from "../cb-icon";

type Exposure = "lan" | "public";

const slugify = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");

export const InstallModal = ({
	app,
	onClose,
}: {
	app: CuratedApp;
	onClose: () => void;
}) => {
	const router = useRouter();
	const [exposure, setExposure] = useState<Exposure>("public");
	const { data: config } = api.computebay.getConfig.useQuery();
	const utils = api.useUtils();
	const ensureEnv = api.computebay.ensureDefaultEnvironment.useMutation();
	const deployTemplate = api.compose.deployTemplate.useMutation();
	const setExposureMut = api.computebay.setExposure.useMutation();

	const wildcard = config?.wildcardDomain ?? "your-appliance.computebay.app";
	const previewUrl =
		exposure === "public"
			? `${slugify(app.name)}.${wildcard}`
			: `${slugify(app.name)}.local (this Wi-Fi only)`;

	const installing =
		ensureEnv.isPending || deployTemplate.isPending || setExposureMut.isPending;

	const confirmInstall = async () => {
		try {
			const { environmentId } = await ensureEnv.mutateAsync();
			// The template comes up on its default (public) address. If the owner
			// chose "just this office", move it onto the LAN-only entrypoint (§5.5).
			const compose = await deployTemplate.mutateAsync({
				environmentId,
				id: app.templateId,
			});
			if (exposure === "lan") {
				await setExposureMut.mutateAsync({
					id: compose.composeId,
					kind: "compose",
					mode: "lan",
				});
			}
			toast.success(`${app.name} is installing`);
			await utils.computebay.listApps.invalidate();
			onClose();
			router.push("/dashboard/simple/apps");
		} catch (err) {
			toast.error(
				err instanceof Error && err.message
					? err.message
					: `Couldn't install ${app.name}`,
			);
		}
	};

	const choice = (value: Exposure) => {
		const active = exposure === value;
		const isPublic = value === "public";
		return (
			<button
				type="button"
				className="cb-radio"
				onClick={() => setExposure(value)}
				style={{
					display: "flex",
					gap: 14,
					padding: "14px 16px",
					border: `1px solid ${active ? "var(--cb-brand)" : "var(--cb-border)"}`,
					borderRadius: 8,
					background: active ? "var(--cb-brand-muted)" : "var(--cb-bg)",
					textAlign: "left",
				}}
			>
				<div
					style={{
						width: 18,
						height: 18,
						borderRadius: "50%",
						border: `2px solid ${active ? "var(--cb-brand)" : "var(--cb-border-strong)"}`,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						flexShrink: 0,
						marginTop: 1,
					}}
				>
					{active && (
						<div
							style={{
								width: 8,
								height: 8,
								borderRadius: "50%",
								background: "var(--cb-brand)",
							}}
						/>
					)}
				</div>
				<div style={{ flex: 1 }}>
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						{isPublic ? <Globe size={14} /> : <Wifi size={14} />}
						<span
							style={{ fontWeight: 500, fontSize: 13, color: "var(--cb-text)" }}
						>
							{isPublic ? "Anyone with the link" : "Just people in this office"}
						</span>
					</div>
					<div
						style={{
							fontSize: 12,
							lineHeight: 1.5,
							color: "var(--cb-text-muted)",
							marginTop: 4,
						}}
					>
						{isPublic
							? "Available on the internet at the address below. Make sure the app has a strong password."
							: "Anyone connected to this Wi-Fi can open the app. Not reachable from outside."}
					</div>
				</div>
			</button>
		);
	};

	return (
		<div
			className="cb-shell cb-overlay-in"
			onClick={onClose}
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
					width: 540,
					maxWidth: "100%",
					boxShadow: "0 24px 64px rgba(0,0,0,.3)",
					border: "1px solid var(--cb-border)",
					overflow: "hidden",
				}}
			>
				{/* Header */}
				<div
					style={{
						padding: "20px 24px",
						borderBottom: "1px solid var(--cb-border-subtle)",
						display: "flex",
						alignItems: "center",
						gap: 14,
					}}
				>
					<div
						style={{
							width: 40,
							height: 40,
							borderRadius: 8,
							background: app.iconBg,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							color: app.iconColor,
						}}
					>
						<CbIcon name={app.icon} size={20} />
					</div>
					<div style={{ flex: 1 }}>
						<div
							style={{ fontWeight: 600, fontSize: 15, color: "var(--cb-text)" }}
						>
							Install {app.name}
						</div>
						<div
							style={{
								fontSize: 12,
								color: "var(--cb-text-muted)",
								marginTop: 2,
							}}
						>
							{app.desc}
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="cb-btn"
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
						<X size={16} />
					</button>
				</div>

				{/* The one question */}
				<div style={{ padding: 24 }}>
					<div
						style={{
							fontWeight: 600,
							fontSize: 14,
							color: "var(--cb-text)",
							marginBottom: 6,
						}}
					>
						Who should be able to use this app?
					</div>
					<div
						style={{
							fontSize: 12,
							color: "var(--cb-text-muted)",
							marginBottom: 18,
						}}
					>
						You can change this later.
					</div>

					<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
						{choice("lan")}
						{choice("public")}
					</div>

					{/* Address preview */}
					<div
						style={{
							marginTop: 18,
							padding: "12px 16px",
							background: "var(--cb-surface)",
							borderRadius: 8,
							border: "1px solid var(--cb-border-subtle)",
							display: "flex",
							alignItems: "center",
							gap: 12,
						}}
					>
						<LinkIcon
							size={14}
							style={{ color: "var(--cb-text-muted)", flexShrink: 0 }}
						/>
						<div style={{ flex: 1, minWidth: 0 }}>
							<div className="cb-eyebrow">It will be at</div>
							<div
								className="cb-mono"
								style={{
									fontWeight: 500,
									fontSize: 13,
									color: "var(--cb-text)",
									marginTop: 2,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								}}
							>
								{previewUrl}
							</div>
						</div>
					</div>
				</div>

				{/* Footer */}
				<div
					style={{
						padding: "16px 24px",
						background: "var(--cb-surface)",
						borderTop: "1px solid var(--cb-border-subtle)",
						display: "flex",
						alignItems: "center",
						gap: 12,
					}}
				>
					<div
						className="cb-mono"
						style={{
							flex: 1,
							fontSize: 11,
							lineHeight: 1.4,
							color: "var(--cb-text-muted)",
						}}
					>
						{app.resource}
					</div>
					<button
						type="button"
						onClick={onClose}
						className="cb-btn"
						style={{
							padding: "9px 16px",
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
						onClick={confirmInstall}
						disabled={installing}
						className="cb-btn cb-btn-primary"
						style={{
							padding: "9px 18px",
							background: "var(--cb-brand)",
							color: "#fff",
							borderRadius: 6,
							fontWeight: 500,
							fontSize: 13,
							opacity: installing ? 0.7 : 1,
						}}
					>
						{installing ? "Installing…" : "Install"}
					</button>
				</div>
			</div>
		</div>
	);
};
