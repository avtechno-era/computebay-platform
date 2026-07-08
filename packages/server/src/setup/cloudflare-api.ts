// Cloudflare v4 API client used by the SELF-HOST activation path only.
//
// Managed-tier appliances never call Cloudflare — the Fleet Manager broker owns
// that account and does all provisioning (see fleet-manager/backend/lib/
// cloudflare.mts). Self-host appliances have no broker: the owner brings their
// own Cloudflare API token and domain, and the appliance provisions its own
// tunnel + wildcard DNS directly. This file mirrors the broker's proven tunnel/
// DNS logic so the resulting computeBay config shape is identical to managed.
//
// The owner's API token is powerful, so it is used only for the duration of a
// provisioning call and is NEVER persisted — afterwards cloudflared runs on the
// per-tunnel connector token, which carries no account authority.

const API_BASE = "https://api.cloudflare.com/client/v4";

export class CloudflareApiError extends Error {
	code: string;
	status: number;
	constructor(err: { code: string; message: string; status: number }) {
		super(err.message);
		this.name = "CloudflareApiError";
		this.code = err.code;
		this.status = err.status;
	}
}

type CfEnvelope<T> = {
	success: boolean;
	errors?: Array<{ code: number; message: string }>;
	result: T;
	result_info?: { total_count?: number };
};

async function cfFetch<T>(
	token: string,
	path: string,
	init: RequestInit = {},
): Promise<CfEnvelope<T>> {
	let res: Response;
	try {
		res = await fetch(`${API_BASE}${path}`, {
			...init,
			headers: {
				authorization: `Bearer ${token}`,
				"content-type": "application/json",
				...(init.headers ?? {}),
			},
		});
	} catch {
		throw new CloudflareApiError({
			code: "CF_UNREACHABLE",
			message: "Could not reach the Cloudflare API",
			status: 502,
		});
	}

	const body = (await res.json().catch(() => null)) as CfEnvelope<T> | null;

	if (res.status === 401 || res.status === 403) {
		throw new CloudflareApiError({
			code: "CF_TOKEN_INVALID",
			message:
				"The Cloudflare API token was rejected (invalid or insufficient permissions)",
			status: 400,
		});
	}

	if (!body || !body.success) {
		const first = body?.errors?.[0];
		throw new CloudflareApiError({
			code: "CF_REQUEST_FAILED",
			message: first
				? `Cloudflare: ${first.message}`
				: "Cloudflare request failed",
			status: 502,
		});
	}

	return body;
}

export async function verifyToken(token: string): Promise<void> {
	const { result } = await cfFetch<{ status: string }>(
		token,
		"/user/tokens/verify",
	);
	if (result.status !== "active") {
		throw new CloudflareApiError({
			code: "CF_TOKEN_INACTIVE",
			message: `The Cloudflare API token is not active (status: ${result.status})`,
			status: 400,
		});
	}
}

export type CloudflareAccount = { id: string; name: string };

// Resolve the account this token acts on. With no id, the first account is used
// (the common single-account case).
export async function getAccount(
	token: string,
	accountId?: string,
): Promise<CloudflareAccount> {
	const { result } = await cfFetch<Array<{ id: string; name: string }>>(
		token,
		"/accounts?per_page=50",
	);
	const accounts = Array.isArray(result) ? result : [];
	if (accounts.length === 0) {
		throw new CloudflareApiError({
			code: "CF_NO_ACCOUNTS",
			message: "The Cloudflare API token has access to no accounts",
			status: 400,
		});
	}
	const picked = accountId
		? accounts.find((a) => a.id === accountId)
		: accounts[0];
	if (!picked) {
		throw new CloudflareApiError({
			code: "CF_ACCOUNT_NOT_FOUND",
			message: "The requested Cloudflare account is not accessible",
			status: 400,
		});
	}
	return { id: picked.id, name: picked.name };
}

export function tunnelCname(tunnelId: string): string {
	return `${tunnelId}.cfargotunnel.com`;
}

export type CreatedTunnel = { id: string; token: string };

async function getTunnelToken(
	token: string,
	accountId: string,
	tunnelId: string,
): Promise<string> {
	const { result } = await cfFetch<string>(
		token,
		`/accounts/${accountId}/cfd_tunnel/${tunnelId}/token`,
	);
	return result;
}

