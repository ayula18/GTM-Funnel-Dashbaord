import { ClassificationResult, ExtractedSignals } from '../types';

// Values the LLM sometimes drops into the company_name field when it has no
// real name for a dead/unknown domain — typically by echoing the DECISION
// ("Review") or the classification ("Not Relevant") into the name slot. These
// are NEVER valid company names and must never be written.
const BOGUS_LLM_NAMES = new Set([
  'review', 'yes', 'no', 'unknown', 'n/a', 'na', 'none', 'null', 'nil',
  'not relevant', 'devtool', 'it services & solutions', 'it services',
  'maybe', 'pending', 'tbd', 'tba', 'unnamed', 'company', 'undefined',
]);

/**
 * Is the LLM-provided name a REAL company name we can store? Rejects the
 * sentinel/decision values above, empty/too-short strings, and a name that's
 * just the domain echoed back.
 */
function isUsableLlmName(name: string | null | undefined, domain: string): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  if (n.length < 2) return false;
  if (BOGUS_LLM_NAMES.has(n)) return false;
  if (n === domain.trim().toLowerCase()) return false;
  return true;
}

// ── Canonical classification values ────────────────────────────────────
// Used to determine whether the LLM returned a known classification value
// (which the hard rules handle) vs a non-standard one (edge case).
const CANONICAL_CLASSIFICATIONS = new Set([
  'DevTool', 'DevTools',
  'IT Services & Solutions',
  'Not Relevant',
]);

/**
 * Compute ICP Fit Level from classification + confidence.
 *
 * The fit level is a DERIVED metric — never asked from the LLM directly.
 * It tells sales/GTM how strong a match this company is to Reo.Dev's ICP:
 *
 *   High   — DevTool company, classification is confident
 *   Medium — DevTool w/ some ambiguity, OR IT Services (secondary ICP)
 *   Low    — Low-confidence classification, or IT Services w/ ambiguity
 *   Review — Couldn't determine, needs human review
 *   Not a Fit — Confirmed Not Relevant (not ICP)
 */
function computeIcpFitLevel(
  decision: string,
  classification: string | undefined,
  confidence: string,
): string {
  if (decision === 'No')     return 'Not a Fit';
  if (decision === 'Review') return 'Review';

  // decision === 'Yes'
  const cls = (classification || '').trim();

  if (cls === 'DevTool' || cls === 'DevTools') {
    if (confidence === 'High')   return 'High';
    if (confidence === 'Medium') return 'Medium';
    return 'Low';
  }

  if (cls === 'IT Services & Solutions') {
    // IT Services are ICP but secondary — cap at Medium
    if (confidence === 'High')   return 'Medium';
    return 'Low';
  }

  // Non-standard classification but decision is Yes — treat conservatively
  return 'Medium';
}

