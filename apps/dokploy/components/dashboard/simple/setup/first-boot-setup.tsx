"use client";
import { Server } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { api } from "@/utils/api";
import {
	AdvancedToggle,
	BackLink,
	ChooseCard,
	cardLead,
	cardStyle,
	cardTitle,
	DEFAULT_BROKER_URL,
	hintStyle,
	inputStyle,
	labelStyle,
	type Mode,
	PrimaryButton,
	TelemetryDisclosure,
} from "./show-simple-setup";

/**
 * First-boot setup — the very first screen a fresh appliance shows, before any
 * admin exists (replaces Dokploy's stock /register as the landing).
 *
 * Managed: the customer only pastes an activation code. `computebay.setupManaged`
 * redeems it, provisions the tunnel, and auto-creates the Dokploy admin from the
 * login Fleet Manager generated for this appliance — no registration form. We
 * then sign in with those credentials to establish the session and land on Home.
 *
 * Self-host: forward to Dokploy's own /register screen (the customer creates
 * their own admin), after which the existing post-login setup handles the
 * Cloudflare-token tunnel step.
 */
export const FirstBootSetup = () => {
	const router = useRouter();

	// Only "choose" and "managed" live here — self-host bounces to /register.
	const [mode, setMode] =
		useState<Extract<Mode, "choose" | "managed">>("choose");
	console.log("First Boot?", mode);
	const [activationCode, setActivationCode] = useState("");
	const [brokerUrl, setBrokerUrl] = useState(DEFAULT_BROKER_URL);
	const [telemetryAck, setTelemetryAck] = useState(false);
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [busy, setBusy] = useState(false);

	const setupManaged = api.computebay.setupManaged.useMutation();

	const pick = (m: Mode) => {
		if (m === "selfhost") {
			// Dokploy's stock admin-creation screen; the CF-token step follows post-login.
			router.push("/register");
			return;
		}
		if (m === "managed") setMode("managed");
	};

	const submitManaged = async () => {
		if (!telemetryAck || busy) return;
		setBusy(true);
		try {
			const result = await setupManaged.mutateAsync({
				activationCode: activationCode.trim(),
				brokerBaseUrl: brokerUrl.trim(),
			});
			// Establish the session for the just-created admin, then land on Home.
			const { error } = await authClient.signIn.email({
				email: result.adminEmail,
				password: result.adminPassword,
			});
			if (error) {
				toast.error(
					error.message ??
						"Your appliance is set up, but signing in failed. Contact Avante support.",
				);
				return;
			}
			window.location.href = "/dashboard/simple/home";
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Activation failed");
		} finally {
			setBusy(false);
		}
	};

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

				{mode === "choose" ? (
					<ChooseCard onPick={pick} />
				) : (
					<div style={cardStyle}>
						<BackLink onClick={() => setMode("choose")} />
						<h2 style={cardTitle}>Enter your activation code</h2>
						<p style={cardLead}>
							Avante sent you a code with your appliance. It connects this
							device to Avante for support, updates, and your public address —
							and sets up your login for you, so there&rsquo;s no password to
							choose.
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
									placeholder="https://fleet-svc.computebay.app/api"
									style={inputStyle}
								/>
								<div style={hintStyle}>
									Leave this as-is unless Avante told you otherwise.
								</div>
							</div>
						)}

						<PrimaryButton
							disabled={
								busy || !telemetryAck || activationCode.trim().length < 8
							}
							loading={busy}
							onClick={submitManaged}
							label="Activate appliance"
						/>
					</div>
				)}
			</div>
		</div>
	);
};
