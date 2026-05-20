"use client";

import { useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { BackLink } from "@/components/ui/BackLink";
import type { Locale } from "@/i18n/routing";
import type { TransferStatus } from "@/lib/supabase/types";

export interface OwnedPiece {
  id: string;
  piece_number: number;
  character_name: string;
  nfc_uid: string;
  photos: string[];
  verification_url: string;
  piece_label: string;
}

export interface TransferEntry {
  id: string;
  piece_id: string;
  piece_label: string;
  character_name: string | null;
  from_owner_id: string;
  to_email: string;
  status: TransferStatus;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  note: string | null;
}

export interface OwnerDashboardLabels {
  heading: string;
  subtitle: string;
  back: string;
  banners: Record<
    | "claimed"
    | "transfer_accepted"
    | "transfer_sent"
    | "transfer_revoked"
    | "profile_saved"
    | "admin_only",
    string
  >;
  profile: {
    heading: string;
    displayName: string;
    country: string;
    countryHint: string;
    save: string;
    saving: string;
    errors: { validation: string; generic: string };
  };
  owned: {
    heading: string;
    empty: string;
    view: string;
    transfer: string;
  };
  transferModal: {
    title: string;
    intro: string;
    email: string;
    note: string;
    noteHint: string;
    submit: string;
    submitting: string;
    cancel: string;
    successTitle: string;
    successBody: string;
    successDismiss: string;
    errors: {
      validation: string;
      self_transfer: string;
      pending_transfer_exists: string;
      email_failed: string;
      generic: string;
    };
  };
  history: {
    heading: string;
    empty: string;
    createdAt: string;
    recipient: string;
    status: string;
    revoke: string;
    revoking: string;
    statuses: Record<TransferStatus, string>;
  };
}

interface DashboardProps {
  locale: Locale;
  profile: { display_name: string; country: string };
  owned: OwnedPiece[];
  transfers: TransferEntry[];
  currentUserId: string;
  banner:
    | "claimed"
    | "transfer_accepted"
    | "transfer_sent"
    | "transfer_revoked"
    | "profile_saved"
    | "admin_only"
    | null;
  labels: OwnerDashboardLabels;
}

export function OwnerDashboard({
  locale,
  profile,
  owned,
  transfers,
  currentUserId,
  banner,
  labels,
}: DashboardProps) {
  const [transferPiece, setTransferPiece] = useState<OwnedPiece | null>(null);

  return (
    <main
      data-testid="me-dashboard"
      className="brand-atmosphere mx-auto max-w-3xl px-6 py-12 md:py-16"
    >
      <BackLink locale={locale} href={`/${locale}`} label={labels.back} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.3em] text-primary-400">
            Nachi3D Certify
          </p>
          <h1 className="text-3xl font-serif font-light text-white md:text-4xl">
            {labels.heading}
          </h1>
          <p
            className="mt-2 text-sm text-dark-text-200"
            data-testid="me-current-email"
          >
            {labels.subtitle}
          </p>
        </div>
      </div>

      {banner ? (
        <div
          role="status"
          data-testid="me-banner"
          data-banner-code={banner}
          className={
            banner === "admin_only"
              ? "mt-6 rounded-sm border border-amber-500/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-200"
              : "mt-6 rounded-sm border border-primary-500/40 bg-primary-950/20 px-4 py-3 text-sm text-primary-200"
          }
        >
          {labels.banners[banner]}
        </div>
      ) : null}

      <ProfileSection
        locale={locale}
        initial={profile}
        labels={labels.profile}
      />

      <OwnedGrid
        owned={owned}
        labels={labels.owned}
        onTransfer={(p) => setTransferPiece(p)}
        locale={locale}
      />

      <HistoryTable
        transfers={transfers}
        currentUserId={currentUserId}
        labels={labels.history}
      />

      <TransferModal
        piece={transferPiece}
        locale={locale}
        onClose={() => setTransferPiece(null)}
        labels={labels.transferModal}
      />
    </main>
  );
}

