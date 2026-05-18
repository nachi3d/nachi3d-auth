import { z } from "zod";
import { isLocale } from "@/i18n/routing";

export const claimInitiateSchema = z.object({
  piece_id: z.string().uuid("piece_id must be a UUID"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Invalid email address")
    .max(254, "Email is too long")
    .transform((v) => v.toLowerCase()),
  display_name: z
    .string()
    .trim()
    .min(1, "Display name is required")
    .max(80, "Display name is too long"),
  country: z
    .string()
    .trim()
    .length(2, "Country must be an ISO-3166-1 alpha-2 code")
    .transform((v) => v.toUpperCase()),
  locale: z
    .string()
    .refine((v) => isLocale(v), { message: "Unknown locale" }),
});

export type ClaimInitiateInput = z.infer<typeof claimInitiateSchema>;
