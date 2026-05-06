import { PgBoss } from "pg-boss";
import { loadEnv } from "@budget/shared-kernel";

let boss: PgBoss | undefined;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  const env = loadEnv();
  boss = new PgBoss({
    connectionString: env.DATABASE_URL_WORKER,
    schema: "pgboss",
    application_name: "budget-worker",
  });
  await boss.start();
  return boss;
}

export async function stopBoss(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: true, timeout: 5000 });
    boss = undefined;
  }
}
