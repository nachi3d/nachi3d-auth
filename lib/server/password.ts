import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  passwordSetSchema,
  type PasswordErrorCode,
} from "@/lib/validation/password";

export type PasswordServerErrorCode =
  | "unauthenticated"
  | "validation_error"
  | "weak_password"
  | "generic";

export class PasswordServerError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: PasswordServerErrorCode,
    public readonly fieldCode?: PasswordErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "PasswordServerError";
  }
}

/**
 * Boolean check: does the currently-authenticated user already have a
 * password set on `auth.users`? Calls the `public.has_password()`
 * SECURITY DEFINER helper which internally scopes by `auth.uid()`.
 *
 * Returns `false` for unauthenticated sessions or any RPC failure —
 * the caller's only decision is which sub-section variant to render,
 * and "set a password" is the safe default.
 */
export async function hasPassword(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_password");
  if (error) {
    console.error("hasPassword: rpc failed:", error.message);
    return false;
  }
  return data === true;
}

/**
 * Update the authenticated user's password via Supabase Auth.
 *
 * Auth check is the caller's responsibility — the route handler must
 * confirm `auth.getUser()` resolves to a real user before calling this.
 * We deliberately mirror that here (defense in depth) by routing
 * through the SSR client, which means an unauthenticated call returns
 * `unauthenticated` instead of silently no-op'ing.
 *
 * Zod runs the same `passwordSetSchema` the client uses, so a client
 * bypass (curl, bot) hits the same minimum-strength + confirm-match
 * gates.
 */
export async function setUserPassword(rawBody: unknown): Promise<void> {
  const parsed = passwordSetSchema.safeParse(rawBody);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const code = issue?.message as PasswordErrorCode | undefined;
    if (code === "tooShort" || code === "tooWeak") {
      throw new PasswordServerError(
        400,
        "weak_password",
        code,
        "Password does not meet minimum strength",
      );
    }
    if (code === "mismatch") {
      throw new PasswordServerError(
        400,
        "validation_error",
        "mismatch",
        "Password confirmation does not match",
      );
    }
    throw new PasswordServerError(
      400,
      "validation_error",
      undefined,
      "Invalid payload",
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new PasswordServerError(401, "unauthenticated");
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    // Surface Supabase's own weak-password rejection (e.g. shared
    // password list, configured minimum length) without leaking
    // implementation details. The client treats this the same as our
    // own weak-password check.
    const status = (error as { status?: number }).status ?? 500;
    if (status === 422 || status === 400) {
      throw new PasswordServerError(400, "weak_password", "tooWeak");
    }
    // Don't log the password — only the error message.
    console.error("setUserPassword: updateUser failed:", error.message);
    throw new PasswordServerError(500, "generic");
  }
}

/**
 * Server-side helper that flips a user's password to NULL via the
 * `public.e2e_clear_user_password` SECURITY DEFINER RPC. Used ONLY by
 * `/api/test/clear-password`, which is gated behind
 * `E2E_TEST_LOGIN_ENABLED`.
 */
export async function clearUserPasswordForTest(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("e2e_clear_user_password", {
    p_user_id: userId,
  });
  if (error) {
    throw new Error(`clearUserPasswordForTest: ${error.message}`);
  }
}
