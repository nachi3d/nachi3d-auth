import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { AdminTopBar } from "@/components/admin/AdminTopBar";
import { SiteFooter } from "@/components/ui/SiteFooter";

export const dynamic = "force-dynamic";

interface AdminLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function AdminLayout({
  children,
  params,
}: AdminLayoutProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  // The page-level guard (requireAdminPage) handles the auth/admin
  // redirect. The layout just wants the email for the top-bar — when no
  // session exists (an unauthenticated visitor whose page is about to
  // redirect to /login) we render children without a bar.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const t = await getTranslations("admin");
  const tAuth = await getTranslations("auth");

  return (
    <>
      {user?.email ? (
        <AdminTopBar
          locale={locale}
          email={user.email}
          signedInAsLabel={t("signedInAs", { email: user.email })}
          signOutLabel={tAuth("signOut")}
        />
      ) : null}
      {children}
      <SiteFooter locale={locale} />
    </>
  );
}
