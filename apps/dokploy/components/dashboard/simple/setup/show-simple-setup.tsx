"use client";
import {
	ArrowLeft,
	CheckCircle2,
	Globe,
	KeyRound,
	Loader2,
	Server,
	ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/router";
import { type CSSProperties, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { api } from "@/utils/api";

// The managed broker address is a fleet-wide constant, not something an MSME owner
// should have to know. Prefer a build-time value; the field stays editable behind
// "Advanced" for self-hosted brokers / staging.
export const DEFAULT_BROKER_URL =
	process.env.NEXT_PUBLIC_COMPUTEBAY_BROKER_URL || "http://localhost:4000";

export type Mode = "choose" | "managed" | "selfhost";

export const labelStyle: CSSProperties = {
	display: "block",
	fontWeight: 600,
	fontSize: 12,
	color: "var(--cb-text)",
	marginBottom: 6,
};

export const inputStyle: CSSProperties = {
	width: "100%",
	padding: "10px 12px",
	borderRadius: 8,
	border: "1px solid var(--cb-border)",
	background: "var(--cb-elevated)",
	color: "var(--cb-text)",
	fontSize: 14,
	outline: "none",
};

export const hintStyle: CSSProperties = {
	fontSize: 12,
	color: "var(--cb-text-muted)",
	marginTop: 6,
	lineHeight: 1.5,
};

export const ShowSimpleSetup = () => {
	const router = useRouter();
	const utils = api.useUtils();
	const { data: config } = api.computebay.getConfig.useQuery();

	const [mode, setMode] = useState<Mode>("choose");

	// Managed branch
	const [activationCode, setActivationCode] = useState("");
	const [brokerUrl, setBrokerUrl] = useState(DEFAULT_BROKER_URL);
	const [telemetryAck, setTelemetryAck] = useState(false);

	// Self-host branch
	const [cfToken, setCfToken] = useState("");
	const [domain, setDomain] = useState("");
	const [accountId, setAccountId] = useState("");

	const [showAdvanced, setShowAdvanced] = useState(false);

	// Result of a successful activation (drives the confirmation screen).
	const [done, setDone] = useState<{
		tunnelReady: boolean;
		wildcardDomain: string | null;
		tier: "managed" | "self-host";
	} | null>(null);

	const activate = api.computebay.activate.useMutation();
	const activateSelfHost = api.computebay.activateSelfHost.useMutation();
	const pending = activate.isPending || activateSelfHost.isPending;

	const finish = async (result: {
		tunnelReady: boolean;
		config: { wildcardDomain: string | null; tier: "managed" | "self-host" };
	}) => {
		await utils.computebay.getConfig.invalidate();
		setDone({
			tunnelReady: result.tunnelReady,
			wildcardDomain: result.config.wildcardDomain,
			tier: result.config.tier,
		});
	};

	const submitManaged = async () => {
		if (!telemetryAck) return;
		try {
			const result = await activate.mutateAsync({
				activationCode: activationCode.trim(),
				brokerBaseUrl: brokerUrl.trim(),
			});
			await finish(result);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Activation failed");
		}
	};

	const submitSelfHost = async () => {
		try {
			const result = await activateSelfHost.mutateAsync({
				cfApiToken: cfToken.trim(),
				domain: domain.trim(),
				accountId: accountId.trim() || undefined,
			});
			await finish(result);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Setup failed");
		}
	};

	const alreadyConfigured = config?.tunnelConfigured === true && !done;

	return (
		<div
			className="cb-shell"
			style={{
				minHeight: "100vh",
				background: "var(--cb-bg)",
				display: "flex",
				alignItems: "flex-start",
				justifyContent: "center",
				padding: "64px 24px",
				overflowY: "auto",
			}}
		>
			<div className="cb-fade" style={{ width: "100%", maxWidth: 560 }}>
				{/* Brand header */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 12,
						marginBottom: 28,
					}}
				>
					<div
						style={{
							width: 40,
							height: 40,
							background: "var(--cb-brand)",
							borderRadius: 10,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							color: "#fff",
						}}
					>
						<Server size={22} strokeWidth={2} />
					</div>
					<div>
						<div
							style={{ fontWeight: 700, fontSize: 16, color: "var(--cb-text)" }}
						>
							ComputeBay Uno
						</div>
						<div style={{ fontSize: 12, color: "var(--cb-text-muted)" }}>
							Set up your appliance
						</div>
					</div>
				</div>

				{done ? (
					<DoneCard
						done={done}
						onHome={() => router.push("/dashboard/simple/home")}
					/>
				) : alreadyConfigured ? (
					<AlreadyCard
						wildcardDomain={config?.wildcardDomain ?? null}
						tier={config?.tier}
						onHome={() => router.push("/dashboard/simple/home")}
					/>
				) : mode === "choose" ? (
					<ChooseCard onPick={setMode} />
				) : mode === "managed" ? (
					<div style={cardStyle}>
						<BackLink onClick={() => setMode("choose")} />
						<h2 style={cardTitle}>Enter your activation code</h2>
						<p style={cardLead}>
							Avante sent you a code with your appliance. It connects this
							device to Avante for support, updates, and your public address.
						</p>

						<TelemetryDisclosure
							checked={telemetryAck}
							onChange={setTelemetryAck}
						/>

						<label style={labelStyle} htmlFor="activation-code">
							Activation code
						</label>
						<input
							id="activation-code"
							value={activationCode}
							onChange={(e) => setActivationCode(e.target.value)}
							placeholder="XXXX-XXXX-XXXX"
							// biome-ignore lint/a11y/noAutofocus: sole input on this onboarding step, autofocus speeds up code entry
							autoFocus
							className="cb-mono"
							style={{ ...inputStyle, letterSpacing: "0.08em" }}
							onKeyDown={(e) => {
								if (e.key === "Enter" && telemetryAck) submitManaged();
							}}
						/>

						<AdvancedToggle
							open={showAdvanced}
							onToggle={() => setShowAdvanced((v) => !v)}
						/>
						{showAdvanced && (
							<div style={{ marginTop: 12 }}>
								<label style={labelStyle} htmlFor="broker-address">
									Broker address
								</label>
								<input
									id="broker-address"
									value={brokerUrl}
									onChange={(e) => setBrokerUrl(e.target.value)}
									placeholder="https://fleet.computebay.app"
									style={inputStyle}
								/>
								<div style={hintStyle}>
									Leave this as-is unless Avante told you otherwise.
								</div>
							</div>
						)}

						<PrimaryButton
							disabled={
								pending || !telemetryAck || activationCode.trim().length < 8
							}
							loading={pending}
							onClick={submitManaged}
							label="Activate appliance"
						/>
					</div>
				) : (
					<div style={cardStyle}>
						<BackLink onClick={() => setMode("choose")} />
						<h2 style={cardTitle}>Connect your own domain</h2>
						<p style={cardLead}>
							Self-hosting keeps this appliance entirely yours — nothing is
							reported to Avante, and there&rsquo;s no remote support. You bring
							a Cloudflare API token and a domain you already manage there.
						</p>

						<label style={labelStyle} htmlFor="domain">
							Your domain
						</label>
						<input
							id="domain"
							value={domain}
							onChange={(e) => setDomain(e.target.value)}
							placeholder="acme.com"
							// biome-ignore lint/a11y/noAutofocus: sole input on this onboarding step, autofocus speeds up entry
							autoFocus
							style={inputStyle}
						/>
						<div style={hintStyle}>
							Apps you publish will live at{" "}
							<span className="cb-mono">app.{domain.trim() || "acme.com"}</span>
							.
						</div>

						<label style={{ ...labelStyle, marginTop: 16 }} htmlFor="cf-token">
							Cloudflare API token
						</label>
						<input
							id="cf-token"
							value={cfToken}
							onChange={(e) => setCfToken(e.target.value)}
							type="password"
							placeholder="Cloudflare API token"
							autoComplete="off"
							style={inputStyle}
						/>
						<div style={hintStyle}>
							Needs permission to edit DNS and Cloudflare Tunnels on your
							account. It&rsquo;s used once to set up the tunnel and is never
							stored on this appliance.
						</div>

						<AdvancedToggle
							open={showAdvanced}
							onToggle={() => setShowAdvanced((v) => !v)}
						/>
						{showAdvanced && (
							<div style={{ marginTop: 12 }}>
								<label style={labelStyle} htmlFor="cf-account-id">
									Cloudflare account ID
								</label>
								<input
									id="cf-account-id"
									value={accountId}
									onChange={(e) => setAccountId(e.target.value)}
									placeholder="Optional — only if your token sees multiple accounts"
									className="cb-mono"
									style={inputStyle}
								/>
							</div>
						)}

						<PrimaryButton
							disabled={
								pending ||
								!domain.trim().includes(".") ||
								cfToken.trim().length < 8
							}
							loading={pending}
							onClick={submitSelfHost}
							label="Set up tunnel"
						/>
					</div>
				)}
			</div>
		</div>
	);
};

export const cardStyle: CSSProperties = {
	border: "1px solid var(--cb-border)",
	borderRadius: 12,
	background: "var(--cb-elevated)",
	padding: "24px 24px 26px",
};

export const cardTitle: CSSProperties = {
	font: "600 19px/1.25 'Inter'",
	color: "var(--cb-text)",
	margin: "4px 0 8px",
	letterSpacing: "-0.01em",
};

export const cardLead: CSSProperties = {
	fontSize: 13.5,
	color: "var(--cb-text-muted)",
	lineHeight: 1.55,
	margin: "0 0 20px",
};

// Telemetry disclosure (spec §5.4) — must be acknowledged before a managed
// appliance is activated. Shared by the post-login wizard and the first-boot
// screen so the "What Avante can see" copy stays in one place.
export const TelemetryDisclosure = ({
	checked,
	onChange,
}: {
	checked: boolean;
	onChange: (v: boolean) => void;
}) => (
	<div
		style={{
			border: "1px solid var(--cb-border)",
			borderRadius: 8,
			background: "var(--cb-surface)",
			padding: "14px 16px",
			marginBottom: 18,
		}}
	>
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				fontWeight: 600,
				fontSize: 13,
				color: "var(--cb-text)",
				marginBottom: 8,
			}}
		>
			<ShieldCheck size={15} style={{ color: "var(--cb-brand)" }} />
			What Avante can see
		</div>
		<div
			style={{
				fontSize: 12.5,
				color: "var(--cb-text-muted)",
				lineHeight: 1.55,
			}}
		>
			Every few minutes your appliance tells Avante which apps are installed and
			their versions, how much disk and memory are in use, error events when
			apps crash, and whether your tunnel is healthy — so we can support you and
			push security updates.
			<br />
			<br />
			Avante never receives the contents of your apps, your files, your
			users&rsquo; passwords, or your backups. You can review this any time in
			Settings.
		</div>
		<label
			style={{
				display: "flex",
				alignItems: "flex-start",
				gap: 8,
				marginTop: 12,
				cursor: "pointer",
			}}
		>
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				style={{ marginTop: 2 }}
			/>
			<span style={{ fontSize: 12.5, color: "var(--cb-text)" }}>
				I understand what my appliance shares with Avante.
			</span>
		</label>
	</div>
);

