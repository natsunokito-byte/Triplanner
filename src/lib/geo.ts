// Destination search (Open-Meteo geocoding, no API key) + country -> currency.

export type Place = {
  id: number;
  name: string;
  admin1?: string;
  country?: string;
  country_code?: string;
  timezone: string;
  label: string; // "Tokyo, Japan"
};

export async function searchPlaces(q: string, lang: "zh" | "en", signal?: AbortSignal): Promise<Place[]> {
  if (q.trim().length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=${lang}&format=json`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const json = await res.json();
  return ((json.results ?? []) as Omit<Place, "label">[]).map((r) => ({
    ...r,
    label: [r.name, r.admin1 && r.admin1 !== r.name ? r.admin1 : null, r.country].filter(Boolean).join(", "),
  }));
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
