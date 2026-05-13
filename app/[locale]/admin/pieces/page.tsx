import Link from "next/link";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/routing";
import { requireAdminPage } from "@/lib/auth/admin-guard";
import { listPieces } from "@/lib/server/pieces";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const STATUS_OPTIONS = ["all", "draft", "published", "archived"] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; status?: string }>;
}

export default async function AdminPiecesListPage({
  params,
  searchParams,
}: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  await requireAdminPage(locale);
  const t = await getTranslations("admin.pieces");

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const status: StatusFilter =
    sp.status && (STATUS_OPTIONS as readonly string[]).includes(sp.status)
      ? (sp.status as StatusFilter)
      : "all";

  const { rows, total } = await listPieces({
    page,
    pageSize: PAGE_SIZE,
    status,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filterHref = (s: StatusFilter) =>
    `/${locale}/admin/pieces?status=${s}`;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12" data-testid="admin-pieces-list">
      <header className="mb-10 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.3em] text-primary-400">
            Nachi3D Certify
          </p>
          <h1 className="text-3xl font-serif font-light text-white md:text-4xl">
            {t("listTitle")}
          </h1>
          <p className="mt-2 text-sm text-dark-text-200">
            {t("listSubtitle", { total })}
          </p>
        </div>
        <Link
          href={`/${locale}/admin/pieces/new`}
          data-testid="new-piece-link"
          className="rounded-sm bg-primary-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600"
        >
          {t("newPiece")}
        </Link>
      </header>

      <nav className="mb-8 flex flex-wrap gap-2" data-testid="status-filter">
        {STATUS_OPTIONS.map((s) => (
          <Link
            key={s}
            href={filterHref(s)}
            className={
              status === s
                ? "rounded-sm bg-primary-500/20 px-3 py-1.5 text-xs uppercase tracking-wider text-primary-400 ring-1 ring-primary-500/40"
                : "rounded-sm border border-dark-700 px-3 py-1.5 text-xs uppercase tracking-wider text-dark-text-200 transition hover:border-primary-500 hover:text-primary-400"
            }
          >
            {t(`status.${s}`)}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div
          data-testid="pieces-empty"
          className="rounded-sm border border-dashed border-dark-700 bg-dark-900/40 px-6 py-16 text-center"
        >
          <p className="text-dark-text-100">{t("empty")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-dark-700 border-y border-dark-700">
          {rows.map((row) => (
            <li
              key={row.id}
              data-testid="piece-row"
              className="flex items-center justify-between py-4"
            >
              <Link
                href={`/${locale}/admin/pieces/${row.id}/edit`}
                className="flex flex-1 items-center gap-6 text-dark-text-100 transition hover:text-primary-400"
              >
                <span className="font-serif text-2xl text-white">
                  #{String(row.piece_number).padStart(4, "0")}
                </span>
                <span className="flex-1">
                  <span className="block">{row.character_name}</span>
                  <span className="block font-mono text-xs text-dark-text-200">
                    {row.nfc_uid}
                  </span>
                </span>
              </Link>
              <span className="ml-3 flex items-center gap-2">
                <span
                  data-testid="piece-gallery-badge"
                  data-state={row.show_in_gallery ? "on" : "hidden"}
                  className={
                    "rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-wider " +
                    (row.show_in_gallery
                      ? "bg-primary-500/15 text-primary-400"
                      : "bg-dark-800 text-dark-text-200")
                  }
                >
                  {row.show_in_gallery ? t("galleryOn") : t("galleryHidden")}
                </span>
                <span
                  className={
                    "rounded-sm px-2 py-0.5 text-xs uppercase tracking-wider " +
                    (row.status === "published"
                      ? "bg-primary-500/20 text-primary-400"
                      : row.status === "archived"
                        ? "bg-dark-800 text-dark-text-200"
                        : "bg-dark-800 text-dark-text-100")
                  }
                >
                  {t(`status.${row.status}`)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav className="mt-8 flex items-center justify-between text-sm text-dark-text-200">
          {page > 1 ? (
            <Link
              href={`/${locale}/admin/pieces?status=${status}&page=${page - 1}`}
              className="transition hover:text-primary-400"
            >
              ← {t("prev")}
            </Link>
          ) : (
            <span />
          )}
          <span data-testid="page-indicator">
            {t("pageOf", { page, total: totalPages })}
          </span>
          {page < totalPages ? (
            <Link
              href={`/${locale}/admin/pieces?status=${status}&page=${page + 1}`}
              className="transition hover:text-primary-400"
            >
              {t("next")} →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </main>
  );
}
