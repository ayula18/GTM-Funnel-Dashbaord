/**
 * Merger & Acquisition helpers.
 *
 * Apollo's "Subsidiary of" column is captured verbatim into `companies.subsidiary_of`
 * in the format "Parent Name (parentdomain.com)" — e.g. "Stripe (stripe.com)".
 * This is our M&A / acquisition signal: the company is owned by / was acquired by
 * the named parent. We surface it as a tag but DO NOT merge or discard such a
 * company — an acquired company with its own domain stays a separate, sellable
 * entity (e.g. VMware under Broadcom).
 */

export interface ParentInfo {
  name: string;
  domain: string | null;
}

/**
 * Parse a `subsidiary_of` value into structured parent info.
 *
 *   "Stripe (stripe.com)"          → { name: "Stripe", domain: "stripe.com" }
 *   "Codota Dot Com Ltd. (codota.com)" → { name: "Codota Dot Com Ltd.", domain: "codota.com" }
 *   "Some Holding Co"              → { name: "Some Holding Co", domain: null }
 *   null / "" / "N/A"             → null
 */
export function parseSubsidiaryOf(value: string | null | undefined): ParentInfo | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw || /^(n\/?a|none|null|-)$/i.test(raw)) return null;

  const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) {
    const name = m[1].trim();
    const domain = m[2].trim().toLowerCase() || null;
    return { name: name || (domain ?? raw), domain };
  }
  return { name: raw, domain: null };
}

/** True if this company is an acquisition / subsidiary of another company. */
export function isAcquired(subsidiaryOf: string | null | undefined): boolean {
  return parseSubsidiaryOf(subsidiaryOf) !== null;
}
