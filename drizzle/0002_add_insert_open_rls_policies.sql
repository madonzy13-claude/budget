ALTER TABLE "identity"."verifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "accounts_insert_open" ON "identity"."accounts" AS PERMISSIVE FOR INSERT TO "app_role", "worker_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "sessions_insert_open" ON "identity"."sessions" AS PERMISSIVE FOR INSERT TO "app_role", "worker_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "users_insert_open" ON "identity"."users" AS PERMISSIVE FOR INSERT TO "app_role", "worker_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "verifications_server_access" ON "identity"."verifications" AS PERMISSIVE FOR ALL TO "app_role", "worker_role" USING (true) WITH CHECK (true);