export const ChooseCard = ({ onPick }: { onPick: (m: Mode) => void }) => (
	<div style={{ display: "grid", gap: 14 }}>
		<p style={{ ...cardLead, margin: "0 0 6px" }}>
			How is this appliance being run? Your apps work on your office network
			either way — this sets up your address on the internet.
		</p>
		<OptionCard
			icon={<Server size={20} />}
			title="Managed by Avante"
			body="I have an activation code. Avante handles the internet address, updates, and support."
			onClick={() => onPick("managed")}
		/>
		<OptionCard
			icon={<Globe size={20} />}
			title="I'll use my own domain"
			body="I have a Cloudflare account and a domain. Nothing is reported to Avante."
			onClick={() => onPick("selfhost")}
		/>
	</div>
);

export const OptionCard = ({
	icon,
	title,
	body,
	onClick,
}: {
	icon: ReactNode;
	title: string;
	body: string;
	onClick: () => void;
}) => (
	<button
		type="button"
		onClick={onClick}
		className="cb-card-hover"
		style={{
			textAlign: "left",
			display: "flex",
			gap: 14,
			alignItems: "flex-start",
			border: "1px solid var(--cb-border)",
			borderRadius: 10,
			background: "var(--cb-elevated)",
			padding: "18px 18px",
			cursor: "pointer",
		}}
	>
		<div
			style={{
				width: 40,
				height: 40,
				borderRadius: 8,
				background: "var(--cb-brand-muted)",
				color: "var(--cb-brand)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				flexShrink: 0,
			}}
		>
			{icon}
		</div>
		<div>
			<div style={{ fontWeight: 600, fontSize: 14, color: "var(--cb-text)" }}>
				{title}
			</div>
			<div
				style={{
					fontSize: 12.5,
					color: "var(--cb-text-muted)",
					marginTop: 3,
					lineHeight: 1.5,
				}}
			>
				{body}
			</div>
		</div>
	</button>
);

