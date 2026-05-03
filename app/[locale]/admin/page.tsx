import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect, notFound } from "next/navigation";
import { isLocale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface AdminPageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminPage({ params }: AdminPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const t = await getTranslations("admin");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return (
      <main
        data-testid="admin-gate-denied"
        className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-24"
      >
        <p className="mb-3 text-xs uppercase tracking-[0.3em] text-red-400">
          403
        </p>
        <h1 className="text-3xl font-serif font-light text-ink-50">
          {t("notAuthorized")}
        </h1>
        <p className="mt-4 text-sm text-ink-400">
          {t("signedInAs", { email: user.email ?? "" })}
        </p>
      </main>
    );
  }

  return (
    <main
      data-testid="admin-gate"
      className="mx-auto max-w-3xl px-6 py-16"
    >
      <p className="mb-3 text-xs uppercase tracking-[0.3em] text-brass-400">
        Nachi3D Certify
      </p>
      <h1 className="text-3xl font-serif font-light text-ink-50 md:text-4xl">
        {t("title")}
      </h1>
      <nav className="mt-10 grid gap-3">
        <Link
          href={`/${locale}/admin/pieces`}
          className="rounded-sm border border-ink-700 px-5 py-4 text-ink-100 transition hover:border-brass-400 hover:text-brass-400"
        >
          → {t("managePieces")}
        </Link>
      </nav>

      <p className="mt-12 text-xs text-ink-500">
        {t("signedInAs", { email: user.email ?? "" })}
      </p>
    </main>
  );
}
