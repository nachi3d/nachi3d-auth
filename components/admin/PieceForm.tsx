"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  LICENSE_STATUSES,
  PIECE_STATUSES,
} from "@/lib/validation/piece";
import {
  createPieceAction,
  updatePieceAction,
  type ActionState,
} from "@/app/[locale]/admin/pieces/actions";
import { PhotoUploader } from "./PhotoUploader";
import type { PieceRow } from "@/lib/supabase/types";
import type { Locale } from "@/i18n/routing";

export interface PieceFormLabels {
  nfc_uid: string;
  piece_number: string;
  edition_number: string;
  edition_total: string;
  character_name: string;
  character_quote: string;
  license_status: string;
  license_notes: string;
  sculpt_date: string;
  paint_date: string;
  photos: string;
  saveDraft: string;
  publish: string;
  saved: string;
  uidLockedHint: string;
  licenseOptions: Record<(typeof LICENSE_STATUSES)[number], string>;
  photoLabels: {
    addPhotos: string;
    hero: string;
    delete: string;
    uploading: string;
    dragHint: string;
    empty: string;
    addAfterCreate: string;
  };
  errors: {
    title: string;
    fallback: string;
  };
}

interface PieceFormProps {
  mode: "create" | "edit";
  locale: Locale;
  pieceId?: string;
  initial: Partial<PieceRow> & {
    nfc_uid?: string;
    piece_number?: number;
    edition_number?: number | null;
    edition_total?: number | null;
    character_name?: string;
    character_quote?: string | null;
    license_status?: (typeof LICENSE_STATUSES)[number];
    license_notes?: string | null;
    sculpt_date?: string;
    paint_date?: string;
    photos?: string[];
    status?: (typeof PIECE_STATUSES)[number];
  };
  defaultPieceNumber: number;
  labels: PieceFormLabels;
}

const INITIAL_STATE: ActionState = { ok: false };

