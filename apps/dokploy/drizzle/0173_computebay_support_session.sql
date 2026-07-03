CREATE TABLE "support_session" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"initiated_by" text DEFAULT 'avante-support' NOT NULL,
	"reason" text,
	"ticket_ref" text,
	"notified_owner" boolean DEFAULT false NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_session" ADD CONSTRAINT "support_session_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supportSession_status_idx" ON "support_session" USING btree ("status");--> statement-breakpoint
CREATE INDEX "supportSession_startedAt_idx" ON "support_session" USING btree ("started_at");