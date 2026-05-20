import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";

export class AdminGuardError extends Error {
  constructor(
    public readonly reason: "unauthenticated" | "forbidden",
    message: string,
  ) {
    super(message);
    this.name = "AdminGuardError";
  }
}

/**
 * Resolve the current user and assert they have profiles.is_admin = true.
 * Throws AdminGuardError on failure so route handlers can map to 401/403.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AdminGuardError("unauthenticated", "Sign in required");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    throw new AdminGuardError("forbidden", "Admin access required");
  }

  return { user, supabase };
}

export function adminGuardStatus(reason: AdminGuardError["reason"]): number {
  return reason === "unauthenticated" ? 401 : 403;
}

/**
 * Page-level guard for /[locale]/admin/* server components. Redirects
 * unauthenticated visitors to the login page; redirects authenticated
 * non-admins to /me?admin_only=1 (the dashboard shows a banner). Returns
 * the resolved user + supabase client when access is granted.
 */
export async function requireAdminPage(locale: Locale) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    redirect(`/${locale}/me?admin_only=1`);
  }

  return { user, supabase };
}
