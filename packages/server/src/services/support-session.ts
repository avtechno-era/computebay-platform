import { db } from "@dokploy/server/db";
import { type SupportSession, supportSession } from "@dokploy/server/db/schema";
import { sendSupportAccessNotification } from "@dokploy/server/utils/notifications/support-access";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getComputeBayConfig } from "./computebay-config";

// Managed-tier support-access sessions (spec §5.9).
//
// A session row is written when an Avante support connection opens and closed
// out when it ends. On a real appliance the host's SSH-over-WARP session hook
// drives begin/end (a flagged host seam); the owner can also log an out-of-band
// session manually. Reads power the audit list + Home status indicator.

/**
 * Record the start of an Avante support session. Enforces the managed-tier and
 * pause-toggle contract: self-host appliances have no support relationship, and
 * a paused appliance must not accept a new session (the host WARP path is also
 * gated, but we refuse here too so the record stays honest).
 *
 * If the owner opted into notifications, best-effort emails them the appliance is
 * being accessed. Returns the created row.
 */
export const startSupportSession = async (params: {
	reason?: string | null;
	ticketRef?: string | null;
	initiatedBy?: string | null;
	organizationId?: string | null;
}): Promise<SupportSession> => {
	const config = await getComputeBayConfig();

	if (config.tier !== "managed") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Support sessions only exist on managed appliances",
		});
	}
	if (config.supportAccessPaused) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Support access is paused on this appliance",
		});
	}

	const startedAt = new Date();

	let notifiedOwner = false;
	if (config.supportEmailOptIn) {
		notifiedOwner = await sendSupportAccessNotification({
			startedAt,
			businessName: config.businessName,
			reason: params.reason ?? null,
		}).catch(() => false);
	}

	const [row] = await db
		.insert(supportSession)
		.values({
			organizationId: params.organizationId ?? null,
			status: "active",
			initiatedBy: params.initiatedBy || "avante-support",
			reason: params.reason ?? null,
			ticketRef: params.ticketRef ?? null,
			notifiedOwner,
			startedAt,
		})
		.returning();

	if (!row) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to record support session",
		});
	}

	return row;
};

/**
 * Close a support session. With an id, ends that specific session; otherwise ends
 * the most recent still-open one. No-op (returns null) if nothing is open.
 */
export const endSupportSession = async (
	id?: string,
): Promise<SupportSession | null> => {
	const target = id
		? await db.query.supportSession.findFirst({
				where: eq(supportSession.id, id),
			})
		: await db.query.supportSession.findFirst({
				where: eq(supportSession.status, "active"),
				orderBy: [desc(supportSession.startedAt)],
			});

	if (!target || target.status === "ended") return target ?? null;

	const [row] = await db
		.update(supportSession)
		.set({ status: "ended", endedAt: new Date() })
		.where(eq(supportSession.id, target.id))
		.returning();

	return row ?? null;
};

export const getActiveSupportSession =
	async (): Promise<SupportSession | null> => {
		const row = await db.query.supportSession.findFirst({
			where: and(
				eq(supportSession.status, "active"),
				isNull(supportSession.endedAt),
			),
			orderBy: [desc(supportSession.startedAt)],
		});
		return row ?? null;
	};

export const listSupportSessions = async (params?: {
	limit?: number;
	offset?: number;
}): Promise<{ sessions: SupportSession[]; total: number }> => {
	const limit = params?.limit ?? 25;
	const offset = params?.offset ?? 0;
	const [sessions, total] = await Promise.all([
		db.query.supportSession.findMany({
			orderBy: [desc(supportSession.startedAt)],
			limit,
			offset,
		}),
		db.$count(supportSession),
	]);
	return { sessions, total };
};

export type SupportAccessStatus = {
	tier: "managed" | "self-host";
	paused: boolean;
	emailOptIn: boolean;
	activeSession: SupportSession | null;
	lastSessionAt: Date | null;
};

/**
 * Snapshot for the Home status indicator + Settings header (§5.6/§5.9): whether
 * access is allowed or paused, whether a session is live right now, and when
 * support last connected.
 */
export const getSupportAccessStatus =
	async (): Promise<SupportAccessStatus> => {
		const config = await getComputeBayConfig();
		const [active, latest] = await Promise.all([
			getActiveSupportSession(),
			db.query.supportSession.findFirst({
				orderBy: [desc(supportSession.startedAt)],
			}),
		]);
		return {
			tier: config.tier,
			paused: config.supportAccessPaused,
			emailOptIn: config.supportEmailOptIn,
			activeSession: active,
			lastSessionAt: latest?.startedAt ?? null,
		};
	};