export const BackLink = ({ onClick }: { onClick: () => void }) => (
	<button
		type="button"
		onClick={onClick}
		className="cb-btn"
		style={{
			display: "inline-flex",
			alignItems: "center",
			gap: 6,
			fontSize: 12.5,
			color: "var(--cb-text-muted)",
			background: "transparent",
			marginBottom: 8,
			padding: 0,
		}}
	>
		<ArrowLeft size={14} /> Back
	</button>
);

export const AdvancedToggle = ({
	open,
	onToggle,
}: {
	open: boolean;
	onToggle: () => void;
}) => (
	<button
		type="button"
		onClick={onToggle}
		className="cb-btn"
		style={{
			marginTop: 14,
			fontSize: 12,
			color: "var(--cb-brand)",
			background: "transparent",
			padding: 0,
		}}
	>
		{open ? "Hide advanced options" : "Advanced options"}
	</button>
);

export const PrimaryButton = ({
	disabled,
	loading,
	onClick,
	label,
}: {
	disabled: boolean;
	loading: boolean;
	onClick: () => void;
	label: string;
}) => (
	<button
		type="button"
		disabled={disabled}
		onClick={onClick}
		className="cb-btn cb-btn-primary"
		style={{
			marginTop: 22,
			width: "100%",
			padding: "11px 14px",
			background: "var(--cb-brand)",
			color: "#fff",
			borderRadius: 8,
			fontWeight: 600,
			fontSize: 13.5,
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			gap: 8,
			opacity: disabled ? 0.55 : 1,
			cursor: disabled ? "not-allowed" : "pointer",
		}}
	>
		{loading && <Loader2 size={15} className="animate-spin" />}
		{label}
	</button>
);

