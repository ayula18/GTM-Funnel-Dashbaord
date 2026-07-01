/**
 * Currency → USD normalization for funding amounts.  PURE module (no DB/server
 * imports) so it's safe to import anywhere.
 *
 * Crunchbase reports "Total Funding Amount" in each company's LOCAL currency.
 * The importer historically stripped the symbol and stored the raw number, so a
 * ₩150B raise looked like 150,000,000,000 "dollars". This module converts a
 * local amount to USD using a STATIC rate table — funding only drives coarse
 * $-band bucketing, so exact daily FX is unnecessary and a fixed table keeps
 * imports deterministic + dependency-free. Update USD_PER_UNIT periodically.
 */

// USD value of ONE unit of each currency:  usd = localAmount * USD_PER_UNIT[code]
export const USD_PER_UNIT: Record<string, number> = {
  USD: 1,
  EUR: 1.08, GBP: 1.27, CHF: 1.12,
  CAD: 0.73, AUD: 0.66, NZD: 0.61,
  SGD: 0.74, HKD: 0.128, TWD: 0.031,
  JPY: 0.0067, CNY: 0.14,
  KRW: 0.00075, INR: 0.012,
  IDR: 0.0000625, THB: 0.029, VND: 0.00004, PHP: 0.018, MYR: 0.22,
  ILS: 0.27, AED: 0.27, SAR: 0.27,
  BRL: 0.18, MXN: 0.05, ARS: 0.0011,
  ZAR: 0.055, NGN: 0.00065,
  SEK: 0.095, NOK: 0.092, DKK: 0.145, PLN: 0.25, CZK: 0.043, HUF: 0.0028,
  RUB: 0.011, TRY: 0.029, UAH: 0.024,
};

// Unambiguous currency symbols → ISO code. ($ and ¥ are intentionally OMITTED —
// $ is USD/CAD/AUD/SGD/HKD/…, ¥ is JPY OR CNY — too ambiguous to trust.)
const SYMBOL_TO_CODE: Array<[string, string]> = [
  ['₩', 'KRW'], ['€', 'EUR'], ['£', 'GBP'], ['₹', 'INR'],
  ['₪', 'ILS'], ['฿', 'THB'], ['₫', 'VND'], ['₱', 'PHP'],
  ['₺', 'TRY'], ['₦', 'NGN'], ['R$', 'BRL'], ['zł', 'PLN'],
];

// Country (case-insensitive substring) → ISO currency code.
const COUNTRY_RULES: Array<[RegExp, string]> = [
  [/korea/i, 'KRW'], [/japan/i, 'JPY'], [/\bindia\b/i, 'INR'],
  [/china|\bprc\b/i, 'CNY'], [/taiwan/i, 'TWD'], [/hong\s*kong/i, 'HKD'],
  [/singapore/i, 'SGD'], [/indonesia/i, 'IDR'], [/thailand/i, 'THB'],
  [/vietnam/i, 'VND'], [/philippines/i, 'PHP'], [/malaysia/i, 'MYR'],
  [/israel/i, 'ILS'], [/emirates|\buae\b|dubai|abu dhabi/i, 'AED'],
  [/saudi/i, 'SAR'], [/brazil|brasil/i, 'BRL'], [/mexico|méxico/i, 'MXN'],
  [/argentina/i, 'ARS'], [/south africa/i, 'ZAR'], [/nigeria/i, 'NGN'],
  [/sweden/i, 'SEK'], [/norway/i, 'NOK'], [/denmark/i, 'DKK'],
  [/poland/i, 'PLN'], [/czech/i, 'CZK'], [/hungary/i, 'HUF'],
  [/russia/i, 'RUB'], [/turkey|türkiye/i, 'TRY'], [/ukraine/i, 'UAH'],
  [/switzerland|\bswiss\b/i, 'CHF'],
  [/canada/i, 'CAD'], [/australia/i, 'AUD'], [/new zealand/i, 'NZD'],
  // Eurozone
  [/germany|france|spain|italy|netherlands|ireland|belgium|austria|portugal|finland|greece|luxembourg|estonia|latvia|lithuania|slovakia|slovenia|croatia|cyprus|malta/i, 'EUR'],
  // English-speaking / USD-parity — explicit so inference returns "no convert".
  [/united kingdom|england|scotland|wales|britain|\buk\b|\bgb\b/i, 'GBP'],
  [/united states|\busa\b|america/i, 'USD'],
];

/** Normalize a free-text code to a KNOWN ISO code, or null. */
export function knownCurrency(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  return c in USD_PER_UNIT ? c : null;
}

export function currencyFromSymbol(raw: string | null | undefined): string | null {
  if (!raw) return null;
  for (const [sym, code] of SYMBOL_TO_CODE) if (raw.includes(sym)) return code;
  return null;
}

export function currencyFromCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  for (const [re, code] of COUNTRY_RULES) if (re.test(country)) return code;
  return null;
}

/**
 * Best-guess currency for a funding cell, in priority order:
 *   explicit code column → unambiguous symbol → country → null (treat as USD).
 */
export function inferCurrency(opts: {
  code?: string | null;     // value of a "currency" column, e.g. "KRW"
  raw?: string | null;      // raw funding cell (may contain a symbol)
  country?: string | null;  // company_country
}): string | null {
  return knownCurrency(opts.code) ?? currencyFromSymbol(opts.raw) ?? currencyFromCountry(opts.country);
}

/** Convert a local-currency amount to USD. Unknown/USD currency → unchanged. */
export function toUsd(amount: number, currency: string | null | undefined): number {
  const code = knownCurrency(currency);
  if (!code || code === 'USD') return amount;
  return Math.round(amount * USD_PER_UNIT[code]);
}

/**
 * Currencies whose rate differs from USD by ≥10× — the ones safe to auto-fix in
 * the existing-data backfill (KRW, JPY, INR, IDR, VND, …). Near-parity
 * currencies (EUR/GBP/CAD) are left alone there to avoid corrupting rows that
 * were already stored in USD.
 */
export function isHighFactorCurrency(currency: string | null | undefined): boolean {
  const code = knownCurrency(currency);
  return code != null && USD_PER_UNIT[code] <= 0.1; // ≥10 local units per USD
}
