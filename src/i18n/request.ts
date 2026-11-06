import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const locales = ["zh-TW", "en"] as const;
export type Locale = (typeof locales)[number];

export default getRequestConfig(async () => {
  const store = await cookies();
  const c = store.get("locale")?.value;
  const locale: Locale = c === "en" ? "en" : "zh-TW";
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
});
