import { z } from "zod";

// Empty strings → null (the dashboard form's clear-the-field gesture).
// Non-empty values: display_name capped at 80 chars; country must be a
// 2-letter ISO-3166-1 alpha-2 code (uppercased).
export const profilePatchSchema = z.object({
  display_name: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const trimmed = v.trim();
      return trimmed.length === 0 ? null : trimmed;
    })
    .pipe(
      z
        .string()
        .max(80, "Display name is too long")
        .nullable(),
    ),
  country: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const trimmed = v.trim();
      return trimmed.length === 0 ? null : trimmed.toUpperCase();
    })
    .pipe(
      z
        .string()
        .length(2, "Country must be an ISO-3166-1 alpha-2 code")
        .nullable(),
    ),
});

export type ProfilePatchInput = z.infer<typeof profilePatchSchema>;
