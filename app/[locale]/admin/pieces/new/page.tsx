import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/routing";
import { requireAdminPage } from "@/lib/auth/admin-guard";
import { nextPieceNumber } from "@/lib/server/pieces";
import { PieceForm } from "@/components/admin/PieceForm";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { buildPieceFormLabels } from "../labels";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function NewPiecePage({ params }: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  await requireAdminPage(locale);

  const t = await getTranslations("admin.pieces");
  const tNav = await getTranslations("nav");
  const tForm = await getTranslations("admin.pieces.form");
  const tLicense = await getTranslations("admin.pieces.license");
  const tPhotos = await getTranslations("admin.pieces.photos");
  const tErrors = await getTranslations("admin.pieces.errors");

  const labels = buildPieceFormLabels(tForm, tLicense, tPhotos, tErrors);
  const defaultPieceNumber = await nextPieceNumber();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Breadcrumb
        locale={locale}
        segments={[
          { label: tNav("admin"), href: `/${locale}/admin` },
          { label: tNav("pieces"), href: `/${locale}/admin/pieces` },
          { label: tNav("new_piece") },
        ]}
      />
      <header className="mb-10">
        <p className="mb-2 text-xs uppercase tracking-[0.3em] text-primary-400">
          Nachi3D Certify
        </p>
        <h1 className="text-3xl font-serif font-light text-white md:text-4xl">
          {t("newTitle")}
        </h1>
        <p className="mt-2 text-sm text-dark-text-200">{t("newSubtitle")}</p>
      </header>

      <PieceForm
        mode="create"
        locale={locale}
        initial={{}}
        defaultPieceNumber={defaultPieceNumber}
        labels={labels}
      />
    </main>
  );
}
