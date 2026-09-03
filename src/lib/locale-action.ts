"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, LOCALES, type Locale } from "./i18n";

/**
 * Sets the locale cookie. Next re-renders the current route in the same
 * roundtrip, so no explicit revalidation is needed.
 */
export async function setLocale(formData: FormData): Promise<void> {
  const next = String(formData.get("locale"));
  if (!LOCALES.includes(next as Locale)) return;

  (await cookies()).set(LOCALE_COOKIE, next, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
