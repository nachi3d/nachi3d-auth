"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isLocale, type Locale } from "@/i18n/routing";
import { loginSchema } from "@/lib/validation/login";
import type { LoginActionState } from "./state";

function safeLocale(formData: FormData): Locale {
  const raw = formData.get("locale");
  return typeof raw === "string" && isLocale(raw) ? raw : "en";
}

export async function loginAction(
  _prev: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const locale = safeLocale(formData);

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: "validation" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.session) {
    return { ok: false, error: "invalid" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    // Sign the user out so the cookie session is cleared. Use scope
    // 'local' so only THIS session is revoked — Supabase's default of
    // 'global' would terminate every device the user is signed in on,
    // which is a surprising side effect for what was effectively just
    // a wrong-account login attempt.
    await supabase.auth.signOut({ scope: "local" });
    redirect(`/${locale}/login?error=access_denied`);
  }

  redirect(`/${locale}/admin`);
}