function ProfileSection({
  locale,
  initial,
  labels,
}: {
  locale: Locale;
  initial: { display_name: string; country: string };
  labels: OwnerDashboardLabels["profile"];
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] =
    useState<"validation" | "generic" | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const display_name = String(fd.get("display_name") ?? "").trim();
    const country = String(fd.get("country") ?? "")
      .trim()
      .toUpperCase();
    if (country.length !== 0 && country.length !== 2) {
      setError("validation");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/${locale}/api/me/profile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ display_name, country }),
      });
      if (!res.ok) {
        setError("generic");
        return;
      }
      window.location.href = `/${locale}/me?profile_saved=1`;
    } catch {
      setError("generic");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      data-testid="me-profile"
      className="mt-10 rounded-sm border border-dark-700 bg-dark-900/40 p-6"
    >
      <h2 className="text-xs uppercase tracking-[0.25em] text-primary-400">
        {labels.heading}
      </h2>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        {error ? (
          <div
            role="alert"
            data-testid="me-profile-error"
            data-error-code={error}
            className="rounded-sm border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200"
          >
            {labels.errors[error]}
          </div>
        ) : null}
        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-dark-text-200">
            {labels.displayName}
          </span>
          <input
            name="display_name"
            type="text"
            defaultValue={initial.display_name}
            maxLength={80}
            data-testid="me-profile-display-name"
            className="w-full rounded-sm border border-dark-700 bg-dark-800 px-3 py-2 text-dark-text-100 outline-none transition focus:border-primary-500"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-dark-text-200">
            {labels.country}
          </span>
          <input
            name="country"
            type="text"
            defaultValue={initial.country}
            maxLength={2}
            data-testid="me-profile-country"
            className="w-32 rounded-sm border border-dark-700 bg-dark-800 px-3 py-2 uppercase text-dark-text-100 outline-none transition focus:border-primary-500"
          />
          <span className="mt-1 block text-[0.7rem] text-dark-text-200">
            {labels.countryHint}
          </span>
        </label>
        <button
          type="submit"
          disabled={submitting}
          data-testid="me-profile-save"
          className="rounded-sm bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? labels.saving : labels.save}
        </button>
      </form>
    </section>
  );
}

