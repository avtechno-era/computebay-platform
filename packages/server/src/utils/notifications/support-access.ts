import { db } from "@dokploy/server/db";
import ComputeBaySupportAccessEmail from "@dokploy/server/emails/emails/computebay-support-access";
import { renderAsync } from "@react-email/components";
import { sendEmailNotification, sendResendNotification } from "./utils";

// Notify the appliance owner that an Avante support session has begun (§5.9).
//
// Reuses the appliance's configured email/resend notification connections — the
// same transport the rest of Dokploy uses for owner-facing mail. Best-effort:
// callers wrap this so a mail failure never blocks recording the session.
export const sendSupportAccessNotification = async (params: {
	startedAt: Date;
	businessName?: string | null;
	reason?: string | null;
}): Promise<boolean> => {
	// Reach the owner through whatever email/resend connection they've set up.
	// Single-appliance, single-owner: any configured email transport is theirs.
	const connections = await db.query.notifications.findMany({
		with: { email: true, resend: true },
	});

	const subject = "Avante support connected to your appliance";
	let sentAny = false;

	for (const notification of connections) {
		const { email, resend } = notification;
		if (!email && !resend) continue;

		try {
			const template = await renderAsync(
				ComputeBaySupportAccessEmail({
					date: params.startedAt.toLocaleString(),
					businessName: params.businessName ?? null,
					reason: params.reason ?? null,
				}),
			);

			if (email) {
				await sendEmailNotification(email, subject, template);
				sentAny = true;
			}
			if (resend) {
				await sendResendNotification(resend, subject, template);
				sentAny = true;
			}
		} catch (err) {
			console.log("[support-access] notification failed", err);
		}
	}

	return sentAny;
};
