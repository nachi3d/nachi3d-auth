import path from "node:path";
import fs from "node:fs/promises";
import { request as pwRequest } from "@playwright/test";

export interface SeedUser {
  email: string;
  password: string;
}

export const SEED_ADMIN: SeedUser = {
  email: "admin@nachi3d.test",
  password: "nachi3d-test-password",
};

export const SEED_COLLECTOR: SeedUser = {
  email: "collector@nachi3d.test",
  password: "nachi3d-test-password",
};

export const STORAGE_STATE_DIR = path.join(
  process.cwd(),
  "tests",
  ".auth",
);

export const ADMIN_STATE_PATH = path.join(STORAGE_STATE_DIR, "admin.json");
export const COLLECTOR_STATE_PATH = path.join(
  STORAGE_STATE_DIR,
  "collector.json",
);

/**
 * Sign in via the test-only `/api/test/signin` endpoint (gated by
 * E2E_TEST_LOGIN_ENABLED on the server) and save the resulting auth
 * cookies as a Playwright storageState file.
 */
export async function ensureSignedInState(
  user: SeedUser,
  destPath: string,
  baseURL: string,
): Promise<void> {
  await fs.mkdir(STORAGE_STATE_DIR, { recursive: true });

  const ctx = await pwRequest.newContext({ baseURL });
  try {
    const res = await ctx.post("/api/test/signin", {
      data: { email: user.email, password: user.password },
    });
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(
        `Test signin failed for ${user.email}: ${res.status()} ${body}`,
      );
    }
    await ctx.storageState({ path: destPath });
  } finally {
    await ctx.dispose();
  }
}