const DoneCard = ({
	done,
	onHome,
}: {
	done: { tunnelReady: boolean; wildcardDomain: string | null };
	onHome: () => void;
}) => (
	<div style={cardStyle}>
		<div
			style={{
				width: 48,
				height: 48,
				borderRadius: 9999,
				background: done.tunnelReady
					? "color-mix(in srgb, var(--cb-success) 14%, transparent)"
					: "color-mix(in srgb, var(--cb-warning) 14%, transparent)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				marginBottom: 16,
			}}
		>
			<CheckCircle2
				size={26}
				style={{
					color: done.tunnelReady ? "var(--cb-success)" : "var(--cb-warning)",
				}}
			/>
		</div>
		<h2 style={cardTitle}>
			{done.tunnelReady ? "Your appliance is ready" : "Almost there"}
		</h2>
		{done.tunnelReady ? (
			<p style={cardLead}>
				Your appliance is connected. Apps you publish will be reachable at{" "}
				<span className="cb-mono" style={{ color: "var(--cb-text)" }}>
					{done.wildcardDomain ?? "your address"}
				</span>
				.
			</p>
		) : (
			<p style={cardLead}>
				Your appliance is activated and your apps work on your office network
				now. The internet connection isn&rsquo;t live yet — we&rsquo;ll keep
				trying in the background, and you can check the status on Home.
			</p>
		)}
		<PrimaryButton
			disabled={false}
			loading={false}
			onClick={onHome}
			label="Go to Home"
		/>
	</div>
);

const AlreadyCard = ({
	wildcardDomain,
	tier,
	onHome,
}: {
	wildcardDomain: string | null;
	tier?: string;
	onHome: () => void;
}) => (
	<div style={cardStyle}>
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				marginBottom: 8,
			}}
		>
			<KeyRound size={16} style={{ color: "var(--cb-brand)" }} />
			<span style={{ fontWeight: 600, fontSize: 13, color: "var(--cb-text)" }}>
				{tier === "managed" ? "Managed by Avante" : "Self-hosted"}
			</span>
		</div>
		<h2 style={cardTitle}>This appliance is already set up</h2>
		<p style={cardLead}>
			Your internet address is{" "}
			<span className="cb-mono" style={{ color: "var(--cb-text)" }}>
				{wildcardDomain ?? "configured"}
			</span>
			. There&rsquo;s nothing more to do here.
		</p>
		<PrimaryButton
			disabled={false}
			loading={false}
			onClick={onHome}
			label="Go to Home"
		/>
	</div>
);
