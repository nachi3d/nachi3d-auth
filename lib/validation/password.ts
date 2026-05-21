import { z } from "zod";

// Basic strength check — minimum 8 characters with at least one letter
// and one digit. Deliberately not over-engineered: a strength meter,
// breach-database lookup, or character-class mandate would push
// collectors toward a "good enough" forgotten password instead of just
// falling back to the magic link, which is the always-available
// recovery path.
//
// Error codes mirror the i18n keys under me.password.errors.* so the
// client surfaces the right localized message without re-deriving the
// reason from a free-text string.
export type PasswordErrorCode = "tooShort" | "tooWeak" | "mismatch";

export const HAS_LETTER = /\p{L}/u;
export const HAS_DIGIT = /\d/;
export const MIN_PASSWORD_LENGTH = 8;

export const passwordSetSchema = z
  .object({
    password: z.string(),
    confirm_password: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.password.length < MIN_PASSWORD_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "tooShort",
      });
      return;
    }
    if (!HAS_LETTER.test(data.password) || !HAS_DIGIT.test(data.password)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "tooWeak",
      });
      return;
    }
    if (data.password !== data.confirm_password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirm_password"],
        message: "mismatch",
      });
    }
  });

export type PasswordSetInput = z.infer<typeof passwordSetSchema>;
