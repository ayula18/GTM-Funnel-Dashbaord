import { ClassificationResult, ExtractedSignals } from '../types';

export function parseClassificationOutput(
  llmResult: ClassificationResult | null, 
  signals: ExtractedSignals
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
  
  if (llmResult.company_name) {
    updateData.company_name = llmResult.company_name;
  }

  if (llmResult.is_nonprofit !== undefined) {
    updateData.is_nonprofit = llmResult.is_nonprofit ? 1 : 0;
  }

  // ── Determine ICP Decision ────────────────────────────────────────
  // The LLM returns is_icp as "Yes" | "No" | "Review" (string)
  // Apply hard rules to enforce consistency:

  let decision: string;
  const classification = llmResult.company_classification;

  if (classification === 'DevTool') {
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

  // ── Safety Net 1: Self-contradiction detection ────────────────────
  // If the LLM wrote "Not Relevant" in the reason text but classified
  // as DevTool or IT Services, the LLM contradicted itself. Override
  // to Review so a human can resolve it.
  const reasonText = (llmResult.reason || '').toLowerCase();
  if (
    decision === 'Yes' &&
    (reasonText.includes('not relevant') || reasonText.includes('not in the engineering function') || reasonText.includes('not icp'))
  ) {
    decision = 'Review';
    updateData.icp_decision = 'Review';
    updateData.needs_manual_review = 1;
    updateData.confidence = 'Low';
    updateData.classification_reason =
      `[AUTO-FLAGGED: reason contradicts classification] ${llmResult.reason}`;
  }

  // ── Safety Net 2: Low confidence + No = too risky ─────────────────
  // We'd rather spend 30 seconds reviewing than lose a potential lead.
  if (updateData.confidence === 'Low' && decision === 'No') {
    decision = 'Review';
    updateData.icp_decision = 'Review';
    updateData.needs_manual_review = 1;
  }

  // Set manual review flag
  if (decision === 'Review') {
    updateData.needs_manual_review = 1;
  } else {
    updateData.needs_manual_review = 0;
  }

  return updateData;
}
