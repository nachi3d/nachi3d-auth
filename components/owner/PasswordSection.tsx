"use client";

import { useState } from "react";
import type { Locale } from "@/i18n/routing";

export interface PasswordSectionLabels {
  title: string;
  helper: string;
  setButton: string;
  changeButton: string;
  alreadySet: string;
  newPasswordLabel: string;
  confirmPasswordLabel: string;
  submitButton: string;
  submitting: string;
  cancel: string;
  success: string;
  errors: {
    mismatch: string;
    tooShort: string;
    tooWeak: string;
    generic: string;
  };
}

type ErrorCode = "mismatch" | "tooShort" | "tooWeak" | "generic";

interface PasswordSectionProps {
  locale: Locale;
  hasPassword: boolean;
  labels: PasswordSectionLabels;
}

export function PasswordSection({
  locale,
  hasPassword,
  labels,
}: PasswordSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [success, setSuccess] = useState(false);
  const [hasPasswordState, setHasPasswordState] = useState(hasPassword);

  function reset() {
    setExpanded(false);
    setError(null);
    setSubmitting(false);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    const confirm_password = String(fd.get("confirm_password") ?? "");

    if (password.length < 8) {
      setError("tooShort");
      return;
    }
    if (!/\p{L}/u.test(password) || !/\d/.test(password)) {
      setError("tooWeak");
      return;
    }
    if (password !== confirm_password) {
      setError("mismatch");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/${locale}/api/me/password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, confirm_password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        field?: ErrorCode;
      };
      if (res.ok && data.ok) {
        setHasPasswordState(true);
        setSuccess(true);
        reset();
        return;
      }
      if (data.error === "weak_password") {
        setError(data.field === "tooShort" ? "tooShort" : "tooWeak");
        return;
      }
      if (data.error === "validation_error" && data.field === "mismatch") {
        setError("mismatch");
        return;
      }
      setError("generic");
    } catch {
      setError("generic");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      data-testid="me-password"
      data-has-password={hasPasswordState ? "true" : "false"}
      className="mt-10 rounded-sm border border-dark-700 bg-dark-900/40 p-6"
    >
      <h2 className="text-xs uppercase tracking-[0.25em] text-primary-400">
        {labels.title}
      </h2>
      <p className="mt-2 text-sm text-dark-text-200">{labels.helper}</p>

      {success ? (
        <div
          role="status"
          data-testid="me-password-success"
          className="mt-4 rounded-sm border border-emerald-500/40 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200"
        >
          {labels.success}
        </div>
      ) : null}

      {!expanded ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          {hasPasswordState ? (
            <p
              data-testid="me-password-summary"
              className="text-sm text-dark-text-100"
            >
              {labels.alreadySet}
            </p>
          ) : (
            <p
              data-testid="me-password-summary"
              className="text-sm text-dark-text-200"
            >
              {/* Empty span keeps the flex layout balanced when no
                  summary text is needed. */}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setExpanded(true);
              setSuccess(false);
            }}
            data-testid={
              hasPasswordState ? "me-password-change" : "me-password-set"
            }
            className="rounded-sm border border-primary-500/40 px-3 py-1.5 text-xs text-primary-300 transition hover:border-primary-500 hover:text-primary-200"
          >
            {hasPasswordState ? labels.changeButton : labels.setButton}
          </button>
        </div>
      ) : (
        <form
          onSubmit={onSubmit}
          data-testid="me-password-form"
          className="mt-4 space-y-4"
        >
          {error ? (
            <div
              role="alert"
              data-testid="me-password-error"
              data-error-code={error}
              className="rounded-sm border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200"
            >
              {labels.errors[error]}
            </div>
          ) : null}
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-dark-text-200">
              {labels.newPasswordLabel}
            </span>
            <input
              name="password"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              data-testid="me-password-input"
              className="w-full rounded-sm border border-dark-700 bg-dark-800 px-3 py-2 text-dark-text-100 outline-none transition focus:border-primary-500"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-dark-text-200">
              {labels.confirmPasswordLabel}
            </span>
            <input
              name="confirm_password"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              data-testid="me-password-confirm"
              className="w-full rounded-sm border border-dark-700 bg-dark-800 px-3 py-2 text-dark-text-100 outline-none transition focus:border-primary-500"
            />
          </label>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={reset}
              data-testid="me-password-cancel"
              className="rounded-sm border border-dark-700 px-4 py-2 text-sm text-dark-text-200 transition hover:border-dark-text-100 hover:text-dark-text-100"
            >
              {labels.cancel}
            </button>
            <button
              type="submit"
              disabled={submitting}
              data-testid="me-password-submit"
              className="rounded-sm bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? labels.submitting : labels.submitButton}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
