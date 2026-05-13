import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/routing";
import { requireAdminPage } from "@/lib/auth/admin-guard";
import { getPieceById } from "@/lib/server/pieces";
import { signToken } from "@/lib/hmac";
import { PieceForm } from "@/components/admin/PieceForm";
import { buildPieceFormLabels } from "../../labels";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ created?: string }>;
}

export default async function EditPiecePage({
  params,
  searchParams,
}: PageProps) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  await requireAdminPage(locale);

  const piece = await getPieceById(id);
  if (!piece) notFound();

  const t = await getTranslations("admin.pieces");
  const tForm = await getTranslations("admin.pieces.form");
  const tLicense = await getTranslations("admin.pieces.license");
  const tPhotos = await getTranslations("admin.pieces.photos");
  const tErrors = await getTranslations("admin.pieces.errors");
  const tNfc = await getTranslations("admin.pieces.nfc");

  const labels = buildPieceFormLabels(tForm, tLicense, tPhotos, tErrors);

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  const token = signToken(piece.nfc_uid, piece.id);
  const verificationUrl = `${siteUrl}/v/${piece.nfc_uid}?t=${token}`;

  const sp = await searchParams;
  const justCreated = sp.created === "1";

  const cardFilename = `nachi3d-certify-piece-${String(piece.piece_number).padStart(4, "0")}.pdf`;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10">
        <p className="mb-2 text-xs uppercase tracking-[0.3em] text-primary-400">
          Nachi3D Certify
        </p>
        <h1 className="text-3xl font-serif font-light text-white md:text-4xl">
          {t("editTitle", {
            number: String(piece.piece_number).padStart(4, "0"),
          })}
        </h1>
        <p className="mt-2 text-sm text-dark-text-200">{piece.character_name}</p>
      </header>

      {justCreated ? (
        <p
          data-testid="piece-created-banner"
          className="mb-8 rounded-sm border border-primary-500/40 bg-primary-500/10 px-4 py-3 text-sm text-primary-400"
        >
          {t("createdBanner")}
        </p>
      ) : null}

      <section
        data-testid="nfc-callout"
        className="mb-10 rounded-sm border border-primary-500/30 bg-dark-800/60 p-6"
      >
        <h2 className="text-xs uppercase tracking-[0.25em] text-primary-400">
          {tNfc("title")}
        </h2>
        <p className="mt-2 text-sm text-dark-text-100">{tNfc("body")}</p>
        <code
          data-testid="verification-url"
          className="mt-4 block break-all rounded-sm bg-dark-950 px-3 py-2 font-mono text-xs text-dark-text-100"
        >
          {verificationUrl}
        </code>
        <a
          href={`/api/admin/cards/${piece.id}`}
          download={cardFilename}
          data-testid="card-pdf-link"
          className="mt-4 inline-block rounded-sm border border-dark-700 px-4 py-2 text-sm text-dark-text-100 transition hover:border-primary-500 hover:text-primary-400"
        >
          {tNfc("downloadCard")}
        </a>
      </section>

      <PieceForm
        mode="edit"
        locale={locale}
        pieceId={piece.id}
        initial={piece}
        defaultPieceNumber={piece.piece_number}
        labels={labels}
      />
    </main>
  );
}
