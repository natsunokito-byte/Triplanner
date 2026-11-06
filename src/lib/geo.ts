// Place labels (country names from Unicode CLDR) + country -> currency. Search itself is /api/destination (Google).

export type Place = {
  name: string;
  admin1?: string;
  country?: string;
  country_code?: string;
};

/**
 * Label = name, region, country. The COUNTRY comes from the ISO code via Unicode CLDR (Intl.DisplayNames), not from the
 * geocoder's text — so Taiwan (TW) is always shown as a country ("台灣" / "Taiwan"), never "…省, 台湾".
 * Taiwan's "province" admin level (GeoNames data) is dropped, and "A or B" alternates keep only the first.
 */
export function formatPlaceLabel(r: Place, locale: "zh-TW" | "en"): string {
  let country = r.country;
  if (r.country_code) {
    try {
      country = new Intl.DisplayNames([locale], { type: "region" }).of(r.country_code.toUpperCase()) ?? country;
    } catch { /* keep the geocoder's text */ }
  }
  let admin = r.admin1?.split(/\s+or\s+/)[0]?.trim();
  if (r.country_code?.toUpperCase() === "TW" && admin && /省|province/i.test(admin)) admin = undefined;
  return [r.name, admin && admin !== r.name ? admin : null, country].filter(Boolean).join(", ");
}

// ISO 3166-1 alpha-2 -> ISO 4217. Covers common travel destinations; unknown => USD (user can override).
const CURRENCY: Record<string, string> = {
  JP: "JPY", TW: "TWD", KR: "KRW", CN: "CNY", HK: "HKD", MO: "MOP", SG: "SGD", TH: "THB", VN: "VND", MY: "MYR",
  ID: "IDR", PH: "PHP", IN: "INR", LK: "LKR", NP: "NPR", AE: "AED", TR: "TRY", IL: "ILS", SA: "SAR", QA: "QAR",
  US: "USD", CA: "CAD", MX: "MXN", BR: "BRL", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN",
  GB: "GBP", CH: "CHF", NO: "NOK", SE: "SEK", DK: "DKK", IS: "ISK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON",
  AU: "AUD", NZ: "NZD", ZA: "ZAR", EG: "EGP", MA: "MAD", KE: "KES",
  // Eurozone
  AT: "EUR", BE: "EUR", HR: "EUR", CY: "EUR", EE: "EUR", FI: "EUR", FR: "EUR", DE: "EUR", GR: "EUR", IE: "EUR",
  IT: "EUR", LV: "EUR", LT: "EUR", LU: "EUR", MT: "EUR", NL: "EUR", PT: "EUR", SK: "EUR", SI: "EUR", ES: "EUR",
};

export const currencyForCountry = (cc?: string) => (cc ? CURRENCY[cc.toUpperCase()] ?? "USD" : "USD");

export const allTimezones = (): string[] => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
};

export const allCurrencies = (): string[] => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("currency");
  } catch {
    return ["USD", "JPY", "TWD", "EUR"];
  }
};
