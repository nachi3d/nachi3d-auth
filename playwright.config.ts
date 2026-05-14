import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

// ⚠️ Data-safety flag — see "Data safety" in CLAUDE.md and the comment
// at the top of scripts/seed-remote.ts.
//
// seedRemote() refuses to prune any pieces unless ALLOW_DESTRUCTIVE_SEED
// === "1". Tests legitimately need the prune to clear stale fixture
// rows between runs, so we set it here for the Playwright process
// (which is what global-setup.ts runs under) and also propagate it to
// the dev-server process below so anything that script-imports
// seed-remote at runtime sees the same value.
//
// NEVER set this in .env.local or any production environment. It is a
// test-only opt-in. The is_fixture column scope is the second layer of
// protection — even with this flag set, only is_fixture=true rows can
// be deleted by the seeder.
process.env.ALLOW_DESTRUCTIVE_SEED = "1";

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  globalSetup: process.env.PLAYWRIGHT_SKIP_AUTH_SETUP === "1"
    ? undefined
    : "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          E2E_TEST_LOGIN_ENABLED: "1",
          ALLOW_DESTRUCTIVE_SEED: "1",
        },
      },
});