function OwnedGrid({
  owned,
  labels,
  onTransfer,
  locale,
}: {
  owned: OwnedPiece[];
  labels: OwnerDashboardLabels["owned"];
  onTransfer: (p: OwnedPiece) => void;
  locale: Locale;
}) {
  return (
    <section data-testid="me-owned" className="mt-12">
      <h2 className="text-xs uppercase tracking-[0.25em] text-primary-400">
        {labels.heading}
      </h2>
      {owned.length === 0 ? (
        <p
          data-testid="me-owned-empty"
          className="mt-4 text-sm text-dark-text-200"
        >
          {labels.empty}
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {owned.map((p) => {
            const hero = p.photos[0] ?? null;
            return (
              <li
                key={p.id}
                data-testid="me-owned-item"
                data-piece-id={p.id}
                className="rounded-sm border border-dark-700 bg-dark-900/40 p-4"
              >
                <div className="flex items-start gap-4">
                  {hero ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={hero}
                      alt={p.character_name}
                      className="h-16 w-16 rounded-sm object-cover"
                    />
                  ) : (
                    <div
                      className="h-16 w-16 rounded-sm bg-dark-800"
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm text-primary-400">
                      {p.piece_label}
                    </p>
                    <p className="truncate text-base text-white">
                      {p.character_name}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <Link
                    href={p.verification_url}
                    data-testid="me-owned-view"
                    className="text-xs text-dark-text-200 underline-offset-2 transition hover:text-primary-400 hover:underline"
                  >
                    {labels.view}
                  </Link>
                  <button
                    type="button"
                    onClick={() => onTransfer(p)}
                    data-testid="me-owned-transfer"
                    className="rounded-sm border border-primary-500/40 px-3 py-1.5 text-xs text-primary-300 transition hover:border-primary-500 hover:text-primary-200"
                  >
                    {labels.transfer}
                  </button>
                </div>
              </li>
            );
          })}
          {/* hidden anchor used so the locale prop is exercised */}
          <span className="sr-only" data-testid="me-locale">
            {locale}
          </span>
        </ul>
      )}
    </section>
  );
}

function TransferModal({
  piece,
  locale,
  onClose,
  labels,
}: {
  piece: OwnedPiece | null;
  locale: Locale;
  onClose: () => void;
  labels: OwnerDashboardLabels["transferModal"];
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<
    | "validation"
    | "self_transfer"
    | "pending_transfer_exists"
    | "email_failed"
    | "generic"
    | null
  >(null);
  const [sent, setSent] = useState(false);

  function close() {
    onClose();
    setSubmitting(false);
    setError(null);
    setSent(false);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!piece) return;
    setError(null);
    const fd = new FormData(e.currentTarget);
    const to_email = String(fd.get("to_email") ?? "").trim().toLowerCase();
    const note = String(fd.get("note") ?? "").trim();
    if (!to_email || !/.+@.+\..+/.test(to_email)) {
      setError("validation");
      return;
    }
    if (note.length > 500) {
      setError("validation");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/transfer/initiate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          piece_id: piece.id,
          to_email,
          note: note.length > 0 ? note : undefined,
          locale,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (res.ok && data.ok) {
        setSent(true);
        return;
      }
      const err = data.error as
        | "validation_error"
        | "self_transfer"
        | "pending_transfer_exists"
        | "email_failed";
      if (err === "validation_error") setError("validation");
      else if (err === "self_transfer") setError("self_transfer");
      else if (err === "pending_transfer_exists")
        setError("pending_transfer_exists");
      else if (err === "email_failed") setError("email_failed");
      else setError("generic");
    } catch {
      setError("generic");
    } finally {
      setSubmitting(false);
    }
  }

  function dismissSuccess() {
    close();
    // Reload so the new pending row appears in the history table.
    window.location.href = `/${locale}/me?transfer_sent=1`;
  }

  return (
    <Modal
      open={piece !== null}
      onClose={close}
      labelledBy="me-transfer-modal-title"
      testid="me-transfer-modal"
    >
      {sent ? (
        <div data-testid="me-transfer-modal-sent">
          <h3
            id="me-transfer-modal-title"
            className="text-xl font-serif font-light text-white"
          >
            {labels.successTitle}
          </h3>
          <p className="mt-3 text-sm text-dark-text-100">
            {labels.successBody}
          </p>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={dismissSuccess}
              data-testid="me-transfer-modal-dismiss"
              className="rounded-sm border border-dark-700 px-4 py-2 text-sm text-dark-text-100 transition hover:border-primary-500 hover:text-primary-300"
            >
              {labels.successDismiss}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} data-testid="me-transfer-modal-form">
          <h3
            id="me-transfer-modal-title"
            className="text-xl font-serif font-light text-white"
          >
            {labels.title}
          </h3>
          <p className="mt-2 text-sm text-dark-text-200">{labels.intro}</p>
          {error ? (
            <div
              role="alert"
              data-testid="me-transfer-modal-error"
              data-error-code={error}
              className="mt-4 rounded-sm border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200"
            >
              {labels.errors[error]}
            </div>
          ) : null}
          <label className="mt-6 block">
            <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-dark-text-200">
              {labels.email} *
            </span>
            <input
              name="to_email"
              type="email"
              required
              data-testid="me-transfer-modal-email"
              className="w-full rounded-sm border border-dark-700 bg-dark-800 px-3 py-2 text-dark-text-100 outline-none transition focus:border-primary-500"
            />
          </label>
          <label className="mt-4 block">
            <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-dark-text-200">
              {labels.note}
            </span>
            <textarea
              name="note"
              rows={3}
              maxLength={500}
              data-testid="me-transfer-modal-note"
              className="w-full rounded-sm border border-dark-700 bg-dark-800 px-3 py-2 text-dark-text-100 outline-none transition focus:border-primary-500"
            />
            <span className="mt-1 block text-[0.7rem] text-dark-text-200">
              {labels.noteHint}
            </span>
          </label>
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={close}
              data-testid="me-transfer-modal-cancel"
              className="rounded-sm border border-dark-700 px-4 py-2 text-sm text-dark-text-200 transition hover:border-dark-text-100 hover:text-dark-text-100"
            >
              {labels.cancel}
            </button>
            <button
              type="submit"
              disabled={submitting}
              data-testid="me-transfer-modal-submit"
              className="rounded-sm bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? labels.submitting : labels.submit}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function HistoryTable({
  transfers,
  currentUserId,
  labels,
}: {
  transfers: TransferEntry[];
  currentUserId: string;
  labels: OwnerDashboardLabels["history"];
}) {
  const [revoking, setRevoking] = useState<string | null>(null);

  async function revoke(id: string) {
    setRevoking(id);
    try {
      const res = await fetch("/api/transfer/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transfer_id: id }),
      });
      if (res.ok) {
        window.location.search = "?transfer_revoked=1";
      }
    } finally {
      setRevoking(null);
    }
  }

  return (
    <section data-testid="me-history" className="mt-12">
      <h2 className="text-xs uppercase tracking-[0.25em] text-primary-400">
        {labels.heading}
      </h2>
      {transfers.length === 0 ? (
        <p
          data-testid="me-history-empty"
          className="mt-4 text-sm text-dark-text-200"
        >
          {labels.empty}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {transfers.map((t) => {
            const isOutgoing = t.from_owner_id === currentUserId;
            const canRevoke = isOutgoing && t.status === "pending";
            const created = new Date(t.created_at);
            return (
              <li
                key={t.id}
                data-testid="me-history-item"
                data-transfer-id={t.id}
                data-status={t.status}
                className="rounded-sm border border-dark-700 bg-dark-900/30 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-primary-400">
                      {t.piece_label}
                    </p>
                    <p className="mt-1 truncate text-dark-text-100">
                      {t.character_name ?? ""}
                    </p>
                    <p
                      className="mt-1 text-xs text-dark-text-200"
                      data-testid="me-history-recipient"
                    >
                      {labels.recipient}: {t.to_email}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      data-testid="me-history-status"
                      className={statusClass(t.status)}
                    >
                      {labels.statuses[t.status]}
                    </span>
                    <span className="text-[0.7rem] text-dark-text-200">
                      {labels.createdAt}: {created.toISOString().slice(0, 10)}
                    </span>
                    {canRevoke ? (
                      <button
                        type="button"
                        onClick={() => revoke(t.id)}
                        disabled={revoking === t.id}
                        data-testid="me-history-revoke"
                        className="rounded-sm border border-red-500/40 px-3 py-1 text-[0.7rem] text-red-300 transition hover:border-red-500 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {revoking === t.id ? labels.revoking : labels.revoke}
                      </button>
                    ) : null}
                  </div>
                </div>
                {t.note ? (
                  <p className="mt-3 border-l-2 border-primary-500/30 pl-3 text-xs italic text-dark-text-200">
                    {t.note}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function statusClass(status: TransferStatus): string {
  const base = "rounded-sm px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.2em]";
  switch (status) {
    case "pending":
      return `${base} border border-primary-500/40 text-primary-300`;
    case "accepted":
      return `${base} border border-emerald-500/40 text-emerald-300`;
    case "revoked":
      return `${base} border border-red-500/40 text-red-300`;
    case "expired":
      return `${base} border border-dark-text-200/40 text-dark-text-200`;
  }
}
