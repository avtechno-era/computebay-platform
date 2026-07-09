import { findComposeById } from "@dokploy/server";
import {
	apiUpdateBusinessProfile,
	apiUpdateInterface,
	apiUpdateSupportAccess,
} from "@dokploy/server/db/schema";
import {
	activateManagedAppliance,
	activateSelfHostAppliance,
	getTunnelHealth,
	performManagedFirstBoot,
} from "@dokploy/server/services/computebay-activation";
import {
	addCustomDomain,
	ensureDefaultEnvironment,
	listCustomDomains,
	listSimpleApps,
	removeCustomDomain,
	setAppExposure,
} from "@dokploy/server/services/computebay-apps";
import {
	getComputeBayConfig,
	updateComputeBayConfig,
} from "@dokploy/server/services/computebay-config";
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { DeploymentJob } from "@/server/queues/queue-types";
import { myQueue } from "@/server/queues/queueSetup";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "../trpc";
import { audit } from "../utils/audit";

export const computebayRouter = createTRPCRouter({
	// Read the fork config. Available to any authenticated user because the Simple
	// shell (default view, tier gating, tunnel address) reads it on every page.
	// The tunnel + device tokens are secrets that only ever live server-side, so
	// they are stripped from the client-facing shape.
	getConfig: protectedProcedure.query(async () => {
		const {
			tunnelToken: _t,
			deviceToken: _d,
			...safe
		} = await getComputeBayConfig();
		return safe;
	}),

	// Flat list of installed apps across the appliance (spec §5.4).
	listApps: protectedProcedure.query(async ({ ctx }) => {
		return await listSimpleApps(ctx.session.activeOrganizationId);
	}),

	// Resolve (creating if needed) the environment a curated install targets.
	// The Simple shell calls this before compose.deployTemplate (spec §5.2/§5.3).
	ensureDefaultEnvironment: adminProcedure.mutation(async ({ ctx }) => {
		const environmentId = await ensureDefaultEnvironment(
			ctx.session.activeOrganizationId,
		);
		return { environmentId };
	}),

	// Move an app between "office only" and "anyone with the link" exposure
	// (spec §5.5). Compose services redeploy so the new Traefik labels apply; the
	// appliance is always self-hosted single-node, so this uses the local queue.
	setExposure: protectedProcedure
		.input(
			z.object({
				id: z.string().min(1),
				kind: z.enum(["application", "compose"]),
				mode: z.enum(["lan", "public"]),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.id, {
				domain: ["create"],
			});

			const { needsRedeploy } = await setAppExposure(input);

			await audit(ctx, {
				action: "update",
				resourceType: "domain",
				resourceId: input.id,
				resourceName: `exposure:${input.mode}`,
			});

			if (needsRedeploy) {
				const compose = await findComposeById(input.id);
				const jobData: DeploymentJob = {
					composeId: input.id,
					titleLog:
						input.mode === "public" ? "Publish app" : "Make app office-only",
					type: "redeploy",
					applicationType: "compose",
					descriptionLog: `Set exposure to ${input.mode}`,
					server: !!compose.serverId,
				};
				await myQueue.add(
					"deployments",
					{ ...jobData },
					{ removeOnComplete: true, removeOnFail: true },
				);
			}

			return { success: true };
		}),

	// Activate this appliance against the Fleet Manager broker (managed tier,
	// Phase 3). The broker provisions the Cloudflare tunnel + wildcard DNS and
	// returns the connector/device tokens, which we persist and use to start
	// cloudflared locally. `tunnelReady:false` means the appliance is managed but
	// the public tunnel isn't live yet (LAN-only until an operator resolves it).
	activate: adminProcedure
		.input(
			z.object({
				activationCode: z.string().min(1),
				brokerBaseUrl: z.string().url(),
				serialNumber: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const result = await activateManagedAppliance(input);
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "computebay-activation",
				metadata: { tunnelReady: result.tunnelReady },
			});
			// Strip the tunnel/device secrets before they reach the client, same as
			// getConfig — they only ever live server-side.
			const { tunnelToken: _t, deviceToken: _d, ...config } = result.config;
			return { tunnelReady: result.tunnelReady, config };
		}),

	// Managed first-boot (§5.1): runs *before* any admin exists. Redeems the
	// activation code, then auto-creates the Dokploy admin from the login the
	// broker provisioned for this appliance — the customer never fills in a
	// registration form. publicProcedure because there is no session yet; guarded
	// so it can only run on a virgin box (an existing owner means this is a no-op).
	setupManaged: publicProcedure
		.input(
			z.object({
				activationCode: z.string().min(1),
				brokerBaseUrl: z.string().url(),
				serialNumber: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const result = await performManagedFirstBoot(input);
			if (!result) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "This appliance already has an administrator",
				});
			}

			// The client signs in with these to establish its session, rather than
			// forwarding better-auth's Set-Cookie through the tRPC response.
			return result;
		}),

	// Self-host activation (§5.1, second branch): the owner brings their own
	// Cloudflare API token + domain; the appliance provisions its own tunnel +
	// wildcard DNS locally and runs cloudflared. No broker, no support/kill switch.
	// The CF API token is used only for this call and never persisted.
	activateSelfHost: adminProcedure
		.input(
			z.object({
				cfApiToken: z.string().min(1),
				domain: z.string().min(1),
				accountId: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const result = await activateSelfHostAppliance(input);
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "computebay-selfhost-activation",
				metadata: { tunnelReady: result.tunnelReady },
			});
			// Strip the tunnel/device secrets before they reach the client, same as
			// getConfig — they only ever live server-side.
			const { tunnelToken: _t, deviceToken: _d, ...config } = result.config;
			return { tunnelReady: result.tunnelReady, config };
		}),

	// Honest public-reachability status from the broker (which owns the Cloudflare
	// API). Surfaced on Home (§5.6); read by any authenticated user.
	tunnelHealth: protectedProcedure.query(async () => {
		return await getTunnelHealth();
	}),

	// Custom domains an owner points at one app (§5.5 advanced action). Read by any
	// authenticated user so the app detail screen can list them.
	customDomains: protectedProcedure
		.input(
			z.object({
				id: z.string().min(1),
				kind: z.enum(["application", "compose"]),
			}),
		)
		.query(async ({ input }) => {
			return await listCustomDomains(input);
		}),

	// Attach an owner-supplied domain to an app. Managed appliances have the broker
	// publish the DNS; self-host owners point their own CNAME at the wildcard host.
	// Traefik answers on the new Host; compose services redeploy so the label applies.
	addCustomDomain: adminProcedure
		.input(
			z.object({
				id: z.string().min(1),
				kind: z.enum(["application", "compose"]),
				host: z.string().min(1),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.id, {
				domain: ["create"],
			});

			const { needsRedeploy } = await addCustomDomain(input);

			await audit(ctx, {
				action: "create",
				resourceType: "domain",
				resourceId: input.id,
				resourceName: `custom:${input.host}`,
			});

			if (needsRedeploy) {
				const compose = await findComposeById(input.id);
				const jobData: DeploymentJob = {
					composeId: input.id,
					titleLog: "Add custom domain",
					type: "redeploy",
					applicationType: "compose",
					descriptionLog: `Added custom domain ${input.host}`,
					server: !!compose.serverId,
				};
				await myQueue.add(
					"deployments",
					{ ...jobData },
					{ removeOnComplete: true, removeOnFail: true },
				);
			}

			return { success: true };
		}),

	removeCustomDomain: adminProcedure
		.input(z.object({ domainId: z.string().min(1) }))
		.mutation(async ({ input, ctx }) => {
			const { needsRedeploy, composeId } = await removeCustomDomain(input);

			await audit(ctx, {
				action: "delete",
				resourceType: "domain",
				resourceId: input.domainId,
				resourceName: "custom-domain",
			});

			if (needsRedeploy && composeId) {
				const compose = await findComposeById(composeId);
				const jobData: DeploymentJob = {
					composeId,
					titleLog: "Remove custom domain",
					type: "redeploy",
					applicationType: "compose",
					descriptionLog: "Removed a custom domain",
					server: !!compose.serverId,
				};
				await myQueue.add(
					"deployments",
					{ ...jobData },
					{ removeOnComplete: true, removeOnFail: true },
				);
			}

			return { success: true };
		}),

	// Settings -> Interface (§5.13): default view + whether the header toggle shows.
	updateInterface: adminProcedure
		.input(apiUpdateInterface)
		.mutation(async ({ input, ctx }) => {
			const config = await updateComputeBayConfig(input);
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "computebay-interface",
				metadata: { ...input },
			});
			return config;
		}),

	// Business name + time zone (used for scheduling, naming defaults, dashboard).
	updateBusinessProfile: adminProcedure
		.input(apiUpdateBusinessProfile)
		.mutation(async ({ input, ctx }) => {
			const config = await updateComputeBayConfig(input);
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "computebay-business-profile",
			});
			return config;
		}),

	// Managed-tier support access controls (§5.9). Rejected on self-host appliances,
	// which have no Avante support contract or WARP path.
	updateSupportAccess: adminProcedure
		.input(apiUpdateSupportAccess)
		.mutation(async ({ input, ctx }) => {
			const current = await getComputeBayConfig();
			if (current.tier !== "managed") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Support access is only available on managed appliances",
				});
			}
			const config = await updateComputeBayConfig(input);
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "computebay-support-access",
				metadata: { ...input },
			});
			return config;
		}),
});
