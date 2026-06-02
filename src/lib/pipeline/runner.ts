import { getUnclassifiedCompanies, updateCompany, getFunnelClassificationStatus, updateFunnelClassification, updateFunnelClassificationProgress, computeDiscardReasons } from '../db';
import { scrapeHomepage } from './scraper';
import { extractSignals } from './signal-extractor';
import { classifyCompany } from './classifier';
import { parseClassificationOutput } from './output-parser';
import { PipelineProgress } from '../types';

export async function* runPipeline(funnelId: number, apiKey: string, totalCount: number): AsyncGenerator<PipelineProgress> {
  const batchSize = 5;
  let totalProcessed = 0;
  const errors: string[] = [];

  await updateFunnelClassification(funnelId, 'running', 0, totalCount, '');

  while (true) {
    const statusRow = await getFunnelClassificationStatus(funnelId);
    // If the UI set the status to idle (user clicked stop) or something else broke it, abort.
    if (statusRow?.classification_status !== 'running') {
      await updateFunnelClassification(funnelId, 'idle', totalProcessed, totalCount, '');
      break;
    }

    const companies = await getUnclassifiedCompanies(funnelId, batchSize);
    if (companies.length === 0) break;

    const promises = companies.map(async (company) => {
      const domain = company.domain as string;
      const id     = company.id     as number;

      try {
        const scrapeResult = await scrapeHomepage(domain);

        const html    = scrapeResult.html || '';
        const signals = extractSignals(domain, html);
        if (scrapeResult.status !== 'success') {
          signals.scrape_status = scrapeResult.status;
        }

        const hasAnyContent =
          signals.page_text.trim().length   > 20 ||
          signals.nav_text.trim().length    > 10 ||
          signals.footer_text.trim().length > 10;

        let llmResult = null;
        if (signals.scrape_status === 'domain_dead' && !hasAnyContent) {
          llmResult = await classifyCompany(signals, apiKey);
        } else {
          llmResult = await classifyCompany(signals, apiKey);
        }

        const updateData = parseClassificationOutput(llmResult, signals);
        await updateCompany(id, updateData);

        return { domain, status: 'success' as const };
      } catch (err: any) {
        return { domain, status: 'error' as const, error: err.message };
      }
    });

    const results = await Promise.all(promises);

    for (const res of results) {
      totalProcessed++;
      if (res.status === 'error') {
        errors.push(`${res.domain}: ${res.error}`);
      }

      await updateFunnelClassificationProgress(funnelId, totalProcessed, totalCount, res.domain);

      yield {
        funnel_id:      funnelId,
        total:          totalCount,
        completed:      totalProcessed,
        current_domain: res.domain,
        status:         'running',
        errors:         [...errors],
      };
    }
  }

  // Classification changed icp_decision for many companies — recompute the
  // funnel drop-off reasons so the Discarded view / discard_step stay accurate.
  try {
    await computeDiscardReasons(funnelId);
  } catch (e) {
    console.error('computeDiscardReasons after classification failed:', e);
  }

  await updateFunnelClassification(funnelId, 'idle', totalProcessed, totalCount, '');

  yield {
    funnel_id:      funnelId,
    total:          totalCount,
    completed:      totalProcessed,
    current_domain: '',
    status:         'completed',
    errors,
  };
}
