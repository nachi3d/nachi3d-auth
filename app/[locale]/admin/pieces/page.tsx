import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
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

  const t = await getTranslations("admin.pieces");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_admin) redirect(`/${locale}/admin`);

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
          <p className="mb-2 text-xs uppercase tracking-[0.3em] text-brass-400">
            Nachi3D Certify
          </p>
          <h1 className="text-3xl font-serif font-light text-ink-50 md:text-4xl">
            {t("listTitle")}
          </h1>
          <p className="mt-2 text-sm text-ink-400">
            {t("listSubtitle", { total })}
          </p>
        </div>
        <Link
          href={`/${locale}/admin/pieces/new`}
          data-testid="new-piece-link"
          className="rounded-sm bg-brass-400 px-5 py-2.5 text-sm font-medium text-ink-900 hover:bg-brass-300"
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
                ? "rounded-sm bg-ink-700 px-3 py-1.5 text-xs uppercase tracking-wider text-ink-100"
                : "rounded-sm border border-ink-700 px-3 py-1.5 text-xs uppercase tracking-wider text-ink-400 hover:border-brass-400 hover:text-brass-400"
            }
          >
            {t(`status.${s}`)}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div
          data-testid="pieces-empty"
          className="rounded-sm border border-dashed border-ink-700 bg-ink-800/40 px-6 py-16 text-center"
        >
          <p className="text-ink-300">{t("empty")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-ink-700 border-y border-ink-700">
          {rows.map((row) => (
            <li
              key={row.id}
              data-testid="piece-row"
              className="flex items-center justify-between py-4"
            >
              <Link
                href={`/${locale}/admin/pieces/${row.id}/edit`}
                className="flex flex-1 items-center gap-6 text-ink-100 hover:text-brass-400"
              >
                <span className="font-serif text-2xl text-ink-50">
                  #{String(row.piece_number).padStart(4, "0")}
                </span>
                <span className="flex-1">
                  <span className="block">{row.character_name}</span>
                  <span className="block font-mono text-xs text-ink-500">
                    {row.nfc_uid}
                  </span>
                </span>
              </Link>
              <span
                className={
                  "ml-3 rounded-sm px-2 py-0.5 text-xs uppercase tracking-wider " +
                  (row.status === "published"
                    ? "bg-brass-400/20 text-brass-300"
                    : row.status === "archived"
                      ? "bg-ink-700 text-ink-400"
                      : "bg-ink-700 text-ink-300")
                }
              >
                {t(`status.${row.status}`)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav className="mt-8 flex items-center justify-between text-sm text-ink-400">
          {page > 1 ? (
            <Link
              href={`/${locale}/admin/pieces?status=${status}&page=${page - 1}`}
              className="hover:text-brass-400"
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
              className="hover:text-brass-400"
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
