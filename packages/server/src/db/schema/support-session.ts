import { relations } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";

// ComputeBay managed-tier support-access audit trail (spec §5.9).
//
// Every Avante support connection to the appliance host (SSH-over-WARP) is
// recorded here so the owner can review who connected, when, for how long, and
// (if Avante annotates it) why. Deliberately NOT license-gated — unlike the
// enterprise `audit_log`, this is a core managed-tier consent feature and must
// work on every appliance.
//
// The actual WARP/SSH transport that opens/closes a session is host-image wiring
// (a flagged seam); the host's session hook calls `startSupportSession` /
// `endSupportSession` to write these rows. Per §5.9 MVP, sessions are otherwise
// Avante-initiated out-of-band and can be logged by the owner.
export const supportSession = pgTable(
	"support_session",
	{
		id: text("id")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		organizationId: text("organization_id").references(() => organization.id, {
			onDelete: "set null",
		}),
		// "active" while a support connection is open, "ended" once it closes.
		status: text("status").notNull().default("active"),
		// Who opened it — the WARP identity or "avante-support" for out-of-band logs.
		initiatedBy: text("initiated_by").notNull().default("avante-support"),
		// Optional Avante-side annotation: support ticket id or plain-language reason.
		reason: text("reason"),
		ticketRef: text("ticket_ref"),
		// Whether the owner was emailed when this session began (opt-in, §5.9).
		notifiedOwner: boolean("notified_owner").notNull().default(false),
		startedAt: timestamp("started_at").notNull().defaultNow(),
		endedAt: timestamp("ended_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => ({
		statusIdx: index("supportSession_status_idx").on(t.status),
		startedAtIdx: index("supportSession_startedAt_idx").on(t.startedAt),
	}),
);

export const supportSessionRelations = relations(supportSession, ({ one }) => ({
	organization: one(organization, {
		fields: [supportSession.organizationId],
		references: [organization.id],
	}),
}));

export type SupportSession = typeof supportSession.$inferSelect;
export type NewSupportSession = typeof supportSession.$inferInsert;

export const apiBeginSupportSession = z.object({
	reason: z.string().max(500).optional(),
	ticketRef: z.string().max(120).optional(),
	initiatedBy: z.string().max(120).optional(),
});

export const apiEndSupportSession = z.object({
	id: z.string().min(1).optional(),
});

export const apiListSupportSessions = z.object({
	limit: z.number().int().min(1).max(100).optional(),
	offset: z.number().int().min(0).optional(),
});
