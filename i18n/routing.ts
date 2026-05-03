import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "fr", "ar"],
  defaultLocale: "en",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];

export const rtlLocales: ReadonlyArray<Locale> = ["ar"];

export function isRtl(locale: Locale): boolean {
  return rtlLocales.includes(locale);
}

export function isLocale(value: string | undefined): value is Locale {
  return (
    typeof value === "string" &&
    (routing.locales as ReadonlyArray<string>).includes(value)
  );
}
