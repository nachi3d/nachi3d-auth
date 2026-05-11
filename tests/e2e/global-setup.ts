import {
  ADMIN_STATE_PATH,
  COLLECTOR_STATE_PATH,
  SEED_ADMIN,
  SEED_COLLECTOR,
  ensureSignedInState,
} from "./fixtures/auth";
import { seedRemote } from "../../scripts/seed-remote";

export default async function globalSetup() {
  if (process.env.PLAYWRIGHT_SKIP_AUTH_SETUP === "1") return;

  // Under the remote-only Supabase policy, the hosted DB is long-lived
  // and `db push` doesn't run seed.sql. Seed via the service-role admin
  // API before any spec runs (idempotent). Skip via PLAYWRIGHT_SKIP_SEED=1
  // when iterating locally against an already-seeded project.
  if (process.env.PLAYWRIGHT_SKIP_SEED !== "1") {
    await seedRemote();
  }

  const baseURL =
    process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

  await ensureSignedInState(SEED_ADMIN, ADMIN_STATE_PATH, baseURL);
  await ensureSignedInState(SEED_COLLECTOR, COLLECTOR_STATE_PATH, baseURL);
}
