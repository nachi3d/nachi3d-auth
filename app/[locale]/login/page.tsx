import { notFound, redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { LoginForm, type LoginFormLabels } from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}

export default async function LoginPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  // Already-authenticated admins bounce straight to /admin so the login
  // form is never their landing surface. Non-admin sessions fall through
  // and see the form (the access_denied banner appears via ?error).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.is_admin) {
      redirect(`/${locale}/admin`);
    }
  }

  const t = await getTranslations("login");
  const sp = await searchParams;
  const initialBanner = sp.error === "access_denied" ? "access_denied" : null;

  const labels: LoginFormLabels = {
    email: t("email"),
    password: t("password"),
    submit: t("submit"),
    submitting: t("submitting"),
    errors: {
      validation: t("errors.validation"),
      invalid: t("errors.invalid"),
      denied: t("errors.denied"),
    },
    bannerAccessDenied: t("banner.accessDenied"),
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-24">
      <div
        data-testid="login-card"
        className="rounded-sm border border-dark-700 bg-dark-900/60 p-8 shadow-xl"
      >
        <p className="mb-2 text-xs uppercase tracking-[0.3em] text-primary-400">
          Nachi3D Certify
        </p>
        <h1 className="text-3xl font-serif font-light text-white">
          {t("title")}
        </h1>
        <p className="mt-2 mb-8 text-sm text-dark-text-200">{t("subtitle")}</p>

        <LoginForm
          locale={locale}
          labels={labels}
          initialBanner={initialBanner}
        />
      </div>
    </main>
  );
}
