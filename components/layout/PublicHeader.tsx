import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { PublicHeaderClient } from "./PublicHeaderClient";

interface PublicHeaderProps {
  locale: Locale;
}

function initialFrom(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "?";
  // Use the codepoint iterator so non-Latin scripts (Arabic, CJK, etc.)
  // and surrogate-pair emoji yield a single visible glyph.
  const first = Array.from(trimmed)[0] ?? "?";
  return first.toLocaleUpperCase();
}

function localPart(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

export async function PublicHeader({ locale }: PublicHeaderProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const tAuth = await getTranslations("nav.auth");

  // The header is the same thin top row in both states; the inner
  // cluster is the only thing that swaps. Container styling lives here
  // so the unauth/auth paths can't drift on padding or alignment.
  const containerClass =
    "mx-auto flex max-w-5xl items-center justify-end px-6 py-3";

  if (!user) {
    return (
      <header className="w-full">
        <div className={containerClass}>
          <Link
            href={`/${locale}/login`}
            data-testid="public-header-login"
            className="text-xs uppercase tracking-[0.2em] text-dark-text-200 transition hover:text-primary-400"
          >
            {tAuth("login")}
          </Link>
        </div>
      </header>
    );
  }

  // Pull display_name from profiles so the trigger label can prefer it
  // over the raw email. Anon-key client + RLS would also work since
  // profiles.select-own is allowed, but the ssr client we already have
  // is fine and avoids a second connection.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const email = user.email ?? "";
  const displayName = profile?.display_name?.trim() ?? "";
  const triggerLabel = displayName || localPart(email);
  const initials = displayName ? initialFrom(displayName) : initialFrom(email);

  return (
    <header className="w-full">
      <div className={containerClass}>
        <PublicHeaderClient
          locale={locale}
          triggerLabel={triggerLabel}
          initials={initials}
          labels={{
            myPieces: tAuth("myPieces"),
            signOut: tAuth("signOut"),
          }}
        />
      </div>
    </header>
  );
}
