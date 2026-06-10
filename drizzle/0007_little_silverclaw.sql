CREATE TABLE "shared_kernel"."idempotency_keys" (
	"scope_hash" char(64) PRIMARY KEY NOT NULL,
	"body_hash" char(64) NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"route" text NOT NULL,
	"response_status" integer NOT NULL,
	"response_body_jsonb" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shared_kernel"."idempotency_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "idempotency_keys_tenant_isolation" ON "shared_kernel"."idempotency_keys" AS PERMISSIVE FOR ALL TO "app_role", "worker_role" USING ("shared_kernel"."idempotency_keys"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])) WITH CHECK ("shared_kernel"."idempotency_keys"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));--> statement-breakpoint
CREATE POLICY "idempotency_keys_cleanup" ON "shared_kernel"."idempotency_keys" AS PERMISSIVE FOR DELETE TO "worker_role" USING ("shared_kernel"."idempotency_keys"."expires_at" < now());