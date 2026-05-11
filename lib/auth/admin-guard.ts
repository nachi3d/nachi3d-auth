import "server-only";
import { createClient } from "@/lib/supabase/server";

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
