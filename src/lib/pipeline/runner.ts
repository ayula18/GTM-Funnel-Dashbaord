import {
  getUnclassifiedCompanies, updateCompany, markClassificationFailed,
  getFunnelClassificationStatus, updateFunnelClassification,
  updateFunnelClassificationProgress, computeDiscardReasons,
} from '../db';
import { scrapeHomepage } from './scraper';
import { extractSignals } from './signal-extractor';
import { classifyCompany } from './classifier';
import { parseClassificationOutput } from './output-parser';
import { errorMessage } from '../utils';

export interface BatchResult {
  done: boolean;          // no unclassified companies remain (or stopped)
  stopped: boolean;       // ended because the user clicked Stop
  completed: number;      // cumulative classified in this run
  total: number;          // total to classify this run
  processedThisCall: number;
  errors: string[];
}

const BATCH_SIZE = 5;

/**
 * Classify ONE company. ALWAYS marks the company as attempted (success OR
 * failure) so it leaves the unclassified queue — this is what makes the loop
 * terminating and idempotent. A failure never crashes the batch and never
 * causes a re-fetch loop; it's flagged for manual review instead.
 */
async function classifyOne(company: Record<string, unknown>, apiKey: string): Promise<{ domain: string; error?: string }> {
  const id     = company.id as number;
  const domain = company.domain as string;
  try {
    const scrape  = await scrapeHomepage(domain);
    const signals = extractSignals(domain, scrape.html || '');
    if (scrape.status !== 'success') signals.scrape_status = scrape.status;

    const llmResult  = await classifyCompany(signals, apiKey);
    // Pass the existing row so the parser can protect the upload-provided
    // company_name (fill-empty only — never clobber it with an LLM sentinel).
    const updateData = parseClassificationOutput(llmResult, signals, {
      company_name: company.company_name as string | null,
    });
    await updateCompany(id, updateData);
    return { domain };
  } catch (err) {
    const msg = errorMessage(err);
    // Mark attempted so it can't be re-processed forever.
    try { await markClassificationFailed(id, msg); } catch { /* last resort: still don't loop */ }
    return { domain, error: msg };
  }
}

/**
 * Process classification for up to `budgetMs` of wall-clock time, then return
 * progress. The caller (the API route, driven by the client) re-invokes until
 * `done`. This keeps every request short enough for serverless and makes Stop
 * instant — there is no long-lived background task to orphan.
 */
export async function processClassificationBatch(
  funnelId: number,
  apiKey: string,
  budgetMs = 45_000,
): Promise<BatchResult> {
  const start = Date.now();
  const errors: string[] = [];
  let processedThisCall = 0;

  const status0 = await getFunnelClassificationStatus(funnelId);
  let completed = Number(status0?.classification_completed) || 0;
  const total   = Number(status0?.classification_total) || 0;

  while (Date.now() - start < budgetMs) {
    // Honour an external Stop (the stop route sets status to 'idle').
    const cur = await getFunnelClassificationStatus(funnelId);
    if (cur?.classification_status !== 'running') {
      return { done: true, stopped: true, completed, total, processedThisCall, errors };
    }

    const companies = await getUnclassifiedCompanies(funnelId, BATCH_SIZE);
    if (companies.length === 0) {
      // Done — recompute drop-offs and idle out.
      try { await computeDiscardReasons(funnelId); } catch { /* non-fatal */ }
      await updateFunnelClassification(funnelId, 'idle', completed, total, '');
      return { done: true, stopped: false, completed, total, processedThisCall, errors };
    }

    const results = await Promise.all(companies.map(c => classifyOne(c, apiKey)));
    for (const r of results) {
      completed++;
      processedThisCall++;
      if (r.error) errors.push(`${r.domain}: ${r.error}`);
    }

    const lastDomain = (companies[companies.length - 1].domain as string) || '';
    await updateFunnelClassificationProgress(funnelId, completed, total, lastDomain);
  }

  // Budget exhausted — more remain; caller will continue.
  return { done: false, stopped: false, completed, total, processedThisCall, errors };
}
