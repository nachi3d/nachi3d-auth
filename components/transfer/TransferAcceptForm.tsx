"use client";

import { useState } from "react";
import Link from "next/link";
import type { Locale } from "@/i18n/routing";

export interface TransferAcceptLabels {
  accept: string;
  accepting: string;
  decline: string;
  errors: {
    email_mismatch: string;
    already_claimed: string;
    expired: string;
    accepted: string;
    revoked: string;
    ownership_changed: string;
    generic: string;
  };
}

interface TransferAcceptFormProps {
  token: string;
  locale: Locale;
  labels: TransferAcceptLabels;
}

export function TransferAcceptForm({
  token,
  locale,
  labels,
}: TransferAcceptFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] =
    useState<keyof TransferAcceptLabels["errors"] | null>(null);

  async function onAccept() {
    setSubmitting(true);
    setErrorCode(null);
    try {
      const res = await fetch("/api/transfer/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (res.ok && data.ok) {
        window.location.href = `/${locale}/me?transfer_accepted=1`;
        return;
      }
      const knownError = data.error as keyof TransferAcceptLabels["errors"];
      if (knownError && knownError in labels.errors) {
        setErrorCode(knownError);
      } else {
        setErrorCode("generic");
      }
    } catch {
      setErrorCode("generic");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-8 flex flex-col gap-3">
      {errorCode ? (
        <div
          role="alert"
          data-testid="transfer-accept-error"
          data-error-code={errorCode}
          className="rounded-sm border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200"
        >
          {labels.errors[errorCode]}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onAccept}
          disabled={submitting}
          data-testid="transfer-accept-button"
          className="rounded-sm bg-primary-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? labels.accepting : labels.accept}
        </button>
        <Link
          href={`/${locale}`}
          data-testid="transfer-decline-link"
          className="text-sm text-dark-text-200 underline-offset-2 transition hover:text-primary-400 hover:underline"
        >
          {labels.decline}
        </Link>
      </div>
    </div>
  );
}
