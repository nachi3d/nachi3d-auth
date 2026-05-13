import { z } from "zod";

const HEX_RE = /^[0-9a-fA-F]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const LICENSE_STATUSES = [
  "original",
  "public_domain",
  "commission",
  "licensed",
  "other",
] as const;

export const PIECE_STATUSES = ["draft", "published", "archived"] as const;

const optionalPositiveInt = z
  .union([z.literal(""), z.null(), z.coerce.number().int().positive()])
  .transform((v) => (typeof v === "number" ? v : null));

const optionalString = (max: number) =>
  z
    .union([z.literal(""), z.null(), z.string().trim().max(max)])
    .transform((v) =>
      typeof v === "string" && v.length > 0 ? v : null,
    );

export const photoUrlSchema = z
  .string()
  .url()
  .max(2048, "Photo URL too long");

const baseFields = {
  nfc_uid: z
    .string()
    .min(8, "NFC UID is too short")
    .max(64, "NFC UID is too long")
    .regex(HEX_RE, "NFC UID must be hexadecimal")
    .transform((v) => v.toUpperCase()),

  piece_number: z.coerce
    .number({ invalid_type_error: "Piece number must be a number" })
    .int("Piece number must be a whole number")
    .positive("Piece number must be greater than zero"),

  edition_number: optionalPositiveInt,
  edition_total: optionalPositiveInt,

  character_name: z
    .string()
    .trim()
    .min(1, "Character name is required")
    .max(200, "Character name is too long"),

  character_quote: optionalString(500),

  license_status: z.enum(LICENSE_STATUSES, {
    errorMap: () => ({ message: "Pick a license status" }),
  }),

  license_notes: optionalString(2000),

  sculpt_date: z
    .string()
    .regex(ISO_DATE_RE, "Sculpt date must be YYYY-MM-DD"),

  paint_date: z
    .string()
    .regex(ISO_DATE_RE, "Paint date must be YYYY-MM-DD"),

  photos: z.array(photoUrlSchema).max(20, "Up to 20 photos per piece"),

  status: z.enum(PIECE_STATUSES),

  show_in_gallery: z.boolean().default(true),
};

const editionPairCheck = (data: {
  edition_number: number | null;
  edition_total: number | null;
}) => {
  const bothPresent =
    data.edition_number !== null && data.edition_total !== null;
  const bothAbsent =
    data.edition_number === null && data.edition_total === null;
  return bothPresent || bothAbsent;
};

const editionRangeCheck = (data: {
  edition_number: number | null;
  edition_total: number | null;
}) => {
  if (data.edition_number === null || data.edition_total === null) return true;
  return data.edition_number <= data.edition_total;
};

const dateOrderCheck = (data: { sculpt_date: string; paint_date: string }) => {
  return data.paint_date >= data.sculpt_date;
};

const licenseNotesPresenceCheck = (data: {
  license_status: (typeof LICENSE_STATUSES)[number];
  license_notes: string | null;
}) => {
  if (data.license_status === "original") return true;
  return data.license_notes !== null && data.license_notes.length > 0;
};

export const pieceSchema = z
  .object(baseFields)
  .refine(editionPairCheck, {
    message: "Provide both edition number and total, or leave both blank",
    path: ["edition_total"],
  })
  .refine(editionRangeCheck, {
    message: "Edition number cannot exceed the edition total",
    path: ["edition_number"],
  })
  .refine(dateOrderCheck, {
    message: "Paint date cannot be earlier than sculpt date",
    path: ["paint_date"],
  })
  .refine(licenseNotesPresenceCheck, {
    message: "Add a note when the license is not 'original'",
    path: ["license_notes"],
  });

export type PieceInput = z.infer<typeof pieceSchema>;

// For UPDATE: same shape, but every field is optional. Refines are applied
// only when both halves of a paired check are present.
export const piecePatchSchema = z
  .object({
    nfc_uid: baseFields.nfc_uid.optional(),
    piece_number: baseFields.piece_number.optional(),
    edition_number: baseFields.edition_number.optional(),
    edition_total: baseFields.edition_total.optional(),
    character_name: baseFields.character_name.optional(),
    character_quote: baseFields.character_quote.optional(),
    license_status: baseFields.license_status.optional(),
    license_notes: baseFields.license_notes.optional(),
    sculpt_date: baseFields.sculpt_date.optional(),
    paint_date: baseFields.paint_date.optional(),
    photos: baseFields.photos.optional(),
    status: baseFields.status.optional(),
    show_in_gallery: baseFields.show_in_gallery.optional(),
  })
  .refine(
    (data) =>
      data.edition_number === undefined && data.edition_total === undefined
        ? true
        : editionPairCheck({
            edition_number: data.edition_number ?? null,
            edition_total: data.edition_total ?? null,
          }),
    {
      message: "Provide both edition number and total, or leave both blank",
      path: ["edition_total"],
    },
  )
  .refine(
    (data) =>
      data.edition_number === undefined && data.edition_total === undefined
        ? true
        : editionRangeCheck({
            edition_number: data.edition_number ?? null,
            edition_total: data.edition_total ?? null,
          }),
    {
      message: "Edition number cannot exceed the edition total",
      path: ["edition_number"],
    },
  )
  .refine(
    (data) =>
      data.sculpt_date === undefined && data.paint_date === undefined
        ? true
        : dateOrderCheck({
            sculpt_date: data.sculpt_date ?? "0000-01-01",
            paint_date: data.paint_date ?? "9999-12-31",
          }),
    {
      message: "Paint date cannot be earlier than sculpt date",
      path: ["paint_date"],
    },
  );

export type PiecePatch = z.infer<typeof piecePatchSchema>;
