"use client";
import {
	Archive,
	House,
	LayoutGrid,
	type LucideIcon,
	Server,
	Settings,
	Store,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NAV } from "@/lib/computebay-strings";
import { api } from "@/utils/api";
import { ShellToggle } from "../shell-mode";
import { ApplianceHealthPill, useApplianceHealth } from "./health";

type NavKey = "home" | "apps" | "catalog" | "backups" | "settings";

interface SimpleNavItem {
	key: NavKey;
	label: string;
	icon: LucideIcon;
	href: string;
}

const NAV_ITEMS: SimpleNavItem[] = [
	{ key: "home", label: NAV.home, icon: House, href: "/dashboard/simple/home" },
	{
		key: "apps",
		label: NAV.apps,
		icon: LayoutGrid,
		href: "/dashboard/simple/apps",
	},
	{
		key: "catalog",
		label: NAV.catalog,
		icon: Store,
		href: "/dashboard/simple/catalog",
	},
	{
		key: "backups",
		label: NAV.backups,
		icon: Archive,
		href: "/dashboard/simple/backups",
	},
	{
		key: "settings",
		label: NAV.settings,
		icon: Settings,
		href: "/dashboard/simple/settings",
	},
];

interface Props {
	children: ReactNode;
	/** Which nav item is highlighted. */
	active: NavKey;
	/** Text shown in the top bar. */
	title: string;
}

export const SimpleLayout = ({ children, active, title }: Props) => {
	const pathname = usePathname();
	const { data: config } = api.computebay.getConfig.useQuery(undefined, {
		staleTime: 60_000,
	});
	const health = useApplianceHealth();

	const isManaged = config?.tier === "managed";
	const businessName = config?.businessName?.trim() || "My Business";

	return (
		<div
			className="cb-shell"
			style={{
				height: "100vh",
				display: "flex",
				overflow: "hidden",
				fontSize: 14,
			}}
		>
			{/* Sidebar */}
			<aside
				style={{
					width: 248,
					flexShrink: 0,
					background: "var(--cb-surface)",
					borderRight: "1px solid var(--cb-border)",
					display: "flex",
					flexDirection: "column",
					padding: "20px 16px",
				}}
			>
				{/* Appliance identity */}
				<div
					style={{
						padding: "4px 8px 20px",
						borderBottom: "1px solid var(--cb-border-subtle)",
						marginBottom: 16,
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
						<div
							style={{
								width: 32,
								height: 32,
								background: "var(--cb-brand)",
								borderRadius: 8,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								color: "#fff",
								flexShrink: 0,
							}}
						>
							<Server size={18} strokeWidth={2} />
						</div>
						<div style={{ minWidth: 0, flex: 1 }}>
							<div
								style={{
									fontWeight: 600,
									fontSize: 13,
									lineHeight: 1.2,
									color: "var(--cb-text)",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								}}
							>
								{businessName}
							</div>
							<div
								className="cb-mono"
								style={{
									fontWeight: 500,
									fontSize: 11,
									lineHeight: 1.3,
									color: "var(--cb-text-muted)",
									marginTop: 2,
								}}
							>
								ComputeBay Uno
							</div>
						</div>
					</div>
				</div>

				{/* Nav */}
				<nav
					style={{
						flex: 1,
						display: "flex",
						flexDirection: "column",
						gap: 2,
					}}
				>
					{NAV_ITEMS.map((item) => {
						const Icon = item.icon;
						const isActive =
							active === item.key || pathname?.startsWith(item.href);
						return (
							<Link
								key={item.key}
								href={item.href}
								className="cb-nav-item"
								style={{
									display: "flex",
									alignItems: "center",
									gap: 10,
									padding: "9px 10px",
									borderRadius: 6,
									fontWeight: isActive ? 600 : 500,
									fontSize: 13,
									color: isActive ? "var(--cb-text)" : "var(--cb-text-muted)",
									background: isActive ? "var(--cb-surface-2)" : "transparent",
									textDecoration: "none",
								}}
							>
								<Icon
									size={16}
									style={{
										color: isActive
											? "var(--cb-brand)"
											: "var(--cb-text-muted)",
										flexShrink: 0,
									}}
								/>
								<span style={{ flex: 1 }}>{item.label}</span>
							</Link>
						);
					})}
				</nav>

				{/* Tier footer */}
				<div
					style={{
						padding: "12px 8px",
						borderTop: "1px solid var(--cb-border-subtle)",
						marginTop: 12,
					}}
				>
					<div className="cb-eyebrow" style={{ marginBottom: 8 }}>
						{isManaged ? "Managed by Avante" : "Self-hosted"}
					</div>
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<Server size={14} style={{ color: "var(--cb-brand)" }} />
						<span
							style={{
								fontWeight: 500,
								fontSize: 12,
								lineHeight: 1.3,
								color: "var(--cb-text)",
							}}
						>
							{isManaged ? "Negosyo Pro" : "Your appliance"}
						</span>
					</div>
					<div
						style={{
							fontSize: 11,
							lineHeight: 1.4,
							color: "var(--cb-text-muted)",
							marginTop: 4,
						}}
					>
						{isManaged
							? "Support & updates included"
							: "You manage this yourself"}
					</div>
				</div>
			</aside>

			{/* Main */}
			<main
				style={{
					flex: 1,
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
					background: "var(--cb-bg)",
				}}
			>
				{/* Top bar */}
				<header
					style={{
						height: 56,
						flexShrink: 0,
						borderBottom: "1px solid var(--cb-border)",
						display: "flex",
						alignItems: "center",
						padding: "0 28px",
						gap: 16,
						background: "var(--cb-bg)",
					}}
				>
					<div
						style={{
							fontWeight: 600,
							fontSize: 14,
							lineHeight: 1.2,
							color: "var(--cb-text)",
							flex: 1,
						}}
					>
						{title}
					</div>

					<ApplianceHealthPill health={health} />
					<ShellToggle variant="cb" />
				</header>

				{/* Screen area */}
				<div
					className="cb-scroll"
					style={{
						flex: 1,
						overflowY: "auto",
						padding: "32px 36px 64px",
					}}
				>
					{children}
				</div>
			</main>
		</div>
	);
};

/** Convenience for a page's `getLayout`. */
export const getSimpleLayout = (active: NavKey, title: string) =>
	function SimpleLayoutWrapper(page: ReactNode) {
		return (
			<SimpleLayout active={active} title={title}>
				{page}
			</SimpleLayout>
		);
	};
