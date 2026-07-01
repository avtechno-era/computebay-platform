"use client";
import { usePathname } from "next/navigation";
import { useRouter } from "next/router";
import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

export type ShellMode = "simple" | "advanced";

// Landing route for each shell. Switching shells is a full-context swap (spec
// §5.13), so we send the user to each shell's home rather than trying to map
// every deep route to a counterpart.
export const SIMPLE_HOME = "/dashboard/simple/home";
export const ADVANCED_HOME = "/dashboard/projects";

// Persisted per-browser override of the account's configured default view.
const STORAGE_KEY = "computebay:shell-mode";

/** True while the given path belongs to the Simple shell. */
export const isSimplePath = (path: string | null | undefined) =>
	!!path && path.startsWith("/dashboard/simple");

export const rememberShellMode = (mode: ShellMode) => {
	if (typeof window !== "undefined") {
		window.localStorage.setItem(STORAGE_KEY, mode);
	}
};

/**
 * Shell state derived from the current route + fork config.
 *
 * `mode` is authoritative from the URL (which shell you're actually in).
 * `canToggle` follows spec §5.13: self-host always sees the toggle; managed only
 * when `showAdvancedToggle` is on — but the toggle is always shown while in the
 * Advanced shell so there are no dead ends.
 */
export const useShellMode = () => {
	const pathname = usePathname();
	const router = useRouter();
	const { data: config } = api.computebay.getConfig.useQuery(undefined, {
		staleTime: 60_000,
	});

	const mode: ShellMode = isSimplePath(pathname) ? "simple" : "advanced";

	const canToggle =
		mode === "advanced" ||
		config?.tier === "self-host" ||
		config?.showAdvancedToggle === true;

	const setMode = useCallback(
		(next: ShellMode) => {
			if (next === mode) return;
			rememberShellMode(next);
			router.push(next === "simple" ? SIMPLE_HOME : ADVANCED_HOME);
		},
		[mode, router],
	);

	return { mode, setMode, canToggle, config };
};

/**
 * Two-state segmented control for the top bar (spec §5.13). Renders nothing when
 * the toggle should be hidden for this account/shell.
 *
 * `variant="cb"` uses ComputeBay design tokens (Simple-shell header). `"default"`
 * uses shadcn tokens for the Dokploy (Advanced) header.
 */
export const ShellToggle = ({
	className,
	variant = "default",
}: {
	className?: string;
	variant?: "cb" | "default";
}) => {
	const { mode, setMode, canToggle } = useShellMode();

	if (!canToggle) return null;

	if (variant === "cb") {
		return (
			<fieldset
				className={cn(
					"inline-flex items-center gap-0.5 rounded-full p-[3px]",
					className,
				)}
				style={{
					border: "1px solid var(--cb-border)",
					background: "var(--cb-bg)",
					margin: 0,
					minInlineSize: 0,
				}}
				aria-label="Interface mode"
			>
				{(["simple", "advanced"] as const).map((value) => {
					const active = mode === value;
					return (
						<button
							key={value}
							type="button"
							onClick={() => setMode(value)}
							aria-pressed={active}
							className="cb-btn flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium capitalize"
							style={{
								color: active ? "#fff" : "var(--cb-text-muted)",
								background: active ? "var(--cb-brand)" : "transparent",
							}}
						>
							{value}
						</button>
					);
				})}
			</fieldset>
		);
	}

	return (
		<fieldset
			className={cn(
				"m-0 inline-flex min-w-0 items-center rounded-md border bg-muted p-0.5 text-xs font-medium",
				className,
			)}
			aria-label="Interface mode"
		>
			{(["simple", "advanced"] as const).map((value) => {
				const active = mode === value;
				return (
					<button
						key={value}
						type="button"
						onClick={() => setMode(value)}
						aria-pressed={active}
						className={cn(
							"rounded px-2.5 py-1 capitalize transition-colors",
							active
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{value}
					</button>
				);
			})}
		</fieldset>
	);
};
