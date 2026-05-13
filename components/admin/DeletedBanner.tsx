"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * One-shot success banner shown after deletePieceAction redirects to
 * /[locale]/admin/pieces?deleted=NNNN. Reads the param on mount and
 * strips it from the URL via router.replace so a refresh doesn't keep
 * the banner around forever.
 *
 * The piece number lives in the URL (set by the server action) so we
 * can resolve the i18n placeholder on the client without the server
 * page needing to know it.
 */
export function DeletedBanner() {
  const t = useTranslations("admin.pieces.danger");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pieceNumber, setPieceNumber] = useState<string | null>(null);

  useEffect(() => {
    const raw = searchParams.get("deleted");
    if (!raw) return;
    setPieceNumber(raw);

    // Drop ?deleted=… while preserving any other params (status, page).
    const next = new URLSearchParams(searchParams.toString());
    next.delete("deleted");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  if (!pieceNumber) return null;

  const padded = pieceNumber.padStart(4, "0");

  return (
    <div
      data-testid="piece-deleted-banner"
      data-piece-number={pieceNumber}
      role="status"
      className="mb-6 rounded-sm border border-primary-500/40 bg-primary-500/10 px-4 py-3 text-sm text-primary-400"
    >
      {t("deletedBanner", { number: padded })}
    </div>
  );
}
