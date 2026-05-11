import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { isLocale, type Locale } from "@/i18n/routing";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyToken } from "@/lib/hmac";
import { TamperPanel } from "@/components/verification/TamperPanel";
import { NotFoundPanel } from "@/components/verification/NotFoundPanel";
import { HeroCarousel } from "@/components/verification/HeroCarousel";
import { CharacterQuote } from "@/components/verification/CharacterQuote";
import { AuthenticatedSeal } from "@/components/verification/AuthenticatedSeal";
import { ProvenanceTimeline } from "@/components/verification/ProvenanceTimeline";
import { ClaimCTA } from "@/components/verification/ClaimCTA";
import type {
  PieceRow,
  ProvenanceEventRow,
  ProvenanceEventType,
} from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

interface VerifyPageProps {
  params: Promise<{ locale: string; uid: string }>;
  searchParams: Promise<{ t?: string }>;
}

type PiecePublic = Pick<
  PieceRow,
  | "id"
  | "piece_number"
  | "edition_number"
  | "edition_total"
  | "nfc_uid"
  | "character_name"
  | "character_quote"
  | "sculpt_date"
  | "paint_date"
  | "photos"
  | "current_owner_id"
>;

async function fetchPublishedPieceByUid(
  uid: string,
): Promise<PiecePublic | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("pieces")
    .select(
      "id, piece_number, edition_number, edition_total, nfc_uid, character_name, character_quote, sculpt_date, paint_date, photos, current_owner_id, status",
    )
    .eq("nfc_uid", uid)
    .eq("status", "published")
    .maybeSingle();
  if (error || !data) return null;
  return data as PiecePublic;
}

async function fetchProvenanceEvents(
  pieceId: string,
): Promise<ProvenanceEventRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("provenance_events")
    .select("*")
    .eq("piece_id", pieceId)
    .order("occurred_at", { ascending: true });
  return (data ?? []) as ProvenanceEventRow[];
}