function nullToEmpty(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

export function PieceForm({
  mode,
  locale,
  pieceId,
  initial,
  defaultPieceNumber,
  labels,
}: PieceFormProps) {
  const initialPhotos = initial.photos ?? [];
  const [photos, setPhotos] = useState<string[]>(initialPhotos);

  const [licenseStatus, setLicenseStatus] = useState<
    (typeof LICENSE_STATUSES)[number]
  >(initial.license_status ?? "original");

  const initialStatus: (typeof PIECE_STATUSES)[number] =
    initial.status ?? "draft";
  const statusInputRef = useRef<HTMLInputElement>(null);

  const action =
    mode === "create"
      ? createPieceAction
      : updatePieceAction.bind(null, pieceId ?? "");

  const [state, formAction] = useActionState<ActionState, FormData>(
    action,
    INITIAL_STATE,
  );

  const uidLocked =
    mode === "edit" && (initial.status ?? "draft") === "published";

  const fieldErrors = state.fields ?? {};

  const setStatusBeforeSubmit = (
    nextStatus: (typeof PIECE_STATUSES)[number],
  ) => {
    if (statusInputRef.current) {
      statusInputRef.current.value = nextStatus;
    }
  };

  return (
    <form
      action={formAction}
      className="space-y-10"
      data-testid={`piece-form-${mode}`}
    >
      <input type="hidden" name="locale" value={locale} />
      <input
        ref={statusInputRef}
        type="hidden"
        name="status"
        defaultValue={initialStatus}
      />
      <input type="hidden" name="photos" value={JSON.stringify(photos)} />

      {state.message && !state.ok ? (
        <div
          data-testid="form-error"
          role="alert"
          className="rounded-sm border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200"
        >
          <p className="font-medium">{labels.errors.title}</p>
          <p className="mt-1 text-red-300">
            {state.message || labels.errors.fallback}
          </p>
        </div>
      ) : null}

      {state.ok ? (
        <p
          data-testid="form-saved"
          className="rounded-sm border border-primary-500/40 bg-primary-500/10 px-4 py-3 text-sm text-primary-400"
        >
          {labels.saved}
        </p>
      ) : null}

      <fieldset className="grid gap-6 md:grid-cols-2">
        <Field
          label={labels.nfc_uid}
          name="nfc_uid"
          defaultValue={initial.nfc_uid ?? ""}
          required
          disabled={uidLocked}
          hint={uidLocked ? labels.uidLockedHint : undefined}
          errors={fieldErrors.nfc_uid}
          testid="field-nfc_uid"
          autoCapitalize="characters"
        />
        <Field
          label={labels.piece_number}
          name="piece_number"
          type="number"
          min={1}
          defaultValue={nullToEmpty(initial.piece_number ?? defaultPieceNumber)}
          required
          errors={fieldErrors.piece_number}
          testid="field-piece_number"
        />
        <Field
          label={labels.edition_number}
          name="edition_number"
          type="number"
          min={1}
          defaultValue={nullToEmpty(initial.edition_number ?? null)}
          errors={fieldErrors.edition_number}
          testid="field-edition_number"
        />
        <Field
          label={labels.edition_total}
          name="edition_total"
          type="number"
          min={1}
          defaultValue={nullToEmpty(initial.edition_total ?? null)}
          errors={fieldErrors.edition_total}
          testid="field-edition_total"
        />
      </fieldset>

      <fieldset className="grid gap-6">
        <Field
          label={labels.character_name}
          name="character_name"
          defaultValue={initial.character_name ?? ""}
          required
          errors={fieldErrors.character_name}
          testid="field-character_name"
        />
        <TextAreaField
          label={labels.character_quote}
          name="character_quote"
          defaultValue={initial.character_quote ?? ""}
          rows={3}
          errors={fieldErrors.character_quote}
          testid="field-character_quote"
        />
      </fieldset>

      <fieldset className="grid gap-6 md:grid-cols-2">
        <SelectField
          label={labels.license_status}
          name="license_status"
          defaultValue={licenseStatus}
          onChange={(v) =>
            setLicenseStatus(v as (typeof LICENSE_STATUSES)[number])
          }
          options={LICENSE_STATUSES.map((value) => ({
            value,
            label: labels.licenseOptions[value],
          }))}
          errors={fieldErrors.license_status}
          testid="field-license_status"
        />
        {licenseStatus !== "original" ? (
          <TextAreaField
            label={labels.license_notes}
            name="license_notes"
            defaultValue={initial.license_notes ?? ""}
            rows={3}
            errors={fieldErrors.license_notes}
            testid="field-license_notes"
          />
        ) : (
          <input type="hidden" name="license_notes" value="" />
        )}
      </fieldset>

      <fieldset className="grid gap-6 md:grid-cols-2">
        <Field
          label={labels.sculpt_date}
          name="sculpt_date"
          type="date"
          defaultValue={
            initial.sculpt_date ?? new Date().toISOString().slice(0, 10)
          }
          required
          errors={fieldErrors.sculpt_date}
          testid="field-sculpt_date"
        />
        <Field
          label={labels.paint_date}
          name="paint_date"
          type="date"
          defaultValue={
            initial.paint_date ?? new Date().toISOString().slice(0, 10)
          }
          required
          errors={fieldErrors.paint_date}
          testid="field-paint_date"
        />
      </fieldset>

      <section>
        <h3 className="mb-4 text-xs uppercase tracking-[0.2em] text-dark-text-200">
          {labels.photos}
        </h3>
        {mode === "edit" && pieceId ? (
          <PhotoUploader
            pieceId={pieceId}
            initial={initialPhotos}
            onChange={setPhotos}
            labels={labels.photoLabels}
          />
        ) : (
          <p className="rounded-sm border border-dashed border-dark-700 px-4 py-6 text-center text-sm text-dark-text-200">
            {labels.photoLabels.addAfterCreate}
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-dark-700 pt-6">
        <SubmitButton
          variant="ghost"
          onClick={() => setStatusBeforeSubmit("draft")}
          testid="save-draft"
        >
          {labels.saveDraft}
        </SubmitButton>
        <SubmitButton
          variant="primary"
          onClick={() => setStatusBeforeSubmit("published")}
          testid="publish"
        >
          {labels.publish}
        </SubmitButton>
      </div>
    </form>
  );
}

interface FieldProps {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  min?: number;
  hint?: string;
  errors?: string[];
  testid?: string;
  autoCapitalize?: string;
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  disabled,
  min,
  hint,
  errors,
  testid,
  autoCapitalize,
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
        defaultValue={defaultValue}
        required={required}
        disabled={disabled}
        min={min}
        autoCapitalize={autoCapitalize}
        data-testid={testid}
        className="w-full rounded-sm border border-dark-700 bg-dark-800 px-3 py-2 text-dark-text-100 outline-none transition focus:border-primary-500 disabled:cursor-not-allowed disabled:bg-dark-900 disabled:text-dark-text-200"
      />
      {hint ? (
        <p className="mt-1 text-xs text-dark-text-200">{hint}</p>
      ) : null}
      {errors?.map((msg) => (
        <p key={msg} className="mt-1 text-xs text-red-400">
          {msg}
        </p>
      ))}
    </label>
  );
}

function TextAreaField({
  label,
  name,
  defaultValue,
  rows,
  errors,
  testid,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  rows?: number;
  errors?: string[];
  testid?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-dark-text-200">
        {label}
      </span>
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={rows ?? 3}
        data-testid={testid}
        className="w-full rounded-sm border border-dark-700 bg-dark-800 px-3 py-2 text-dark-text-100 outline-none transition focus:border-primary-500"
      />
      {errors?.map((msg) => (
        <p key={msg} className="mt-1 text-xs text-red-400">
          {msg}
        </p>
      ))}
    </label>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  onChange,
  options,
  errors,
  testid,
}: {
  label: string;
  name: string;
  defaultValue: string;
  onChange?: (v: string) => void;
  options: { value: string; label: string }[];
  errors?: string[];
  testid?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-dark-text-200">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        onChange={(e) => onChange?.(e.target.value)}
        data-testid={testid}
        className="w-full rounded-sm border border-dark-700 bg-dark-800 px-3 py-2 text-dark-text-100 outline-none transition focus:border-primary-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {errors?.map((msg) => (
        <p key={msg} className="mt-1 text-xs text-red-400">
          {msg}
        </p>
      ))}
    </label>
  );
}

function SubmitButton({
  variant,
  onClick,
  testid,
  children,
}: {
  variant: "primary" | "ghost";
  onClick: () => void;
  testid: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  const cls =
    variant === "primary"
      ? "bg-primary-500 text-white hover:bg-primary-600"
      : "border border-dark-700 text-dark-text-100 hover:border-primary-500 hover:text-primary-400";
  return (
    <button
      type="submit"
      onClick={onClick}
      disabled={pending}
      data-testid={testid}
      className={`rounded-sm px-5 py-2.5 text-sm font-medium transition disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}
