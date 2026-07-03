import {
	apiBeginSupportSession,
	apiEndSupportSession,
	apiListSupportSessions,
} from "@dokploy/server/db/schema";
import {
	endSupportSession,
	getSupportAccessStatus,
	listSupportSessions,
	startSupportSession,
} from "@dokploy/server/services/support-session";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../trpc";
import { audit } from "../utils/audit";

// Managed-tier Avante support-access audit trail (spec §5.9). Not license-gated:
// this is a core consent feature, unlike the enterprise audit log.
//
// In production the appliance host's SSH-over-WARP session hook drives begin/end
// (a flagged host seam). `begin`/`end` are exposed to admins so out-of-band
// sessions (the §5.9 MVP model) can be logged and so the host tooling has a
// device-reachable surface; reads power the Settings list + Home indicator.
export const supportSessionRouter = createTRPCRouter({
	list: adminProcedure
		.input(apiListSupportSessions)
		.query(async ({ input }) => {
			return await listSupportSessions(input);
		}),

	status: protectedProcedure.query(async () => {
		return await getSupportAccessStatus();
	}),

	begin: adminProcedure
		.input(apiBeginSupportSession)
		.mutation(async ({ input, ctx }) => {
			const session = await startSupportSession({
				...input,
				organizationId: ctx.session.activeOrganizationId,
			});
			await audit(ctx, {
				action: "create",
				resourceType: "session",
				resourceId: session.id,
				resourceName: "support-session",
				metadata: { initiatedBy: session.initiatedBy },
			});
			return session;
		}),

	end: adminProcedure
		.input(apiEndSupportSession)
		.mutation(async ({ input, ctx }) => {
			const session = await endSupportSession(input.id);
			await audit(ctx, {
				action: "update",
				resourceType: "session",
				resourceId: session?.id,
				resourceName: "support-session-ended",
			});
			return session;
		}),
});
