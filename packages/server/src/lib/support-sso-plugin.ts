import { createHmac, timingSafeEqual } from "node:crypto";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import * as z from "zod";
import { getComputeBayConfig } from "../services/computebay-config";

// ComputeBay support SSO (fork spec §5.9 support access, Fleet spec §5.6).
//
// Fleet Manager operators reach a customer's management interface at
// dokploy.<domain> WITHOUT ever seeing the customer's admin password. Because the
// broker never has an inbound channel to the appliance, it can't ask the box to
// mint a login on demand — so instead the two sides share a per-appliance HMAC
// secret established once at activation (supportSigningSecret). The broker signs
// a short-lived, single-use token; this endpoint verifies it locally and drops
// the operator into an authenticated session for the appliance's admin user.
//
// The token is a compact `<base64url(payload)>.<base64url(hmac)>` string. Payload:
//   { jti, email, exp, purpose: "support-sso" }
// Trust rests entirely on the HMAC + the short expiry + single-use replay guard;
// the token is only ever carried over the TLS tunnel to this endpoint.

const SSO_PURPOSE = "support-sso";
// How stale a token may be before we refuse it, even if the broker set a longer
// exp. Belt-and-suspenders against a broker clock far in the future.
const MAX_TOKEN_AGE_MS = 5 * 60 * 1000;

const b64url = (buf: Buffer) => buf.toString("base64url");

type SsoPayload = {
	jti: string;
	email: string;
	exp: number;
	purpose: string;
};

// Constant-time verify of `<payload>.<sig>` against the shared secret. Returns
// the decoded payload, or null on any structural/signature/shape failure.
const verifyToken = (token: string, secret: string): SsoPayload | null => {
	const dot = token.indexOf(".");
	if (dot <= 0) return null;
	const payloadPart = token.slice(0, dot);
	const sigPart = token.slice(dot + 1);

	const expected = createHmac("sha256", secret).update(payloadPart).digest();
	let provided: Buffer;
	try {
		provided = Buffer.from(sigPart, "base64url");
	} catch {
		return null;
	}
	if (
		provided.length !== expected.length ||
		!timingSafeEqual(provided, expected)
	) {
		return null;
	}

	try {
		const decoded = JSON.parse(
			Buffer.from(payloadPart, "base64url").toString("utf8"),
		) as SsoPayload;
		if (
			decoded.purpose !== SSO_PURPOSE ||
			typeof decoded.jti !== "string" ||
			typeof decoded.email !== "string" ||
			typeof decoded.exp !== "number"
		) {
			return null;
		}
		return decoded;
	} catch {
		return null;
	}
};

/**
 * Better-auth plugin exposing GET /api/auth/computebay-support-sso?token=…, which
 * verifies a broker-signed support token and establishes a session for the
 * appliance's admin, then redirects to the dashboard. Mirrors better-auth's own
 * magic-link verify flow (session creation + setSessionCookie + redirect).
 */
export const computebaySupportSso = () => ({
	id: "computebay-support-sso",
	endpoints: {
		computebaySupportSso: createAuthEndpoint(
			"/computebay-support-sso",
			{
				method: "GET",
				query: z.object({ token: z.string() }),
			},
			async (ctx) => {
				const home = new URL("/", ctx.context.baseURL).toString();
				const fail = (reason: string) => {
					const url = new URL("/", ctx.context.baseURL);
					url.searchParams.set("support_sso_error", reason);
					throw ctx.redirect(url.toString());
				};

				const config = await getComputeBayConfig();
				const secret = config.supportSigningSecret;
				if (!secret) return fail("not_supported");

				const payload = verifyToken(ctx.query.token, secret);
				if (!payload) return fail("invalid_token");

				const now = Date.now();
				if (payload.exp < now || now - payload.exp > MAX_TOKEN_AGE_MS) {
					return fail("expired");
				}

				// Single-use: the first consumption records the jti; a replay finds it
				// and is refused. The record self-expires with the token.
				const identifier = `support-sso:${payload.jti}`;
				const seen =
					await ctx.context.internalAdapter.findVerificationValue(identifier);
				if (seen) return fail("already_used");
				await ctx.context.internalAdapter.createVerificationValue({
					identifier,
					value: "1",
					expiresAt: new Date(payload.exp + MAX_TOKEN_AGE_MS),
				});

				const found = await ctx.context.internalAdapter.findUserByEmail(
					payload.email,
				);
				const user = found?.user;
				if (!user) return fail("no_admin");

				const session = await ctx.context.internalAdapter.createSession(
					user.id,
				);
				if (!session) return fail("session_failed");
				await setSessionCookie(ctx, { session, user });

				throw ctx.redirect(home);
			},
		),
	},
});
