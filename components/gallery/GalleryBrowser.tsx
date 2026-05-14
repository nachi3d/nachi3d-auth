"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LICENSE_STATUSES } from "@/lib/validation/piece";
import type { GalleryCard, GalleryLicenseFilter } from "@/lib/server/gallery";
import type { Locale } from "@/i18n/routing";

const ALL_FILTERS: ReadonlyArray<GalleryLicenseFilter> = [
  "all",
  ...LICENSE_STATUSES,
] as const;

export interface GalleryBrowserLabels {
  filtersLabel: string;
  filterAll: string;
  filters: Record<(typeof LICENSE_STATUSES)[number], string>;
  searchPlaceholder: string;
  clearHint: string;
  emptyFiltered: string;
  loadMore: string;
}

interface GalleryBrowserProps {
  locale: Locale;
  initialCards: GalleryCard[];
  initialPage: number;
  initialHasMore: boolean;
  initialLicense: GalleryLicenseFilter;
  labels: GalleryBrowserLabels;
}

export function GalleryBrowser({
  locale,
  initialCards,
  initialPage,
  initialHasMore,
  initialLicense,
  labels,
}: GalleryBrowserProps) {
  const [cards, setCards] = useState<GalleryCard[]>(initialCards);
  const [page, setPage] = useState<number>(initialPage);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [license, setLicense] = useState<GalleryLicenseFilter>(initialLicense);
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce search → only filters already-loaded cards client-side per
  // the spec. 150ms is fast enough to feel live, slow enough to avoid
  // re-rendering on every keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), 150);
    return () => window.clearTimeout(id);
  }, [search]);

  const visibleCards = useMemo(() => {
    if (!debouncedSearch) return cards;
    const needle = debouncedSearch.toLocaleLowerCase(locale);
    return cards.filter((c) =>
      c.character_name.toLocaleLowerCase(locale).includes(needle),
    );
  }, [cards, debouncedSearch, locale]);

  const refetchFromFilter = useCallback(
    async (nextLicense: GalleryLicenseFilter) => {
      setLoading(true);
      setError(null);
      try {
        const url = `/${locale}/api/gallery?page=1&license=${nextLicense}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = (await res.json()) as {
          cards: GalleryCard[];
          hasMore: boolean;
        };
        setCards(body.cards);
        setPage(1);
        setHasMore(body.hasMore);
      } catch (e) {
        setError(e instanceof Error ? e.message : "load_failed");
      } finally {
        setLoading(false);
      }
    },
    [locale],
  );

  const onSelectLicense = useCallback(
    (next: GalleryLicenseFilter) => {
      if (next === license) return;
      setLicense(next);
      // Always refetch on filter change so the new page-1 batch
      // matches the new server-side filter.
      void refetchFromFilter(next);
    },
    [license, refetchFromFilter],
  );

  const onLoadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    try {
      const next = page + 1;
      const url = `/${locale}/api/gallery?page=${next}&license=${license}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = (await res.json()) as {
        cards: GalleryCard[];
        hasMore: boolean;
      };
      setCards((prev) => [...prev, ...body.cards]);
      setPage(next);
      setHasMore(body.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, [hasMore, license, loading, locale, page]);

  // Pre-fetch verification URLs on hover, desktop only. We sniff for a
  // coarse pointer (touch device) and skip if true.
  const isMobile = useMobile();

  return (
    <div data-testid="gallery-browser">
      <div
        className="mb-6 flex flex-wrap gap-2"
        role="group"
        aria-label={labels.filtersLabel}
        data-testid="gallery-filters"
      >
        {ALL_FILTERS.map((f) => {
          const label = f === "all" ? labels.filterAll : labels.filters[f];
          const active = license === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => onSelectLicense(f)}
              data-testid={`gallery-filter-${f}`}
              data-active={active}
              className={
                active
                  ? "rounded-full bg-primary-500/20 px-4 py-1.5 text-xs uppercase tracking-wider text-primary-400 ring-1 ring-primary-500/40 transition"
                  : "rounded-full border border-dark-700 px-4 py-1.5 text-xs uppercase tracking-wider text-dark-text-200 transition hover:border-primary-500 hover:text-primary-400"
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="mb-10 max-w-md">
        <label className="block">
          <span className="sr-only">{labels.searchPlaceholder}</span>
          <input
            ref={searchInputRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearch("");
                searchInputRef.current?.blur();
              }
            }}
            placeholder={labels.searchPlaceholder}
            data-testid="gallery-search"
            className="w-full rounded-sm border border-dark-700 bg-dark-800 px-4 py-2.5 text-sm text-dark-text-100 outline-none transition focus:border-primary-500"
          />
        </label>
        {search ? (
          <p className="mt-2 text-xs text-dark-text-200">{labels.clearHint}</p>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          data-testid="gallery-error"
          className="mb-6 rounded-sm border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200"
        >
          {error}
        </p>
      ) : null}

      {visibleCards.length === 0 ? (
        <p
          data-testid="gallery-empty-filtered"
          className="rounded-sm border border-dashed border-dark-700 bg-dark-900/40 px-6 py-16 text-center text-sm text-dark-text-200"
        >
          {labels.emptyFiltered}
        </p>
      ) : (
        <ul
          data-testid="gallery-grid"
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {visibleCards.map((card) => {
            const padded = String(card.piece_number).padStart(4, "0");
            const href = `/${locale}/v/${card.nfc_uid}?t=${card.token}&from=gallery`;
            return (
              <li key={card.id} data-testid="gallery-card">
                <Link
                  href={href}
                  prefetch={isMobile ? false : true}
                  className="group block focus:outline-none"
                >
                  <div className="relative aspect-square overflow-hidden rounded-sm border border-dark-700 bg-dark-800 transition group-hover:scale-[1.01] group-hover:brightness-110 group-focus-visible:ring-2 group-focus-visible:ring-primary-500">
                    {card.hero ? (
                      <Image
                        src={card.hero}
                        alt={card.character_name}
                        fill
                        sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        className="object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center text-dark-text-200">
                        <span className="font-mono text-3xl">#{padded}</span>
                      </div>
                    )}
                    <span
                      data-testid="gallery-card-number"
                      className="absolute bottom-2 left-2 rounded-sm bg-dark-950/70 px-2 py-0.5 font-mono text-xs text-white backdrop-blur-sm"
                    >
                      #{padded}
                    </span>
                  </div>
                  <p
                    data-testid="gallery-card-name"
                    className="mt-3 truncate text-sm text-dark-text-100"
                    title={card.character_name}
                  >
                    {card.character_name}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore && !debouncedSearch ? (
        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            data-testid="gallery-load-more"
            className="rounded-sm border border-dark-700 px-6 py-2.5 text-sm text-dark-text-100 transition hover:border-primary-500 hover:text-primary-400 disabled:opacity-50"
          >
            {labels.loadMore}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function useMobile(): boolean {
  const [mobile, setMobile] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    setMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return mobile;
}
