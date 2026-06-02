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
    const timeoutId  = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(`https://${domain}`, {
      signal: controller.signal,
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    clearTimeout(timeoutId);

    if (res.status >= 400 && res.status < 500 && res.status !== 403) {
      await setCachedScrape(domain, null, null, 'domain_dead');
      return { domain, html: null, status: 'domain_dead', error: `HTTP ${res.status}` };
    }

    const html = await res.text();
    await setCachedScrape(domain, html, null, 'success');
    return { domain, html, status: 'success' };
  } catch (error: any) {
    // Try Jina fallback
    try {
      const jinaController = new AbortController();
      const jinaTimeoutId  = setTimeout(() => jinaController.abort(), 20000);

      const res = await fetch(`https://r.jina.ai/https://${domain}`, {
        signal:  jinaController.signal,
        headers: { 'Accept': 'text/plain' },
      });

      clearTimeout(jinaTimeoutId);

      if (!res.ok) throw new Error(`Jina failed with status ${res.status}`);

      const text = await res.text();
      await setCachedScrape(domain, text, text, 'success');
      return { domain, html: text, status: 'success' };
    } catch (jinaError: any) {
      const isDead =
        error.message?.includes('ENOTFOUND')          ||
        error.message?.includes('ECONNREFUSED')        ||
        error.message?.includes('ERR_NAME_NOT_RESOLVED');

      const status = isDead ? 'domain_dead' : 'failed';
      await setCachedScrape(domain, null, null, status);
      return { domain, html: null, status, error: error.message };
    }
  }
}
