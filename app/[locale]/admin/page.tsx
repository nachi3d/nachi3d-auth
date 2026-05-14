import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/routing";
import { requireAdminPage } from "@/lib/auth/admin-guard";
import { Breadcrumb } from "@/components/ui/Breadcrumb";

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

  await requireAdminPage(locale);
  const t = await getTranslations("admin");
  const tNav = await getTranslations("nav");

  return (
    <main
      data-testid="admin-gate"
      className="mx-auto max-w-3xl px-6 py-16"
    >
      <Breadcrumb
        locale={locale}
        segments={[
          { label: tNav("home"), href: `/${locale}` },
          { label: tNav("admin") },
        ]}
      />
      <p className="mb-3 text-xs uppercase tracking-[0.3em] text-primary-400">
        Nachi3D Certify
      </p>
      <h1 className="text-3xl font-serif font-light text-white md:text-4xl">
        {t("title")}
      </h1>
      <nav className="mt-10 grid gap-3">
        <Link
          href={`/${locale}/admin/pieces`}
          className="rounded-sm border border-dark-700 bg-dark-900/40 px-5 py-4 text-dark-text-100 transition hover:border-primary-500 hover:bg-dark-800 hover:text-primary-400"
        >
          → {t("managePieces")}
        </Link>
      </nav>
    </main>
  );
}
