"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isLocale, type Locale } from "@/i18n/routing";

function safeLocale(formData: FormData): Locale {
  const raw = formData.get("locale");
  return typeof raw === "string" && isLocale(raw) ? raw : "en";
}

// Confine the post-signout redirect to within-site paths. Anything that
// isn't a single-slash absolute path (e.g. "//evil.com", "https://…",
// a missing/empty value) falls back to the locale root. This is a
// classic open-redirect guard — we control where the form fires from
// but cookies make the request forgeable, so don't trust the input.
function safeNext(formData: FormData, locale: Locale): string {
  const raw = formData.get("next");
  if (typeof raw !== "string") return `/${locale}`;
  if (!raw.startsWith("/")) return `/${locale}`;
  if (raw.startsWith("//")) return `/${locale}`;
  return raw;
}

export async function publicSignOutAction(formData: FormData): Promise<void> {
  const locale = safeLocale(formData);
  const next = safeNext(formData, locale);
  const supabase = await createClient();
  // 'local' scope — only this device's session is cleared. Same
  // rationale as the admin logout: signing out of /me on a laptop
  // shouldn't sign out the collector's phone where they scanned the
  // piece.
  await supabase.auth.signOut({ scope: "local" });
  redirect(next);
}
