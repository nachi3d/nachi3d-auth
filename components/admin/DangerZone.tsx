"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { deletePieceAction } from "@/app/[locale]/admin/pieces/actions";
import {
  INITIAL_DELETE_STATE,
  type DeleteActionState,
} from "@/app/[locale]/admin/pieces/state";
import type { Locale } from "@/i18n/routing";

export interface DangerZoneLabels {
  sectionTitle: string;
  subtitle: string;
  body: string;
  openButton: string;
  modalTitle: string;
  modalPrompt: string;
  inputLabel: string;
  confirm: string;
  deleting: string;
  cancel: string;
  errorFallback: string;
}

interface DangerZoneProps {
  pieceId: string;
  pieceNumber: number;
  locale: Locale;
  labels: DangerZoneLabels;
}

/**
 * Danger zone at the bottom of the edit page. Click "Delete" to open
 * a typed-confirmation modal; the confirm button stays disabled until
 * the typed value matches the piece_number (forgiving leading zeros
 * so both "1" and "0001" are valid for piece #0001).
 *
 * Submission goes to deletePieceAction via useActionState. On success
 * the action redirects, so this component never renders state.ok=true.
 */
export function DangerZone({
  pieceId,
  pieceNumber,
  locale,
  labels,
}: DangerZoneProps) {
  const [open, setOpen] = useState(false);

  return (
    <section
      data-testid="danger-zone"
      className="mt-16 rounded-sm border border-accent-500/60 bg-accent-500/5 p-6"
    >
      <p className="mb-1 text-xs uppercase tracking-[0.25em] text-accent-500">
        {labels.sectionTitle}
      </p>
      <h2 className="text-lg font-medium text-accent-400">
        {labels.subtitle}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-accent-400/90">
        {labels.body}
      </p>
      <button
        type="button"
        data-testid="danger-zone-open"
        onClick={() => setOpen(true)}
        className="mt-5 inline-flex items-center rounded-sm bg-accent-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60"
      >
        {labels.openButton}
      </button>

      {open ? (
        <DeleteModal
          pieceId={pieceId}
          pieceNumber={pieceNumber}
          locale={locale}
          labels={labels}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </section>
  );
}

interface DeleteModalProps {
  pieceId: string;
  pieceNumber: number;
  locale: Locale;
  labels: DangerZoneLabels;
  onClose: () => void;
}

function DeleteModal({
  pieceId,
  pieceNumber,
  locale,
  labels,
  onClose,
}: DeleteModalProps) {
  const action = deletePieceAction.bind(null, pieceId);
  const [state, formAction] = useActionState<DeleteActionState, FormData>(
    action,
    INITIAL_DELETE_STATE,
  );

  const [typed, setTyped] = useState("");
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // Forgiving match: trim whitespace, strip leading zeros, then compare
  // numerically. "0001" and "1" both match piece_number=1. An empty
  // string never matches.
  const normalized = typed.trim().replace(/^0+/, "");
  const matches = normalized !== "" && normalized === String(pieceNumber);

  // Focus the input on open and let Esc cancel.
  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      data-testid="delete-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${inputId}-title`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
    >
      <form
        action={formAction}
        className="w-full max-w-md rounded-sm border border-accent-500/60 bg-dark-900 p-6 shadow-2xl"
        data-testid="delete-modal-form"
      >
        <input type="hidden" name="locale" value={locale} />

        <h3
          id={`${inputId}-title`}
          className="text-lg font-medium text-accent-400"
        >
          {labels.modalTitle}
        </h3>
        <p className="mt-2 text-sm text-dark-text-200">
          {labels.modalPrompt}
        </p>

        <label className="mt-5 block">
          <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-dark-text-200">
            {labels.inputLabel}
          </span>
          <input
            ref={inputRef}
            id={inputId}
            name="confirm_piece_number"
            type="text"
            inputMode="numeric"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            data-testid="delete-modal-input"
            data-matches={matches ? "true" : "false"}
            autoComplete="off"
            className="w-full rounded-sm border border-dark-700 bg-dark-800 px-3 py-2 font-mono text-dark-text-100 outline-none transition focus:border-accent-500"
          />
        </label>

        {state.error && state.error !== "ok" ? (
          <p
            data-testid="delete-modal-error"
            data-error-code={state.error}
            role="alert"
            className="mt-4 rounded-sm border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-200"
          >
            {state.message ?? labels.errorFallback}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            data-testid="delete-modal-cancel"
            onClick={onClose}
            className="rounded-sm border border-dark-700 px-4 py-2 text-sm text-dark-text-100 transition hover:border-primary-500 hover:text-primary-400"
          >
            {labels.cancel}
          </button>
          <ConfirmButton
            disabled={!matches}
            confirmLabel={labels.confirm}
            deletingLabel={labels.deleting}
          />
        </div>
      </form>
    </div>
  );
}

function ConfirmButton({
  disabled,
  confirmLabel,
  deletingLabel,
}: {
  disabled: boolean;
  confirmLabel: string;
  deletingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      data-testid="delete-modal-confirm"
      className="inline-flex items-center gap-2 rounded-sm bg-accent-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <>
          <Spinner />
          <span>{deletingLabel}</span>
        </>
      ) : (
        <span>{confirmLabel}</span>
      )}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      aria-hidden="true"
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
