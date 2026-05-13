"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isLocale, type Locale } from "@/i18n/routing";

function safeLocale(formData: FormData): Locale {
  const raw = formData.get("locale");
  return typeof raw === "string" && isLocale(raw) ? raw : "en";
}

export async function logoutAction(formData: FormData): Promise<void> {
  const locale = safeLocale(formData);
  const supabase = await createClient();
  // 'local' so signing out on one device doesn't end every other
  // session this admin has active. The cookie clear is what gates
  // /admin in this browser; the global revocation isn't desired.
  await supabase.auth.signOut({ scope: "local" });
  redirect(`/${locale}/login`);
}
