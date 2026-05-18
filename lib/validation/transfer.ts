import { z } from "zod";
import { isLocale } from "@/i18n/routing";

export const transferInitiateSchema = z.object({
  piece_id: z.string().uuid("piece_id must be a UUID"),
  to_email: z
    .string()
    .trim()
    .min(1, "Recipient email is required")
    .email("Invalid email address")
    .max(254, "Recipient email is too long")
    .transform((v) => v.toLowerCase()),
  note: z
    .string()
    .max(500, "Note is too long (max 500 chars)")
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v : undefined)),
  locale: z
    .string()
    .refine((v) => isLocale(v), { message: "Unknown locale" }),
});

export type TransferInitiateInput = z.infer<typeof transferInitiateSchema>;

export const transferRevokeSchema = z.object({
  transfer_id: z.string().uuid("transfer_id must be a UUID"),
});

export type TransferRevokeInput = z.infer<typeof transferRevokeSchema>;
