"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { loginSchema } from "@/lib/validation/login";
import { loginAction } from "@/app/[locale]/login/actions";
import {
  INITIAL_LOGIN_STATE,
  type LoginActionState,
  type LoginErrorCode,
} from "@/app/[locale]/login/state";
import type { Locale } from "@/i18n/routing";

export type MagicLinkErrorCode = "emailValidation" | "rateLimit" | "generic";

export interface LoginFormLabels {
  email: string;
  password: string;
  divider: string;
  submit: string;
  submitting: string;
  errors: Record<LoginErrorCode, string>;
  magicLink: {
    heading: string;
    helper: string;
    cta: string;
    sending: string;
    success: string;
    resend: string;
    /** Template containing the literal `{seconds}` placeholder. */
    resendIn: string;
    errors: {
      emailValidation: string;
      rateLimit: string;
      generic: string;
    };
  };
  passwordSection: {
    heading: string;
    helper: string;
  };
}

interface LoginFormProps {
  locale: Locale;
  labels: LoginFormLabels;
}

const RESEND_COOLDOWN_SECONDS = 60;

export function LoginForm({ locale, labels }: LoginFormProps) {
  // Shared email state — the magic-link primary input is the source of
  // truth; the hidden password-form mirror is kept in sync so the form
  // action sees the same value the collector typed up top.
  const [email, setEmail] = useState("");

  return (
    <div className="space-y-8" data-testid="login-form">
      <MagicLinkSection
        locale={locale}
        email={email}
        onEmailChange={setEmail}
        labels={labels}
      />
      <Divider label={labels.divider} />
      <PasswordSection locale={locale} email={email} labels={labels} />
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div
      className="relative flex items-center"
      data-testid="login-divider"
      aria-hidden
    >
      <div className="h-px flex-1 bg-dark-700" />
      <span className="mx-3 text-[0.65rem] uppercase tracking-[0.3em] text-dark-text-200">
        {label}
      </span>
      <div className="h-px flex-1 bg-dark-700" />
    </div>
  );
}

function MagicLinkSection({
  locale,
  email,
  onEmailChange,
  labels,
}: {
  locale: Locale;
  email: string;
  onEmailChange: (v: string) => void;
  labels: LoginFormLabels;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<MagicLinkErrorCode | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Tick the resend cooldown down to zero, then null the interval out.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => {
      setCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function send(currentEmail: string) {
    setError(null);

    const parsed = z_emailOnly(currentEmail);
    if (!parsed.ok) {
      setError("emailValidation");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/login/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: parsed.value, locale }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (res.ok && data.ok) {
        setSent(true);
        setCooldown(RESEND_COOLDOWN_SECONDS);
        return;
      }
      if (res.status === 429 || data.error === "rate_limit") {
        setError("rateLimit");
        return;
      }
      if (data.error === "validation_error") {
        setError("emailValidation");
        return;
      }
      setError("generic");
    } catch {
      setError("generic");
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void send(email);
  }

  function onResend() {
    if (cooldown > 0) return;
    void send(email);
  }

  return (
    <form
      onSubmit={onSubmit}
      data-testid="login-magic-link-form"
      className="space-y-4"
      noValidate
    >
      <header>
        <h2 className="text-sm font-medium text-white">
          {labels.magicLink.heading}
        </h2>
        <p className="mt-1 text-xs text-dark-text-200">
          {labels.magicLink.helper}
        </p>
      </header>

      {error ? (
        <div
          data-testid="login-magic-link-error"
          data-error-code={error}
          role="alert"
          className="rounded-sm border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200"
        >
          {labels.magicLink.errors[error]}
        </div>
      ) : null}

      {sent ? (
        <div
          data-testid="login-magic-link-success"
          role="status"
          className="rounded-sm border border-primary-500/40 bg-primary-950/20 px-4 py-3 text-sm text-primary-200"
        >
          {labels.magicLink.success}
        </div>
      ) : null}

      <label className="block">
        <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-dark-text-200">
          {labels.email} *
        </span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          disabled={sent || submitting}
          data-testid="login-email"
          className="w-full rounded-sm border border-dark-700 bg-dark-800 px-3 py-2 text-dark-text-100 outline-none transition focus:border-primary-500 disabled:opacity-60"
        />
      </label>

      {sent ? (
        <button
          type="button"
          onClick={onResend}
          disabled={cooldown > 0 || submitting}
          data-testid="login-magic-link-resend"
          className="text-xs text-primary-400 underline-offset-2 transition hover:text-primary-300 hover:underline disabled:cursor-not-allowed disabled:text-dark-text-200 disabled:no-underline"
        >
          {cooldown > 0
            ? labels.magicLink.resendIn.replace("{seconds}", String(cooldown))
            : labels.magicLink.resend}
        </button>
      ) : (
        <button
          type="submit"
          disabled={submitting}
          data-testid="login-magic-link-submit"
          className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-primary-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Spinner />
              <span>{labels.magicLink.sending}</span>
            </>
          ) : (
            <span>{labels.magicLink.cta}</span>
          )}
        </button>
      )}
    </form>
  );
}

function PasswordSection({
  locale,
  email,
  labels,
}: {
  locale: Locale;
  email: string;
  labels: LoginFormLabels;
}) {
  const [state, formAction] = useActionState<LoginActionState, FormData>(
    async (prev, formData) => {
      const parsed = loginSchema.safeParse({
        email: formData.get("email"),
        password: formData.get("password"),
      });
      if (!parsed.success) {
        return { ok: false, error: "validation" as const };
      }
      return loginAction(prev, formData);
    },
    INITIAL_LOGIN_STATE,
  );

  const inlineError = state.error ?? null;

  return (
    <form
      action={formAction}
      data-testid="login-password-form"
      className="space-y-4"
      noValidate
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="email" value={email} />

      <header>
        <h2 className="text-sm font-medium text-white">
          {labels.passwordSection.heading}
        </h2>
        <p className="mt-1 text-xs text-dark-text-200">
          {labels.passwordSection.helper}
        </p>
      </header>

      {inlineError ? (
        <div
          data-testid="login-error"
          data-error-code={inlineError}
          role="alert"
          className="rounded-sm border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200"
        >
          {labels.errors[inlineError]}
        </div>
      ) : null}

      <label className="block">
        <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-dark-text-200">
          {labels.password} *
        </span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          data-testid="login-password"
          className="w-full rounded-sm border border-dark-700 bg-dark-800 px-3 py-2 text-dark-text-100 outline-none transition focus:border-primary-500"
        />
      </label>

      <PasswordSubmit
        labels={{ submit: labels.submit, submitting: labels.submitting }}
      />
    </form>
  );
}

function PasswordSubmit({
  labels,
}: {
  labels: { submit: string; submitting: string };
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="login-submit"
      className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-primary-500/40 bg-transparent px-5 py-2 text-sm font-medium text-primary-200 transition hover:border-primary-500 hover:bg-primary-950/30 hover:text-primary-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <>
          <Spinner />
          <span>{labels.submitting}</span>
        </>
      ) : (
        <span>{labels.submit}</span>
      )}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      data-testid="login-spinner"
      className="h-4 w-4 animate-spin text-current"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

// Tiny inline email check so we don't pull zod into the client bundle
// just for the magic-link section. Mirrors the server-side rule:
// trim, non-empty, reasonable length, contains @ and a dot.
function z_emailOnly(raw: string): { ok: true; value: string } | { ok: false } {
  const v = raw.trim().toLowerCase();
  if (v.length === 0 || v.length > 254) return { ok: false };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { ok: false };
  return { ok: true, value: v };
}
