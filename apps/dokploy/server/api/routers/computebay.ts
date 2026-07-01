import { findComposeById } from "@dokploy/server";
import {
	apiUpdateBusinessProfile,
	apiUpdateInterface,
	apiUpdateSupportAccess,
} from "@dokploy/server/db/schema";
import {
	activateManagedAppliance,
	getTunnelHealth,
	provisionCustomRoute,
	revokeCustomRoute,
} from "@dokploy/server/services/computebay-activation";
import {
	ensureDefaultEnvironment,
	listSimpleApps,
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
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../trpc";
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
			return result;
		}),

	// Honest public-reachability status from the broker (which owns the Cloudflare
	// API). Surfaced on Home (§5.6); read by any authenticated user.
	tunnelHealth: protectedProcedure.query(async () => {
		return await getTunnelHealth();
	}),

	// Publish/withdraw a custom domain through the appliance's tunnel (§5.5 advanced
	// action). The broker makes the DNS change; Traefik already routes by Host.
	provisionCustomDomain: adminProcedure
		.input(z.object({ hostname: z.string().min(1) }))
		.mutation(async ({ input, ctx }) => {
			await provisionCustomRoute(input.hostname);
			await audit(ctx, {
				action: "create",
				resourceType: "domain",
				resourceName: `route:${input.hostname}`,
			});
			return { success: true };
		}),

	revokeCustomDomain: adminProcedure
		.input(z.object({ hostname: z.string().min(1) }))
		.mutation(async ({ input, ctx }) => {
			await revokeCustomRoute(input.hostname);
			await audit(ctx, {
				action: "delete",
				resourceType: "domain",
				resourceName: `route:${input.hostname}`,
			});
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
