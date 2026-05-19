"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { Locale } from "@/i18n/routing";

export interface ClaimModalLabels {
  title: string;
  body: string;
  buttonLabel: string;
  modal: {
    title: string;
    intro: string;
    email: string;
    displayName: string;
    country: string;
    countryHint: string;
    submit: string;
    submitting: string;
    cancel: string;
    successTitle: string;
    successBody: string;
    successDismiss: string;
    errors: {
      validation: string;
      already_claimed: string;
      email_failed: string;
      generic: string;
    };
  };
}

interface ClaimCTAProps {
  pieceId: string;
  locale: Locale;
  labels: ClaimModalLabels;
  /**
   * Test hook — when present, the spec drives the claim finalize
   * directly instead of waiting on a magic-link email. The form posts
   * to /api/claim/initiate, reads `token` + `next` from the response,
   * and navigates straight there.
   */
  testMode?: boolean;
}

type Phase = "form" | "submitting" | "sent" | "error";

export function ClaimCTA({ pieceId, locale, labels, testMode }: ClaimCTAProps) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [errorCode, setErrorCode] = useState<keyof ClaimModalLabels["modal"]["errors"] | null>(null);

  function reset() {
    setPhase("form");
    setErrorCode(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const display_name = String(formData.get("display_name") ?? "").trim();
    const country = String(formData.get("country") ?? "").trim().toUpperCase();

    if (
      !email ||
      !display_name ||
      country.length !== 2
    ) {
      setErrorCode("validation");
      setPhase("error");
      return;
    }

    setPhase("submitting");
    setErrorCode(null);

    try {
      const res = await fetch("/api/claim/initiate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          piece_id: pieceId,
          email,
          display_name,
          country,
          locale,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        token?: string;
        next?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        if (data.error === "already_claimed") {
          setErrorCode("already_claimed");
        } else if (data.error === "email_failed") {
          setErrorCode("email_failed");
        } else if (data.error === "validation_error") {
          setErrorCode("validation");
        } else {
          setErrorCode("generic");
        }
        setPhase("error");
        return;
      }
      if (testMode && data.next) {
        // E2E path: skip the email round-trip and land on the handler
        // page directly (the test session cookie is already set).
        window.location.href = data.next;
        return;
      }
      setPhase("sent");
    } catch {
      setErrorCode("generic");
      setPhase("error");
    }
  }

  return (
    <aside
      data-testid="claim-cta"
      className="nachi-print-hide mt-16 rounded-sm border border-primary-500/30 bg-dark-800/40 p-6"
    >
      <h2 className="text-xs uppercase tracking-[0.25em] text-primary-400">
        {labels.title}
      </h2>
      <p className="mt-2 text-sm text-dark-text-100">{labels.body}</p>
      <button
        type="button"
        data-testid="claim-cta-button"
        onClick={() => {
          setOpen(true);
          reset();
        }}
        className="mt-4 inline-block rounded-sm bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600"
      >
        {labels.buttonLabel}
      </button>

      <Modal
        open={open}
        onClose={close}
        labelledBy="claim-modal-title"
        testid="claim-modal"
      >
        {phase === "sent" ? (
          <div data-testid="claim-modal-sent">
            <h3
              id="claim-modal-title"
              className="text-xl font-serif font-light text-white"
            >
              {labels.modal.successTitle}
            </h3>
            <p className="mt-3 text-sm text-dark-text-100">
              {labels.modal.successBody}
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={close}
                data-testid="claim-modal-dismiss"
                className="rounded-sm border border-dark-700 px-4 py-2 text-sm text-dark-text-100 transition hover:border-primary-500 hover:text-primary-300"
              >
                {labels.modal.successDismiss}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} data-testid="claim-modal-form" noValidate>
            <h3
              id="claim-modal-title"
              className="text-xl font-serif font-light text-white"
            >
              {labels.modal.title}
            </h3>
            <p className="mt-2 text-sm text-dark-text-200">
              {labels.modal.intro}
            </p>

            {phase === "error" && errorCode ? (
              <div
                role="alert"
                data-testid="claim-modal-error"
                data-error-code={errorCode}
                className="mt-4 rounded-sm border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200"
              >
                {labels.modal.errors[errorCode]}
              </div>
            ) : null}

            <div className="mt-6 space-y-4">
              <Field
                label={labels.modal.email}
                name="email"
                type="email"
                autoComplete="email"
                testid="claim-modal-email"
                required
              />
              <Field
                label={labels.modal.displayName}
                name="display_name"
                type="text"
                autoComplete="name"
                testid="claim-modal-display-name"
                required
              />
              <Field
                label={labels.modal.country}
                name="country"
                type="text"
                autoComplete="country"
                testid="claim-modal-country"
                required
                maxLength={2}
                hint={labels.modal.countryHint}
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={close}
                data-testid="claim-modal-cancel"
                className="rounded-sm border border-dark-700 px-4 py-2 text-sm text-dark-text-200 transition hover:border-dark-text-100 hover:text-dark-text-100"
              >
                {labels.modal.cancel}
              </button>
              <button
                type="submit"
                disabled={phase === "submitting"}
                data-testid="claim-modal-submit"
                className="rounded-sm bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {phase === "submitting"
                  ? labels.modal.submitting
                  : labels.modal.submit}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </aside>
  );
}

interface FieldProps {
  label: string;
  name: string;
  type: string;
  autoComplete?: string;
  testid: string;
  required?: boolean;
  maxLength?: number;
  hint?: string;
}

function Field({
  label,
  name,
  type,
  autoComplete,
  testid,
  required,
  maxLength,
  hint,
}: FieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-dark-text-200">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        maxLength={maxLength}
        data-testid={testid}
        className="w-full rounded-sm border border-dark-700 bg-dark-800 px-3 py-2 text-dark-text-100 outline-none transition focus:border-primary-500"
      />
      {hint ? (
        <span className="mt-1 block text-[0.7rem] text-dark-text-200">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