export function parseClassificationOutput(
  llmResult: ClassificationResult | null,
  signals: ExtractedSignals,
  existing?: { company_name?: string | null },
): Record<string, unknown> {
  const updateData: Record<string, unknown> = {
    scrape_status: signals.scrape_status,
    observations: signals.observations,
    classified_at: new Date().toISOString()
  };

  // If scraping failed AND no LLM result → Review, NEVER No
  if (signals.scrape_status === 'domain_dead' && !llmResult) {
    return {
      ...updateData,
      icp_decision: 'Review',
      icp_fit_level: 'Review',
      company_classification: 'Not Relevant',
      category: 'Unknown',
      classification_reason: 'Domain is dead or unreachable. Needs manual verification.',
      needs_manual_review: 1
    };
  }

  if (!llmResult) {
    return {
      ...updateData,
      icp_decision: 'Review',
      icp_fit_level: 'Review',
      needs_manual_review: 1,
      classification_reason: 'Classification failed — no LLM response.'
    };
  }

  // Populate data from LLM response
  updateData.company_classification = llmResult.company_classification;
  updateData.category = llmResult.category;
  updateData.sub_category = llmResult.sub_category;
  updateData.company_type = llmResult.company_type;
  updateData.classification_reason = llmResult.reason;
  
  if (llmResult.confidence) {
    updateData.confidence = llmResult.confidence;
  }
  
  // company_name is the source of truth from the CSV upload. The classifier may
  // only FILL it when it's currently empty, and only with a REAL name — it must
  // never overwrite a user-provided name, and never write a sentinel value like
  // "Review" (which is exactly how good names were getting clobbered).
  const existingName = (existing?.company_name ?? '').trim();
  const llmName      = (llmResult.company_name ?? '').trim();
  if (!existingName && isUsableLlmName(llmName, signals.domain)) {
    updateData.company_name = llmName;
  }

  if (llmResult.is_nonprofit !== undefined) {
    updateData.is_nonprofit = llmResult.is_nonprofit ? 1 : 0;
  }

  // ── Determine ICP Decision ────────────────────────────────────────
  // The LLM returns is_icp as "Yes" | "No" | "Review" (string)
  // Apply hard rules to enforce consistency:

  let decision: string;
  const classification = llmResult.company_classification;

  if (classification === 'DevTool' || classification === 'DevTools') {
    // DevTool is ALWAYS ICP Yes, regardless of what LLM said for is_icp
    decision = 'Yes';
  } else if (classification === 'IT Services & Solutions') {
    // IT Services is ALWAYS ICP Yes
    decision = 'Yes';
  } else if (classification === 'Not Relevant') {
    // Not Relevant is ALWAYS ICP No
    decision = 'No';
  } else if (llmResult.is_icp === 'Review' || llmResult.is_icp === null) {
    // LLM couldn't determine
    decision = 'Review';
  } else {
    // Fallback: trust the LLM's direct answer
    decision = String(llmResult.is_icp);
    // Normalize legacy boolean responses
    if (decision === 'true') decision = 'Yes';
    if (decision === 'false') decision = 'No';
  }

  updateData.icp_decision = decision;

  // ── Safety Net 1: Classification ↔ is_icp contradiction ───────────
  // Instead of fragile substring matching on the reason text, check the
  // LLM's OWN is_icp field against the hard-rule-derived decision. If
  // the hard rules forced the decision to differ from the LLM's is_icp
  // (e.g. classification="DevTool" but is_icp="No"), the LLM
  // contradicted itself — flag for manual review.
  //
  // This is far more robust than checking if the reason text contains
  // phrases like "not relevant" (which caused false positives when the
  // LLM used the phrase in passing, e.g. "unlike marketing tools which
  // are not relevant, this product targets engineering teams").
  const llmSaidIcp = String(llmResult.is_icp ?? '').trim();
  if (
    decision === 'Yes' &&
    CANONICAL_CLASSIFICATIONS.has(classification || '') &&
    (llmSaidIcp === 'No' || llmSaidIcp === 'false')
  ) {
    // The LLM classified as DevTool/IT Services (→ hard-rule forced Yes)
    // but its is_icp field said No — genuine contradiction.
    decision = 'Review';
    updateData.icp_decision = 'Review';
    updateData.needs_manual_review = 1;
    updateData.confidence = 'Low';
    updateData.classification_reason =
      `[AUTO-FLAGGED: is_icp="${llmSaidIcp}" contradicts classification="${classification}"] ${llmResult.reason}`;
  }

  // ── Safety Net 2: Low confidence + No (PRECISION-TUNED) ───────────
  // The OLD rule converted EVERY Low-confidence "No" to "Review". This
  // produced hundreds of unnecessary manual reviews on lists where the
  // LLM correctly identified non-dev companies (fintech, healthtech,
  // HR tools) but marked confidence Low due to thin scrape data.
  //
  // NEW rule: trust the LLM when classification and decision are
  // CONSISTENT. "Not Relevant" + "No" = the LLM's logic is internally
  // consistent — the low confidence is about the DATA quality, not the
  // reasoning quality. Only escalate when:
  //   a) Classification is non-standard (not one of the 3 canonical
  //      values) AND decision is "No" AND confidence is "Low" — the LLM
  //      returned something unexpected and we can't validate its logic.
  //   b) Classification is a positive class (DevTool/IT Services) but
  //      decision is "No" — this can't happen via hard rules, but
  //      catch it as a fallback for non-canonical class values.
  const confidence = String(updateData.confidence || llmResult.confidence || '').trim();
  if (confidence === 'Low' && decision === 'No') {
    if (!CANONICAL_CLASSIFICATIONS.has(classification || '')) {
      // Non-standard classification + No + Low confidence → ambiguous,
      // needs human eyes.
      decision = 'Review';
      updateData.icp_decision = 'Review';
      updateData.needs_manual_review = 1;
    }
    // If classification IS "Not Relevant" + decision IS "No" →
    // consistent and trustworthy. Do NOT override.
  }

  // ── Compute ICP Fit Level ─────────────────────────────────────────
  // Derived from classification + confidence. Gives GTM a quick signal
  // on how strong the ICP match is without reading the full reason.
  updateData.icp_fit_level = computeIcpFitLevel(
    decision,
    classification,
    confidence,
  );

  // ── Set manual review flag ────────────────────────────────────────
  if (decision === 'Review') {
    updateData.needs_manual_review = 1;
  } else {
    updateData.needs_manual_review = 0;
  }

  return updateData;
}
