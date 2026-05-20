"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginSchema } from "@/lib/validation/login";
import { loginAction } from "@/app/[locale]/login/actions";
import {
  INITIAL_LOGIN_STATE,
  type LoginActionState,
  type LoginErrorCode,
} from "@/app/[locale]/login/state";
import type { Locale } from "@/i18n/routing";

export interface LoginFormLabels {
  email: string;
  password: string;
  submit: string;
  submitting: string;
  errors: Record<LoginErrorCode, string>;
}

interface LoginFormProps {
  locale: Locale;
  labels: LoginFormLabels;
}

export function LoginForm({ locale, labels }: LoginFormProps) {
  // Wrap the server action with a client-side zod check so invalid
  // submissions never make a network round trip. The server action
  // runs the same loginSchema as a defense-in-depth check.
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
      data-testid="login-form"
      className="space-y-6"
      noValidate
    >
      <input type="hidden" name="locale" value={locale} />

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

      <Field
        label={labels.email}
        name="email"
        type="email"
        autoComplete="email"
        testid="login-email"
        required
      />
      <Field
        label={labels.password}
        name="password"
        type="password"
        autoComplete="current-password"
        testid="login-password"
        required
      />

      <SubmitButton
        labels={{ submit: labels.submit, submitting: labels.submitting }}
      />
    </form>
  );
}

interface FieldProps {
  label: string;
  name: string;
  type: string;
  autoComplete?: string;
  testid: string;
  required?: boolean;
}

function Field({ label, name, type, autoComplete, testid, required }: FieldProps) {
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
        data-testid={testid}
        className="w-full rounded-sm border border-dark-700 bg-dark-800 px-3 py-2 text-dark-text-100 outline-none transition focus:border-primary-500"
      />
    </label>
  );
}

function SubmitButton({
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
      className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-primary-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
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
      className="h-4 w-4 animate-spin text-white"
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
