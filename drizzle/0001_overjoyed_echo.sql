CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "tenancy"."workspace_kind" AS ENUM('PRIVATE', 'SHARED');--> statement-breakpoint
CREATE TABLE "shared_kernel"."audit_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" "audit_action" NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"before_jsonb" jsonb,
	"after_jsonb" jsonb
);
--> statement-breakpoint
ALTER TABLE "shared_kernel"."audit_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shared_kernel"."outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload_jsonb" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shared_kernel"."user_keys" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"cipher_dek" "bytea" NOT NULL,
	"nonce" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"destroyed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "shared_kernel"."user_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity"."accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity"."accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity"."sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity"."sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity"."users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_hash" "bytea" NOT NULL,
	"email_encrypted" "bytea",
	"email_nonce" "bytea",
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"name_encrypted" "bytea",
	"name_nonce" "bytea",
	"image" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"display_currency" text DEFAULT 'USD' NOT NULL,
	"preferred_llm_provider" text,
	"preferred_stt_provider" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity"."users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity"."verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"active_workspace_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity"."user_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenancy"."workspace_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"inviter_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenancy"."workspace_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenancy"."workspace_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenancy"."workspaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" "tenancy"."workspace_kind" NOT NULL,
	"default_currency" text NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"member_count" integer DEFAULT 1 NOT NULL,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "tenancy"."workspaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenancy"."shared_workspace_member_shares" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"percentage" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_workspace_member_shares_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "tenancy"."shared_workspace_member_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenancy"."workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "tenancy"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "tenancy"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."shared_workspace_member_shares" ADD CONSTRAINT "shared_workspace_member_shares_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "tenancy"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_hash_uq" ON "identity"."users" USING btree ("email_hash");--> statement-breakpoint
CREATE POLICY "audit_history_tenant_isolation" ON "shared_kernel"."audit_history" AS PERMISSIVE FOR ALL TO "app_role", "worker_role" USING ("shared_kernel"."audit_history"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])) WITH CHECK ("shared_kernel"."audit_history"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));--> statement-breakpoint
CREATE POLICY "user_keys_owner_only" ON "shared_kernel"."user_keys" AS PERMISSIVE FOR ALL TO "app_role", "worker_role" USING ("shared_kernel"."user_keys"."user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid) WITH CHECK ("shared_kernel"."user_keys"."user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "accounts_owner_only" ON "identity"."accounts" AS PERMISSIVE FOR ALL TO "app_role", "worker_role" USING ("identity"."accounts"."user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid) WITH CHECK ("identity"."accounts"."user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "sessions_owner_only" ON "identity"."sessions" AS PERMISSIVE FOR ALL TO "app_role", "worker_role" USING ("identity"."sessions"."user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid) WITH CHECK ("identity"."sessions"."user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "users_self_visible" ON "identity"."users" AS PERMISSIVE FOR ALL TO "app_role", "worker_role" USING ("identity"."users"."id" = nullif(current_setting('app.current_user_id', true), '')::uuid) WITH CHECK ("identity"."users"."id" = nullif(current_setting('app.current_user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "user_preferences_owner_only" ON "identity"."user_preferences" AS PERMISSIVE FOR ALL TO "app_role", "worker_role" USING ("identity"."user_preferences"."user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid) WITH CHECK ("identity"."user_preferences"."user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "workspace_members_tenant_isolation" ON "tenancy"."workspace_members" AS PERMISSIVE FOR ALL TO "app_role", "worker_role" USING ("tenancy"."workspace_members"."workspace_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])) WITH CHECK ("tenancy"."workspace_members"."workspace_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));--> statement-breakpoint
CREATE POLICY "workspace_members_self" ON "tenancy"."workspace_members" AS PERMISSIVE FOR SELECT TO "app_role", "worker_role" USING ("tenancy"."workspace_members"."user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "workspaces_tenant_isolation" ON "tenancy"."workspaces" AS PERMISSIVE FOR ALL TO "app_role", "worker_role" USING ("tenancy"."workspaces"."id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])) WITH CHECK ("tenancy"."workspaces"."id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));--> statement-breakpoint
CREATE POLICY "shares_tenant_isolation" ON "tenancy"."shared_workspace_member_shares" AS PERMISSIVE FOR ALL TO "app_role", "worker_role" USING ("tenancy"."shared_workspace_member_shares"."workspace_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])) WITH CHECK ("tenancy"."shared_workspace_member_shares"."workspace_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));