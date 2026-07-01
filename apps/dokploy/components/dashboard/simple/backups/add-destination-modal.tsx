"use client";
import { CheckCircle2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/utils/api";

// Common S3-compatible providers, mapped to the rclone --s3-provider value the
// backend passes through. "Other" covers any generic S3 endpoint (incl. MinIO).
const PROVIDERS = [
	{ label: "Amazon S3", value: "AWS" },
	{ label: "Cloudflare R2", value: "Cloudflare" },
	{ label: "Backblaze B2", value: "Other" },
	{ label: "MinIO / other S3", value: "Minio" },
];

const field = (
	label: string,
	value: string,
	onChange: (v: string) => void,
	opts?: { placeholder?: string; type?: string },
) => (
	<label style={{ display: "block" }}>
		<span className="cb-eyebrow" style={{ display: "block", marginBottom: 6 }}>
			{label}
		</span>
		<input
			value={value}
			type={opts?.type ?? "text"}
			placeholder={opts?.placeholder}
			onChange={(e) => onChange(e.target.value)}
			style={{
				width: "100%",
				padding: "9px 12px",
				borderRadius: 6,
				border: "1px solid var(--cb-border)",
				background: "var(--cb-bg)",
				color: "var(--cb-text)",
				fontSize: 13,
			}}
		/>
	</label>
);

export const AddDestinationModal = ({ onClose }: { onClose: () => void }) => {
	const utils = api.useUtils();
	const test = api.destination.testConnection.useMutation();
	const create = api.destination.create.useMutation();

	const [name, setName] = useState("");
	const [provider, setProvider] = useState("AWS");
	const [endpoint, setEndpoint] = useState("");
	const [region, setRegion] = useState("");
	const [bucket, setBucket] = useState("");
	const [accessKey, setAccessKey] = useState("");
	const [secretAccessKey, setSecretAccessKey] = useState("");
	const [tested, setTested] = useState(false);

	const payload = {
		name,
		provider,
		endpoint,
		region,
		bucket,
		accessKey,
		secretAccessKey,
		additionalFlags: [] as string[],
	};

	const ready =
		name && endpoint && region && bucket && accessKey && secretAccessKey;

	const runTest = async () => {
		try {
			await test.mutateAsync(payload);
			setTested(true);
			toast.success("Connected — the storage is reachable");
		} catch (err) {
			setTested(false);
			toast.error(
				err instanceof Error && err.message
					? err.message
					: "Couldn't connect to that storage",
			);
		}
	};

	const save = async () => {
		try {
			await create.mutateAsync(payload);
			await utils.destination.all.invalidate();
			toast.success("Backup storage added");
			onClose();
		} catch {
			toast.error("Couldn't save the storage");
		}
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
					width: 560,
					maxWidth: "100%",
					maxHeight: "90vh",
					overflowY: "auto",
					boxShadow: "0 24px 64px rgba(0,0,0,.3)",
					border: "1px solid var(--cb-border)",
				}}
			>
				<div
					style={{
						padding: "20px 24px",
						borderBottom: "1px solid var(--cb-border-subtle)",
						display: "flex",
						alignItems: "center",
						gap: 14,
					}}
				>
					<div style={{ flex: 1 }}>
						<div
							style={{ fontWeight: 600, fontSize: 15, color: "var(--cb-text)" }}
						>
							Add cloud backup storage
						</div>
						<div
							style={{
								fontSize: 12,
								color: "var(--cb-text-muted)",
								marginTop: 2,
							}}
						>
							Your backups will be copied here. Uses S3-compatible storage.
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

				<div
					style={{
						padding: 24,
						display: "grid",
						gap: 14,
					}}
				>
					{field("Name", name, setName, { placeholder: "Office backups" })}
					<label style={{ display: "block" }}>
						<span
							className="cb-eyebrow"
							style={{ display: "block", marginBottom: 6 }}
						>
							Provider
						</span>
						<select
							value={provider}
							onChange={(e) => {
								setProvider(e.target.value);
								setTested(false);
							}}
							style={{
								width: "100%",
								padding: "9px 12px",
								borderRadius: 6,
								border: "1px solid var(--cb-border)",
								background: "var(--cb-bg)",
								color: "var(--cb-text)",
								fontSize: 13,
							}}
						>
							{PROVIDERS.map((p) => (
								<option key={p.label} value={p.value}>
									{p.label}
								</option>
							))}
						</select>
					</label>
					<div
						style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
					>
						{field("Bucket", bucket, (v) => {
							setBucket(v);
							setTested(false);
						})}
						{field(
							"Region",
							region,
							(v) => {
								setRegion(v);
								setTested(false);
							},
							{ placeholder: "auto" },
						)}
					</div>
					{field(
						"Endpoint",
						endpoint,
						(v) => {
							setEndpoint(v);
							setTested(false);
						},
						{ placeholder: "https://s3.example.com" },
					)}
					<div
						style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
					>
						{field("Access key", accessKey, (v) => {
							setAccessKey(v);
							setTested(false);
						})}
						{field(
							"Secret key",
							secretAccessKey,
							(v) => {
								setSecretAccessKey(v);
								setTested(false);
							},
							{ type: "password" },
						)}
					</div>
				</div>

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
					{tested && (
						<span
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								fontSize: 12,
								color: "var(--cb-success)",
							}}
						>
							<CheckCircle2 size={14} /> Connected
						</span>
					)}
					<div style={{ flex: 1 }} />
					<button
						type="button"
						onClick={runTest}
						disabled={!ready || test.isPending}
						className="cb-btn"
						style={{
							padding: "9px 16px",
							border: "1px solid var(--cb-border)",
							borderRadius: 6,
							fontWeight: 500,
							fontSize: 13,
							color: "var(--cb-text)",
							opacity: !ready || test.isPending ? 0.5 : 1,
						}}
					>
						{test.isPending ? "Testing…" : "Test connection"}
					</button>
					<button
						type="button"
						onClick={save}
						disabled={!tested || create.isPending}
						className="cb-btn cb-btn-primary"
						style={{
							padding: "9px 18px",
							background: "var(--cb-brand)",
							color: "#fff",
							borderRadius: 6,
							fontWeight: 500,
							fontSize: 13,
							opacity: !tested || create.isPending ? 0.5 : 1,
						}}
					>
						{create.isPending ? "Saving…" : "Save"}
					</button>
				</div>
			</div>
		</div>
	);
};
