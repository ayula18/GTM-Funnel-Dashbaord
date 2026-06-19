import { getCachedScrape, setCachedScrape } from '../db';
import { ScrapeResult } from '../types';

export async function scrapeHomepage(domain: string): Promise<ScrapeResult> {
  const cached = await getCachedScrape(domain);
  if (cached) {
    return {
      domain: cached.domain,
      html:   cached.status === 'success' ? cached.html : null,
      status: cached.status as ScrapeResult['status'],
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 10000); // 10s hard cap

    let fetchError: unknown;
    let html: string | null = null;

    try {
      const res = await fetch(`https://${domain}`, {
        signal: controller.signal,
        headers: {
          'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Cache-Control':   'no-cache',
        },
        redirect: 'follow',
      });
      clearTimeout(timeoutId);

      // 4xx (except 403 Forbidden which may still have content) = dead domain
      if (res.status >= 400 && res.status < 500 && res.status !== 403) {
        await setCachedScrape(domain, null, null, 'domain_dead');
        return { domain, html: null, status: 'domain_dead', error: `HTTP ${res.status}` };
      }

      html = await res.text();
    } catch (err) {
      clearTimeout(timeoutId);
      fetchError = err;
    }

    // ── Direct fetch succeeded ─────────────────────────────────────────────
    if (html !== null) {
      await setCachedScrape(domain, html, null, 'success');
      return { domain, html, status: 'success' };
    }

    // ── Direct fetch failed — categorise the error ─────────────────────────
    const errMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
    const isAbort   = fetchError instanceof Error && fetchError.name === 'AbortError';
    const isDead    = errMsg.includes('ENOTFOUND') || errMsg.includes('ECONNREFUSED') || errMsg.includes('ERR_NAME_NOT_RESOLVED');
    const isBlocked = errMsg.includes('403') || errMsg.includes('certificate') || errMsg.includes('SSL');

    // Hard dead domain — DNS failure. Don't bother with Jina.
    if (isDead) {
      await setCachedScrape(domain, null, null, 'domain_dead');
      return { domain, html: null, status: 'domain_dead', error: errMsg };
    }

    // Timeout (AbortError) or known block — try Jina AI as fallback (it renders JS & bypasses blocks)
    // Skip Jina for clear certificate / SSL errors (Jina won't help either).
    if (!isBlocked) {
      try {
        const jinaController = new AbortController();
        const jinaTimeoutId  = setTimeout(() => jinaController.abort(), 12000); // 12s for Jina

        const jinaRes = await fetch(`https://r.jina.ai/https://${domain}`, {
          signal:  jinaController.signal,
          headers: { 'Accept': 'text/plain' },
        });
        clearTimeout(jinaTimeoutId);

        if (jinaRes.ok) {
          const text = await jinaRes.text();
          if (text && text.length > 100) { // sanity check — ignore empty/error pages
            await setCachedScrape(domain, text, text, 'success');
            return { domain, html: text, status: 'success' };
          }
        }
      } catch { /* Jina failed — fall through to blocked/failed */ }
    }

    // Couldn't scrape by any means. Mark as 'blocked' for timed-out/firewall domains
    // (the classifier will use LLM training knowledge as fallback).
    const finalStatus = isAbort ? 'blocked' : 'failed';
    await setCachedScrape(domain, null, null, finalStatus);
    return { domain, html: null, status: finalStatus, error: isAbort ? 'Request timed out' : errMsg };
  } catch (err) {
    // Unexpected error path (should not happen — all branches above are caught)
    const msg = err instanceof Error ? err.message : String(err);
    await setCachedScrape(domain, null, null, 'failed');
    return { domain, html: null, status: 'failed', error: msg };
  }
}
