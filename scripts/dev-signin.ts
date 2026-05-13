#!/usr/bin/env tsx
/**
 * Local-only smoke-test helper.
 *
 *   npm run dev:signin
 *   npm run dev:signin -- --email collector@nachi3d.test --url /fr/me
 *
 * Calls POST /api/test/signin against the running `npm run dev` server,
 * lets @supabase/ssr write the session cookies into a Playwright browser
 * context, then opens the system Chrome at the requested URL with that
 * context attached. The browser stays open until you close it — close
 * Chrome to exit the script.
 *
 * Hard-fails when E2E_TEST_LOGIN_ENABLED is not set to "1" (the bypass
 * route returns 404 in that case) and when the dev server is not
 * reachable on http://localhost:3000.
 *
 * NEVER use this against the production deploy. The /api/test/signin
 * route is gated by E2E_TEST_LOGIN_ENABLED specifically so it cannot be
 * abused; this script is an admission-of-defeat over the magic-link
 * flow for fast local iteration only.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

import { chromium } from "@playwright/test";
import {
  SEED_ADMIN_PASSWORD,
  SEED_COLLECTOR_PASSWORD,
} from "./seed-remote";

const DEV_BASE_URL = "http://localhost:3000";
const DEFAULT_EMAIL = "admin@nachi3d.test";
const DEFAULT_PATH = "/fr/admin";

// Map known seed accounts to their fixture passwords. Anything else has
// to be supplied via SEED_PASSWORD on the env (no production credentials
// in this file).
const SEED_PASSWORD_BY_EMAIL: Record<string, string> = {
  "admin@nachi3d.test": SEED_ADMIN_PASSWORD,
  "collector@nachi3d.test": SEED_COLLECTOR_PASSWORD,
};

function passwordFor(email: string): string {
  const known = SEED_PASSWORD_BY_EMAIL[email];
  if (known) return known;
  const fromEnv = process.env.SEED_PASSWORD;
  if (fromEnv) return fromEnv;
  throw new Error(
    `dev-signin: no fixture password is registered for ${email}. ` +
      "Set SEED_PASSWORD in the environment to override.",
  );
}

interface CliArgs {
  email: string;
  url: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let email = DEFAULT_EMAIL;
  let url = DEFAULT_PATH;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--email") {
      const next = args[++i];
      if (!next) throw new Error("dev-signin: --email requires a value");
      email = next;
    } else if (arg === "--url") {
      const next = args[++i];
      if (!next) throw new Error("dev-signin: --url requires a value");
      url = next;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(
        `dev-signin: unknown argument ${JSON.stringify(arg)}. Run with --help.`,
      );
    }
  }
  return { email, url };
}

function printUsage(): void {
  console.log(
    [
      "Usage: npm run dev:signin -- [--email <email>] [--url <path-or-url>]",
      "",
      "  --email   Account to sign in as. Default: admin@nachi3d.test.",
      "            Must already exist in the remote Supabase project — run",
      "            `npm run db:seed` first if it doesn't.",
      "  --url     Page to open after signin. Relative paths are resolved",
      `            against ${DEV_BASE_URL}. Default: ${DEFAULT_PATH}.`,
      "",
      "Requires E2E_TEST_LOGIN_ENABLED=1 in .env.local and a running",
      "`npm run dev` on http://localhost:3000.",
    ].join("\n"),
  );
}

function resolveTarget(input: string): string {
  if (/^https?:\/\//i.test(input)) return input;
  const path = input.startsWith("/") ? input : `/${input}`;
  return `${DEV_BASE_URL}${path}`;
}

async function probeDevServer(): Promise<void> {
  try {
    const res = await fetch(DEV_BASE_URL, { method: "GET" });
    if (res.status >= 500) {
      throw new Error(`dev server replied with ${res.status}`);
    }
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(
      `dev-signin: ${DEV_BASE_URL} is not reachable. Start the dev server first ` +
        "with `npm run dev` in another terminal.\n  underlying: " +
        cause,
    );
  }
}

async function main(): Promise<void> {
  if (process.env.E2E_TEST_LOGIN_ENABLED !== "1") {
    throw new Error(
      "dev-signin: E2E_TEST_LOGIN_ENABLED is not set. Add E2E_TEST_LOGIN_ENABLED=1 " +
        "to .env.local for local manual testing — and confirm it is NOT set in " +
        "production environments.",
    );
  }

  await probeDevServer();

  const { email, url } = parseArgs();
  const target = resolveTarget(url);

  // Headed system Chrome on Windows. channel:'chrome' uses the installed
  // Chrome; if you don't have Chrome installed, switch this to a regular
  // chromium.launch() call. We deliberately avoid headless mode — the
  // whole point is letting a human poke at the page.
  const browser = await chromium.launch({
    headless: false,
    channel: "chrome",
  });
  const context = await browser.newContext({ baseURL: DEV_BASE_URL });

  // Sign in through the same APIRequestContext so the Set-Cookie lands in
  // the browser context's cookie jar — the headed page will then send the
  // Supabase session on its first navigation.
  const signin = await context.request.post("/api/test/signin", {
    data: { email, password: passwordFor(email) },
  });
  if (!signin.ok()) {
    const body = await signin.text();
    await browser.close();
    throw new Error(
      `dev-signin: POST /api/test/signin failed: ${signin.status()} ${body}`,
    );
  }

  console.log(`dev-signin: signed in as ${email}`);
  const page = await context.newPage();
  await page.goto(target);
  console.log(
    `dev-signin: opened ${target} — close the Chrome window to exit.`,
  );

  await new Promise<void>((resolve) => {
    browser.on("disconnected", () => resolve());
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
