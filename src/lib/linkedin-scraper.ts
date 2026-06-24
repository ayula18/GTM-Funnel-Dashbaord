/**
 * LinkedIn comment HTML parser.
 * Ported from the standalone linkedin-html-scraper.jsx,
 * adapted as a pure-function module so it can be used across
 * client components without duplicating logic.
 */

export interface ScrapedProfile {
  name: string;
  slug: string;
  url: string;
  comment: string;
  headline: string;
  isReply: boolean;
}

export interface ScrapedReaction {
  name: string;
  slug: string;
  url: string;
  reactionType: string;
}

/**
 * Extracts profiles + comments from raw LinkedIn comments HTML
 * (the outerHTML of the comments container).
 */
export function extractProfiles(html: string): ScrapedProfile[] {
  const results: ScrapedProfile[] = [];

  // Split HTML into individual comment articles
  const articleParts = html.split(/<article\s+class="comments-comment-entity/i);

  // Skip first part (before first article)
  for (let i = 1; i < articleParts.length; i++) {
    const chunk = articleParts[i];

    // 1. EXTRACT NAME from comments-comment-meta__description-title
    let name = "";
    const nameMatch = chunk.match(
      /class="comments-comment-meta__description-title">\s*(?:<!---->)?\s*([^<]+?)\s*(?:<!---->)?\s*<\/span>/i
    );
    if (nameMatch) {
      name = nameMatch[1].trim();
    }

    // 2. EXTRACT PROFILE SLUG from first linkedin.com/in/ href
    let slug = "";
    const slugMatch = chunk.match(
      /href="(?:https?:\/\/(?:www\.)?linkedin\.com)?\/in\/([a-zA-Z0-9\-_%]+)\/?\"/i
    );
    if (slugMatch) {
      slug = decodeURIComponent(slugMatch[1]).replace(/\/+$/, "");
    }

    if (!slug) continue;

    // Fallback name from slug
    if (!name) {
      name = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    }

    // 3. EXTRACT COMMENT TEXT from update-components-text
    let comment = "";
    const commentMatch = chunk.match(
      /class="update-components-text[^"]*"[^>]*>\s*<span\s+dir="ltr">([\s\S]*?)<\/span>\s*<\/div>/i
    );
    if (commentMatch) {
      let raw = commentMatch[1];
      // Remove @mention links
      raw = raw.replace(/<span><a[^>]*>(?:<!---->)?[^<]*(?:<!---->)?<\/a><\/span>/gi, "");
      // Remove remaining HTML tags
      raw = raw.replace(/<[^>]+>/g, " ");
      // Clean entities and whitespace
      raw = raw
        .replace(/<!---->/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
      comment = raw;
    }

    // 4. EXTRACT HEADLINE from description-subtitle
    let headline = "";
    const headlineMatch = chunk.match(
      /class="comments-comment-meta__description-subtitle">\s*([\s\S]*?)\s*<\/div>/i
    );
    if (headlineMatch) {
      headline = headlineMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    // 5. Check if reply
    const isReply = /comments-comment-entity--reply/.test(chunk.substring(0, 200));

    results.push({
      name,
      slug,
      url: `https://www.linkedin.com/in/${slug}/`,
      comment: comment.slice(0, 500),
      headline,
      isReply,
    });
  }

  return results;
}

/**
 * Extracts reactions from raw LinkedIn reactions HTML (facepile list).
 */
export function extractReactions(html: string): ScrapedReaction[] {
  const results: ScrapedReaction[] = [];

  // Split HTML into individual reaction items
  const liParts = html.split(/<li[^>]*class="[^"]*social-details-reactors-[^"]*list-item[^"]*"[^>]*>/i);

  // Skip first part
  for (let i = 1; i < liParts.length; i++) {
    const chunk = liParts[i];

    // 1. EXTRACT SLUG
    let slug = "";
    const slugMatch = chunk.match(
      /href="(?:https?:\/\/(?:www\.)?linkedin\.com)?\/in\/([a-zA-Z0-9\-_%]+)\/?\"/i
    );
    if (slugMatch) {
      slug = decodeURIComponent(slugMatch[1]).replace(/\/+$/, "");
    }
    if (!slug) continue;

    // 2. EXTRACT NAME AND REACTION
    let name = "";
    let reactionType = "UNKNOWN";

    const ariaMatch = chunk.match(/aria-label="View\s+(.+?)’s.*?,\s+reacted with\s+([A-Z]+)[^"]*"/i);
    if (ariaMatch) {
      name = ariaMatch[1].trim();
      reactionType = ariaMatch[2].toUpperCase().trim();
    } else {
      const viewProfileMatch = chunk.match(/<span class="visually-hidden">View\s+(.+?)’s profile<\/span>/i);
      const titleMatch = chunk.match(/<span class="text-view-model"[^>]*>(.+?)<\/span>/i);
      const titleLockupMatch = chunk.match(/<div[^>]*class="artdeco-entity-lockup__title"[^>]*>[\s\S]*?([A-Za-z\s]+)\s*<\/div>/i);
      
      if (viewProfileMatch) {
        name = viewProfileMatch[1].trim();
      } else if (titleMatch) {
        name = titleMatch[1].trim();
      } else if (titleLockupMatch) {
        name = titleLockupMatch[1].trim();
      } else {
        // Fallback name from slug
        name = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      }
      
      // Fallback reaction type from data-test-reactions-icon-type
      const typeMatch = chunk.match(/data-test-reactions-icon-type="([A-Z]+)"/i);
      if (typeMatch) {
        reactionType = typeMatch[1].toUpperCase().trim();
      }
    }

    results.push({
      name,
      slug,
      url: `https://www.linkedin.com/in/${slug}/`,
      reactionType
    });
  }

  return results;
}

/**
 * De-duplicate profiles by slug. For the same person commenting multiple
 * times, we keep the FIRST comment + aggregate a comment count.
 */
export interface UniqueProfile {
  name: string;
  slug: string;
  url: string;
  headline: string;
  commentCount: number;
  latestComment: string;
  hasReply: boolean;
  // Enrichment fields (filled after CSV upload)
  company?: string;
  domain?: string;
  isIcp?: boolean | null;
}

export function deduplicateProfiles(profiles: ScrapedProfile[]): UniqueProfile[] {
  const map = new Map<string, UniqueProfile>();

  for (const p of profiles) {
    const existing = map.get(p.slug);
    if (existing) {
      existing.commentCount++;
      if (!existing.hasReply && p.isReply) existing.hasReply = true;
    } else {
      map.set(p.slug, {
        name: p.name,
        slug: p.slug,
        url: p.url,
        headline: p.headline,
        commentCount: 1,
        latestComment: p.comment,
        hasReply: p.isReply,
      });
    }
  }

  return Array.from(map.values());
}

/**
 * Generates a CSV string for download.
 */
export function generateCsv(profiles: ScrapedProfile[], includeReplies: boolean): string {
  const filtered = includeReplies ? profiles : profiles.filter(p => !p.isReply);
  const header = "Name,Profile URL,Headline,Comment,Is Reply";
  const esc = (s: string) => '"' + (s || "").replace(/"/g, '""') + '"';
  const rows = filtered.map(p =>
    [esc(p.name), esc(p.url), esc(p.headline), esc(p.comment), p.isReply ? "Yes" : "No"].join(",")
  );
  return "\uFEFF" + [header, ...rows].join("\n");
}

/**
 * Generates a CSV of unique profiles (for enrichment upload to Clay etc.)
 */
export function generateUniqueProfilesCsv(profiles: UniqueProfile[]): string {
  const header = "Name,Profile URL,Slug,Headline,Comment Count";
  const esc = (s: string) => '"' + (s || "").replace(/"/g, '""') + '"';
  const rows = profiles.map(p =>
    [esc(p.name), esc(p.url), esc(p.slug), esc(p.headline), String(p.commentCount)].join(",")
  );
  return "\uFEFF" + [header, ...rows].join("\n");
}

/** Console script for auto-loading all LinkedIn comments */
export const CONSOLE_SCRIPT = `// LinkedIn Auto-Load All Comments
// Paste in Chrome DevTools Console (F12 > Console)
(async () => {
  let totalClicks = 0;
  const click = async () => {
    const btns = [...document.querySelectorAll('button')].filter(b =>
      b.offsetParent !== null &&
      (b.textContent.toLowerCase().includes('load more') ||
       b.textContent.toLowerCase().includes('previous') ||
       b.textContent.toLowerCase().includes('more comments') ||
       b.textContent.toLowerCase().includes('view more'))
    );
    const replyBtns = [...document.querySelectorAll('button')].filter(b =>
      b.offsetParent !== null &&
      b.textContent.toLowerCase().includes('repl') &&
      b.textContent.match(/\\d/)
    );
    for (const btn of [...btns, ...replyBtns]) {
      btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(r => setTimeout(r, 300));
      btn.click();
      totalClicks++;
      console.log('Clicked #' + totalClicks + ': ' + btn.textContent.trim().slice(0,40));
      await new Promise(r => setTimeout(r, 1500));
    }
    return btns.length + replyBtns.length;
  };
  console.log('Starting... do NOT close this tab.');
  let empty = 0;
  while (empty < 5) {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise(r => setTimeout(r, 800));
    (await click()) === 0 ? empty++ : empty = 0;
  }
  console.log('DONE! ' + totalClicks + ' clicks. Now copy outerHTML of comments section.');
})();`;