export async function createTunnel(
	token: string,
	accountId: string,
	name: string,
): Promise<CreatedTunnel> {
	const { result } = await cfFetch<{ id: string; token?: string }>(
		token,
		`/accounts/${accountId}/cfd_tunnel`,
		{
			method: "POST",
			body: JSON.stringify({ name, config_src: "cloudflare" }),
		},
	);
	const connectorToken =
		result.token ?? (await getTunnelToken(token, accountId, result.id));
	return { id: result.id, token: connectorToken };
}

export type IngressRule = { hostname?: string; service: string; path?: string };

export async function putTunnelConfiguration(
	token: string,
	accountId: string,
	tunnelId: string,
	ingress: IngressRule[],
): Promise<void> {
	await cfFetch(
		token,
		`/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`,
		{ method: "PUT", body: JSON.stringify({ config: { ingress } }) },
	);
}

export type CloudflareZone = { id: string; name: string };

// Longest-suffix match: `app.acme.com` lives in the `acme.com` zone.
export async function findZoneForHost(
	token: string,
	accountId: string,
	hostname: string,
): Promise<CloudflareZone> {
	const { result } = await cfFetch<Array<{ id: string; name: string }>>(
		token,
		`/zones?account.id=${accountId}&per_page=50`,
	);
	const zones = Array.isArray(result) ? result : [];
	const host = hostname.toLowerCase().replace(/^\*\./, "");
	const match = zones
		.filter(
			(z) =>
				host === z.name.toLowerCase() ||
				host.endsWith(`.${z.name.toLowerCase()}`),
		)
		.sort((a, b) => b.name.length - a.name.length)[0];
	if (!match) {
		throw new CloudflareApiError({
			code: "CF_ZONE_NOT_FOUND",
			message: `No Cloudflare zone in this account owns "${hostname}". Add the domain to Cloudflare first.`,
			status: 400,
		});
	}
	return { id: match.id, name: match.name };
}

// Idempotent proxied CNAME: updates an existing record in place so
// re-provisioning never duplicates rows.
export async function upsertCname(
	token: string,
	zoneId: string,
	name: string,
	content: string,
): Promise<void> {
	const existing = await cfFetch<Array<{ id: string }>>(
		token,
		`/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(name)}`,
	);
	const record = existing.result?.[0];
	const body = JSON.stringify({
		type: "CNAME",
		name,
		content,
		proxied: true,
		ttl: 1,
	});
	if (record) {
		await cfFetch(token, `/zones/${zoneId}/dns_records/${record.id}`, {
			method: "PUT",
			body,
		});
	} else {
		await cfFetch(token, `/zones/${zoneId}/dns_records`, {
			method: "POST",
			body,
		});
	}
}

export async function deleteCname(
	token: string,
	accountId: string,
	hostname: string,
): Promise<void> {
	const zone = await findZoneForHost(token, accountId, hostname);
	const existing = await cfFetch<Array<{ id: string }>>(
		token,
		`/zones/${zone.id}/dns_records?type=CNAME&name=${encodeURIComponent(hostname)}`,
	);
	const record = existing.result?.[0];
	if (!record) return;
	await cfFetch(token, `/zones/${zone.id}/dns_records/${record.id}`, {
		method: "DELETE",
	});
}

export type SelfHostProvisionResult = {
	tunnelId: string;
	tunnelToken: string;
	wildcardDomain: string;
	accountId: string;
};

/**
 * One-shot self-host provisioning with the owner's own Cloudflare token: create a
 * remotely-managed tunnel, point its single catch-all ingress at the appliance's
 * Traefik, and publish `*.<domain>` so every app the owner exposes resolves
 * through the tunnel. Mirrors the broker's `provision_appliance_tunnel`.
 */
export async function provisionSelfHostTunnel(
	token: string,
	params: {
		domain: string;
		tunnelName: string;
		ingressService: string;
		accountId?: string;
	},
): Promise<SelfHostProvisionResult> {
	await verifyToken(token);
	const account = await getAccount(token, params.accountId);
	const zone = await findZoneForHost(token, account.id, params.domain);
	const tunnel = await createTunnel(token, account.id, params.tunnelName);
	await putTunnelConfiguration(token, account.id, tunnel.id, [
		{ service: params.ingressService },
	]);
	await upsertCname(
		token,
		zone.id,
		`*.${params.domain}`,
		tunnelCname(tunnel.id),
	);
	return {
		tunnelId: tunnel.id,
		tunnelToken: tunnel.token,
		wildcardDomain: params.domain,
		accountId: account.id,
	};
}
