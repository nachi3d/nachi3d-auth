import type { Locale } from "@/i18n/routing";

interface PieceCardProps {
  piece: {
    id: string;
    piece_number: number;
    edition_number: number | null;
    edition_total: number | null;
    character_name: string;
    character_quote: string | null;
    sculpt_date: string;
    paint_date: string;
    photos: string[];
  };
  labels: {
    pieceNumber: string;
    character: string;
    sculptDate: string;
    paintDate: string;
    authenticated: string;
    edition: string | null;
  };
  locale: Locale;
}

function formatDate(value: string, locale: Locale): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatNumber(n: number): string {
  return n.toString().padStart(4, "0");
}

export function PieceCard({ piece, labels, locale }: PieceCardProps) {
  const hero = piece.photos[0];

  return (
    <main
      data-testid="verification-piece-card"
      className="mx-auto max-w-2xl px-6 py-16"
    >
      <div className="mb-10 flex items-baseline justify-between border-b border-ink-700 pb-6">
        <p className="text-xs uppercase tracking-[0.3em] text-brass-400">
          {labels.authenticated}
        </p>
        <p
          data-testid="verification-piece-number"
          className="font-serif text-2xl text-ink-50"
        >
          #{formatNumber(piece.piece_number)}
        </p>
      </div>

      {hero ? (
        <div className="mb-10 aspect-[4/5] overflow-hidden rounded-sm bg-ink-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero}
            alt={piece.character_name}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="mb-10 flex aspect-[4/5] items-center justify-center rounded-sm border border-dashed border-ink-700 bg-ink-800 text-ink-500">
          Nachi3D
        </div>
      )}

      <p className="mb-2 text-xs uppercase tracking-[0.25em] text-ink-400">
        {labels.character}
      </p>
      <h1
        data-testid="verification-character-name"
        className="text-3xl font-serif font-light leading-tight text-ink-50 md:text-4xl"
      >
        {piece.character_name}
      </h1>

      {piece.character_quote ? (
        <blockquote className="mt-6 border-l-2 border-brass-400 pl-4 italic text-ink-200">
          &ldquo;{piece.character_quote}&rdquo;
        </blockquote>
      ) : null}

      {labels.edition ? (
        <p className="mt-8 text-sm text-ink-300">{labels.edition}</p>
      ) : null}

      <dl className="mt-10 grid grid-cols-2 gap-6 border-t border-ink-700 pt-8 text-sm">
        <div>
          <dt className="mb-1 text-xs uppercase tracking-[0.2em] text-ink-400">
            {labels.sculptDate}
          </dt>
          <dd className="text-ink-200">
            {formatDate(piece.sculpt_date, locale)}
          </dd>
        </div>
        <div>
          <dt className="mb-1 text-xs uppercase tracking-[0.2em] text-ink-400">
            {labels.paintDate}
          </dt>
          <dd className="text-ink-200">
            {formatDate(piece.paint_date, locale)}
          </dd>
        </div>
      </dl>
    </main>
  );
}