export async function generateMetadata({
  params,
  searchParams,
}: VerifyPageProps): Promise<Metadata> {
  const { locale, uid } = await params;
  if (!isLocale(locale)) return {};
  const { t: token } = await searchParams;

  const piece = await fetchPublishedPieceByUid(uid);
  if (!piece) return { title: "Nachi3D Certify" };

  const tokenValid =
    typeof token === "string" && verifyToken(piece.nfc_uid, piece.id, token);
  if (!tokenValid) {
    // Don't leak piece info in OG when verification fails.
    return {
      title: "Nachi3D Certify — Verification failed",
      robots: { index: false, follow: false },
    };
  }

  const number = String(piece.piece_number).padStart(4, "0");
  const title = `#${number} — ${piece.character_name} | Nachi3D Certify`;
  const description = piece.character_quote
    ? `${piece.character_name}: "${piece.character_quote}"`
    : `Authenticated Nachi3D figurine — ${piece.character_name}, piece #${number}.`;
  const hero = piece.photos[0];
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = `${siteUrl.replace(/\/$/, "")}/${locale}/v/${piece.nfc_uid}?t=${token}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title,
      description,
      url,
      siteName: "Nachi3D Certify",
      images: hero ? [{ url: hero, alt: piece.character_name }] : [],
    },
    twitter: {
      card: hero ? "summary_large_image" : "summary",
      title,
      description,
      images: hero ? [hero] : [],
    },
    robots: { index: true, follow: true },
  };
}

export default async function VerifyPage({
  params,
  searchParams,
}: VerifyPageProps) {
  const { locale, uid } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const { t: token } = await searchParams;
  const t = await getTranslations("verify");
  const piece = await fetchPublishedPieceByUid(uid);

  if (!piece) {
    return <NotFoundPanel title={t("notFoundTitle")} body={t("notFoundBody")} />;
  }

  const tokenValid =
    typeof token === "string" && verifyToken(piece.nfc_uid, piece.id, token);

  if (!tokenValid) {
    return (
      <TamperPanel
        title={t("tamperTitle")}
        body={t("tamperBody")}
        supportLabel={t("supportEmailCta")}
      />
    );
  }

  // Log + fetch provenance in parallel; logging is best-effort.
  const [, events] = await Promise.all([
    recordVerification(piece.id),
    fetchProvenanceEvents(piece.id),
  ]);

  return (
    <PieceVerificationView
      piece={piece}
      events={events}
      locale={locale}
      labels={{
        authenticated: t("authenticated"),
        sculptDate: t("sculptDate"),
        paintDate: t("paintDate"),
        edition:
          piece.edition_number !== null && piece.edition_total !== null
            ? t("editionShort", {
                n: piece.edition_number,
                total: piece.edition_total,
              })
            : null,
        emptyHero: t("emptyHero"),
        timeline: {
          title: t("timeline.title"),
          empty: t("timeline.empty"),
          types: {
            created: t("timeline.types.created"),
            claimed: t("timeline.types.claimed"),
            transferred: t("timeline.types.transferred"),
            note: t("timeline.types.note"),
          } satisfies Record<ProvenanceEventType, string>,
        },
        claim: {
          title: t("claim.title"),
          body: t("claim.body"),
          buttonLabel: t("claim.buttonLabel"),
        },
      }}
    />
  );
}

interface ViewProps {
  piece: PiecePublic;
  events: ProvenanceEventRow[];
  locale: Locale;
  labels: {
    authenticated: string;
    sculptDate: string;
    paintDate: string;
    edition: string | null;
    emptyHero: string;
    timeline: {
      title: string;
      empty: string;
      types: Record<ProvenanceEventType, string>;
    };
    claim: {
      title: string;
      body: string;
      buttonLabel: string;
    };
  };
}

function pad4(n: number): string {
  return n.toString().padStart(4, "0");
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

function PieceVerificationView({
  piece,
  events,
  locale,
  labels,
}: ViewProps) {
  return (
    <main
      data-testid="verification-piece-card"
      className="brand-atmosphere mx-auto max-w-2xl px-6 py-12 md:py-16"
    >
      <div className="mb-8 flex flex-col items-start gap-3">
        <AuthenticatedSeal label={labels.authenticated} />
      </div>

      <HeroCarousel
        photos={piece.photos}
        alt={piece.character_name}
        emptyLabel={labels.emptyHero}
      />

      <p
        data-testid="verification-piece-number"
        className="font-mono text-5xl tracking-tight md:text-6xl"
      >
        <span className="brand-gradient-text">
          #{pad4(piece.piece_number)}
        </span>
        {labels.edition ? (
          <span
            data-testid="verification-edition"
            className="ml-3 text-2xl text-dark-text-200 md:text-3xl"
          >
            {labels.edition}
          </span>
        ) : null}
      </p>

      <h1
        data-testid="verification-character-name"
        className="mt-4 text-3xl font-serif font-light leading-tight text-white md:text-4xl"
      >
        {piece.character_name}
      </h1>

      {piece.character_quote ? (
        <CharacterQuote
          quote={piece.character_quote}
          attributedTo={piece.character_name}
        />
      ) : null}

      <dl
        data-testid="piece-meta"
        className="mt-10 grid grid-cols-2 gap-6 border-t border-dark-700 pt-8 text-sm"
      >
        <div>
          <dt className="mb-1 text-xs uppercase tracking-[0.2em] text-dark-text-200">
            {labels.sculptDate}
          </dt>
          <dd className="text-dark-text-100">
            {formatDate(piece.sculpt_date, locale)}
          </dd>
        </div>
        <div>
          <dt className="mb-1 text-xs uppercase tracking-[0.2em] text-dark-text-200">
            {labels.paintDate}
          </dt>
          <dd className="text-dark-text-100">
            {formatDate(piece.paint_date, locale)}
          </dd>
        </div>
      </dl>

      <ProvenanceTimeline
        events={events}
        labels={labels.timeline}
        locale={locale}
      />

      {piece.current_owner_id === null ? (
        <ClaimCTA
          href={`/${locale}/claim/coming-soon`}
          title={labels.claim.title}
          body={labels.claim.body}
          buttonLabel={labels.claim.buttonLabel}
        />
      ) : null}
    </main>
  );
}

async function recordVerification(pieceId: string): Promise<void> {
  try {
    const h = await headers();
    const supabase = createAdminClient();
    await supabase.from("verification_logs").insert({
      piece_id: pieceId,
      ip_country: h.get("cf-ipcountry"),
      ip_region: h.get("cf-region") ?? h.get("cf-ipcity"),
      user_agent: h.get("user-agent"),
      is_owner: false,
    });
  } catch {
    // Logging is best-effort; never surface failures to the verifier.
  }
}
