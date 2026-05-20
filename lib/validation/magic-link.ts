import { z } from "zod";
import { routing } from "@/i18n/routing";

export const magicLinkInitiateSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Invalid email address")
    .max(254, "Email is too long")
    .transform((v) => v.toLowerCase()),
  locale: z.enum(routing.locales as unknown as [string, ...string[]]),
});

export type MagicLinkInitiateInput = z.infer<typeof magicLinkInitiateSchema>;
