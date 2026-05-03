import {
  ADMIN_STATE_PATH,
  COLLECTOR_STATE_PATH,
  SEED_ADMIN,
  SEED_COLLECTOR,
  ensureSignedInState,
} from "./fixtures/auth";

export default async function globalSetup() {
  if (process.env.PLAYWRIGHT_SKIP_AUTH_SETUP === "1") return;

  const baseURL =
    process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

  await ensureSignedInState(SEED_ADMIN, ADMIN_STATE_PATH, baseURL);
  await ensureSignedInState(SEED_COLLECTOR, COLLECTOR_STATE_PATH, baseURL);
}
