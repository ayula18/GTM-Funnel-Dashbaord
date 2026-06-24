/**
 * Database module for Comment Intelligence.
 *
 * Tables: linkedin_posts, linkedin_profiles, linkedin_comments
 * All persisted in the same Postgres instance as the rest of the GTM Engine.
 */
import { qp, withTx } from './core';

// ── Schema bootstrap ──────────────────────────────────────────────────

export async function ensureCommentTables() {
  await qp(`
    CREATE TABLE IF NOT EXISTS linkedin_posts (
      id            SERIAL PRIMARY KEY,
      campaign_tag  TEXT NOT NULL,
      post_url      TEXT NOT NULL,
      post_title    TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      last_scraped  TIMESTAMPTZ,
      UNIQUE(campaign_tag, post_url)
    )
  `);

  await qp(`
    CREATE TABLE IF NOT EXISTS linkedin_profiles (
      id                          SERIAL PRIMARY KEY,
      slug                        TEXT NOT NULL UNIQUE,
      name                        TEXT NOT NULL,
      headline                    TEXT,
      profile_url                 TEXT NOT NULL,
      profile_image               TEXT,
      parsed_company              TEXT,
      parsed_designation          TEXT,
      enriched_company_name       TEXT,
      enriched_company_domain     TEXT,
      enriched_company_linkedin   TEXT,
      icp_status                  TEXT,
      company_id                  INTEGER,
      created_at                  TIMESTAMPTZ DEFAULT NOW(),
      updated_at                  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await qp(`
    CREATE TABLE IF NOT EXISTS linkedin_comments (
      id            SERIAL PRIMARY KEY,
      post_id       INTEGER NOT NULL REFERENCES linkedin_posts(id) ON DELETE CASCADE,
      profile_id    INTEGER NOT NULL REFERENCES linkedin_profiles(id),
      comment_text  TEXT,
      is_reply      BOOLEAN DEFAULT FALSE,
      scraped_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(post_id, profile_id, comment_text)
    )
  `);

  // Index for fast campaign-level queries
  await qp(`CREATE INDEX IF NOT EXISTS idx_lp_campaign ON linkedin_posts(campaign_tag)`);
  await qp(`CREATE INDEX IF NOT EXISTS idx_lc_post ON linkedin_comments(post_id)`);
  await qp(`CREATE INDEX IF NOT EXISTS idx_lc_profile ON linkedin_comments(profile_id)`);
  await qp(`CREATE INDEX IF NOT EXISTS idx_lpro_icp ON linkedin_profiles(icp_status)`);
  await qp(`CREATE INDEX IF NOT EXISTS idx_lpro_domain ON linkedin_profiles(enriched_company_domain)`);
}

// ── Posts CRUD ─────────────────────────────────────────────────────────

export interface LIPost {
  id: number;
  campaign_tag: string;
  post_url: string;
  post_title: string | null;
  created_at: string;
  last_scraped: string | null;
  comment_count?: number;
  profile_count?: number;
}

export async function createPost(campaignTag: string, postUrl: string, postTitle?: string): Promise<LIPost> {
  const rows = await qp<LIPost>(
    `INSERT INTO linkedin_posts (campaign_tag, post_url, post_title)
     VALUES ($1, $2, $3)
     ON CONFLICT (campaign_tag, post_url) DO UPDATE SET post_title = COALESCE(EXCLUDED.post_title, linkedin_posts.post_title)
     RETURNING *`,
    [campaignTag, postUrl, postTitle || null]
  );
  return rows[0];
}

export async function getPostsByCampaign(campaignTag: string): Promise<LIPost[]> {
  return qp<LIPost>(
    `SELECT p.*,
            COUNT(DISTINCT c.id) AS comment_count,
            COUNT(DISTINCT c.profile_id) AS profile_count
     FROM linkedin_posts p
     LEFT JOIN linkedin_comments c ON c.post_id = p.id
     WHERE p.campaign_tag = $1
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
    [campaignTag]
  );
}

export async function deletePost(postId: number): Promise<void> {
  await qp(`DELETE FROM linkedin_posts WHERE id = $1`, [postId]);
}

export async function updatePostTitle(postId: number, postTitle: string): Promise<void> {
  await qp(`UPDATE linkedin_posts SET post_title = $1 WHERE id = $2`, [postTitle || null, postId]);
}

export async function getAllCampaignTags(): Promise<string[]> {
  const rows = await qp<{ campaign_tag: string }>(
    `SELECT DISTINCT campaign_tag FROM linkedin_posts ORDER BY campaign_tag`
  );
  return rows.map(r => r.campaign_tag);
}

// ── Profile upsert ────────────────────────────────────────────────────

export interface LIProfile {
  id: number;
  slug: string;
  name: string;
  headline: string | null;
  profile_url: string;
  profile_image: string | null;
  parsed_company: string | null;
  parsed_designation: string | null;
  enriched_company_name: string | null;
  enriched_company_domain: string | null;
  enriched_company_linkedin: string | null;
  icp_status: string | null;
  company_id: number | null;
  created_at: string;
  updated_at: string;
  comment_count?: number;
  campaigns?: string;
}

export async function upsertProfile(
  slug: string,
  name: string,
  headline: string | null,
  profileUrl: string,
  profileImage: string | null,
  parsedCompany: string | null,
  parsedDesignation: string | null,
): Promise<LIProfile> {
  const rows = await qp<LIProfile>(
    `INSERT INTO linkedin_profiles (slug, name, headline, profile_url, profile_image, parsed_company, parsed_designation)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (slug) DO UPDATE SET
       name = COALESCE(NULLIF(EXCLUDED.name, ''), linkedin_profiles.name),
       headline = COALESCE(NULLIF(EXCLUDED.headline, ''), linkedin_profiles.headline),
       profile_image = COALESCE(NULLIF(EXCLUDED.profile_image, ''), linkedin_profiles.profile_image),
       parsed_company = COALESCE(NULLIF(EXCLUDED.parsed_company, ''), linkedin_profiles.parsed_company),
       parsed_designation = COALESCE(NULLIF(EXCLUDED.parsed_designation, ''), linkedin_profiles.parsed_designation),
       updated_at = NOW()
     RETURNING *`,
    [slug, name, headline, profileUrl, profileImage, parsedCompany, parsedDesignation]
  );
  return rows[0];
}

// ── Comment insert (dedup) ────────────────────────────────────────────

export async function insertComment(
  postId: number,
  profileId: number,
  commentText: string | null,
  isReply: boolean,
): Promise<{ inserted: boolean }> {
  try {
    await qp(
      `INSERT INTO linkedin_comments (post_id, profile_id, comment_text, is_reply)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (post_id, profile_id, comment_text) DO NOTHING`,
      [postId, profileId, commentText, isReply]
    );
    return { inserted: true };
  } catch {
    return { inserted: false };
  }
}

// ── Batch scrape ingest ───────────────────────────────────────────────

export interface ScrapeIngestResult {
  totalExtracted: number;
  newProfiles: number;
  newComments: number;
  duplicateComments: number;
}

export async function ingestScrape(
  postId: number,
  profiles: Array<{
    slug: string;
    name: string;
    headline: string;
    url: string;
    profile_image?: string;
    comment: string;
    is_reply: boolean;
    parsed_company?: string;
    parsed_designation?: string;
  }>,
): Promise<ScrapeIngestResult> {
  const result: ScrapeIngestResult = {
    totalExtracted: profiles.length,
    newProfiles: 0,
    newComments: 0,
    duplicateComments: 0,
  };

  if (profiles.length === 0) return result;

  await withTx(async (client) => {
    // ── Step 1: Bulk upsert all profiles in one query ────────────────
    const uniqueProfilesMap = new Map<string, typeof profiles[0]>();
    for (const p of profiles) {
      if (!uniqueProfilesMap.has(p.slug)) {
        uniqueProfilesMap.set(p.slug, p);
      }
    }
    const uniqueProfiles = Array.from(uniqueProfilesMap.values());

    const slugs: string[] = [];
    const names: string[] = [];
    const headlines: (string | null)[] = [];
    const urls: string[] = [];
    const images: (string | null)[] = [];
    const companies: (string | null)[] = [];
    const designations: (string | null)[] = [];

    for (const p of uniqueProfiles) {
      slugs.push(p.slug);
      names.push(p.name);
      headlines.push(p.headline || null);
      urls.push(p.url);
      images.push(p.profile_image || null);
      companies.push(p.parsed_company || null);
      designations.push(p.parsed_designation || null);
    }

    const profileResult = await client.query(
      `INSERT INTO linkedin_profiles (slug, name, headline, profile_url, profile_image, parsed_company, parsed_designation)
       SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])
       ON CONFLICT (slug) DO UPDATE SET
         name = COALESCE(NULLIF(EXCLUDED.name, ''), linkedin_profiles.name),
         headline = COALESCE(NULLIF(EXCLUDED.headline, ''), linkedin_profiles.headline),
         profile_image = COALESCE(NULLIF(EXCLUDED.profile_image, ''), linkedin_profiles.profile_image),
         parsed_company = COALESCE(NULLIF(EXCLUDED.parsed_company, ''), linkedin_profiles.parsed_company),
         parsed_designation = COALESCE(NULLIF(EXCLUDED.parsed_designation, ''), linkedin_profiles.parsed_designation),
         updated_at = NOW()
       RETURNING id, slug, (xmax = 0) AS was_insert`,
      [slugs, names, headlines, urls, images, companies, designations]
    );

    // Build slug → id map
    const slugToId = new Map<string, number>();
    for (const row of profileResult.rows) {
      slugToId.set(row.slug, row.id);
      if (row.was_insert) result.newProfiles++;
    }

    // ── Step 2: Bulk insert all comments in one query ────────────────
    const cPostIds: number[] = [];
    const cProfileIds: number[] = [];
    const cTexts: (string | null)[] = [];
    const cReplies: boolean[] = [];

    for (const p of profiles) {
      const profileId = slugToId.get(p.slug);
      if (!profileId) continue;
      cPostIds.push(postId);
      cProfileIds.push(profileId);
      cTexts.push(p.comment || null);
      cReplies.push(p.is_reply);
    }

    const commentResult = await client.query(
      `INSERT INTO linkedin_comments (post_id, profile_id, comment_text, is_reply)
       SELECT * FROM UNNEST($1::int[], $2::int[], $3::text[], $4::bool[])
       ON CONFLICT (post_id, profile_id, comment_text) DO NOTHING
       RETURNING id`,
      [cPostIds, cProfileIds, cTexts, cReplies]
    );

    result.newComments = commentResult.rows.length;
    result.duplicateComments = profiles.length - result.newComments;

    // ── Step 3: Update last_scraped ──────────────────────────────────
    await client.query(
      `UPDATE linkedin_posts SET last_scraped = NOW() WHERE id = $1`,
      [postId]
    );
  });

  return result;
}

// ── Query: profiles for a campaign ────────────────────────────────────

export async function getProfilesByCampaign(
  campaignTag: string,
  filters?: { enrichmentStatus?: 'all' | 'pending' | 'enriched' | 'icp' | 'non-icp'; search?: string },
): Promise<LIProfile[]> {
  let where = `WHERE p.campaign_tag = $1`;
  const params: unknown[] = [campaignTag];
  let paramIdx = 2;

  if (filters?.enrichmentStatus === 'pending') {
    where += ` AND pr.enriched_company_domain IS NULL`;
  } else if (filters?.enrichmentStatus === 'enriched') {
    where += ` AND pr.enriched_company_domain IS NOT NULL`;
  } else if (filters?.enrichmentStatus === 'icp') {
    where += ` AND LOWER(pr.icp_status) IN ('yes', 'true')`;
  } else if (filters?.enrichmentStatus === 'non-icp') {
    where += ` AND LOWER(pr.icp_status) IN ('no', 'false')`;
  }

  if (filters?.search) {
    where += ` AND (pr.name ILIKE $${paramIdx} OR pr.headline ILIKE $${paramIdx} OR pr.enriched_company_name ILIKE $${paramIdx})`;
    params.push(`%${filters.search}%`);
    paramIdx++;
  }

  return qp<LIProfile>(
    `SELECT pr.*,
            COUNT(c.id) AS comment_count,
            STRING_AGG(DISTINCT p.campaign_tag, ', ') AS campaigns
     FROM linkedin_profiles pr
     JOIN linkedin_comments c ON c.profile_id = pr.id
     JOIN linkedin_posts p ON p.id = c.post_id
     ${where}
     GROUP BY pr.id
     ORDER BY COUNT(c.id) DESC, pr.name ASC`,
    params
  );
}

// ── Query: all comments for a campaign ────────────────────────────────

export interface LIComment {
  id: number;
  post_id: number;
  profile_id: number;
  comment_text: string | null;
  is_reply: boolean;
  scraped_at: string;
  profile_name: string;
  profile_slug: string;
  profile_headline: string | null;
  profile_url: string;
  post_title: string | null;
  post_url: string;
  icp_status: string | null;
  enriched_company_name: string | null;
  is_customer: boolean;
}

export async function getCommentsByCampaign(
  campaignTag: string,
  opts?: { search?: string; postId?: number; isReply?: boolean; icpStatus?: string; isCustomer?: boolean; limit?: number; offset?: number },
): Promise<{ comments: LIComment[]; total: number }> {
  let where = `WHERE p.campaign_tag = $1`;
  const params: unknown[] = [campaignTag];
  let paramIdx = 2;

  if (opts?.postId) {
    where += ` AND c.post_id = $${paramIdx}`;
    params.push(opts.postId);
    paramIdx++;
  }

  if (opts?.isReply !== undefined) {
    where += ` AND c.is_reply = $${paramIdx}`;
    params.push(opts.isReply);
    paramIdx++;
  }

  if (opts?.icpStatus) {
    where += ` AND pr.icp_status = $${paramIdx}`;
    params.push(opts.icpStatus);
    paramIdx++;
  }

  if (opts?.isCustomer !== undefined) {
    if (opts.isCustomer) {
      where += ` AND cust.id IS NOT NULL`;
    } else {
      where += ` AND cust.id IS NULL`;
    }
  }

  if (opts?.search) {
    where += ` AND (pr.name ILIKE $${paramIdx} OR c.comment_text ILIKE $${paramIdx} OR pr.headline ILIKE $${paramIdx})`;
    params.push(`%${opts.search}%`);
    paramIdx++;
  }

  const countResult = await qp<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM linkedin_comments c
     JOIN linkedin_posts p ON p.id = c.post_id
     JOIN linkedin_profiles pr ON pr.id = c.profile_id
     LEFT JOIN companies comp ON comp.id = pr.company_id
     LEFT JOIN customers cust ON COALESCE(pr.enriched_company_domain, comp.domain) = cust.domain
     ${where}`,
    params
  );

  const limit = opts?.limit || 50;
  const offset = opts?.offset || 0;

  const comments = await qp<LIComment>(
    `SELECT c.*,
            pr.name AS profile_name,
            pr.slug AS profile_slug,
            pr.headline AS profile_headline,
            pr.profile_url,
            pr.icp_status,
            COALESCE(pr.enriched_company_name, comp.company_name, pr.parsed_company) AS enriched_company_name,
            p.post_title,
            p.post_url,
            CASE WHEN cust.id IS NOT NULL THEN true ELSE false END as is_customer
     FROM linkedin_comments c
     JOIN linkedin_posts p ON p.id = c.post_id
     JOIN linkedin_profiles pr ON pr.id = c.profile_id
     LEFT JOIN companies comp ON comp.id = pr.company_id
     LEFT JOIN customers cust ON COALESCE(pr.enriched_company_domain, comp.domain) = cust.domain
     ${where}
     ORDER BY c.scraped_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  return { comments, total: parseInt(countResult[0]?.count || '0') };
}

export async function getCommentsForExport(campaignTag: string) {
  return qp(
    `SELECT 
        pr.name AS "Name",
        pr.profile_url AS "LinkedIn Profile",
        pr.headline AS "Headline",
        c.comment_text AS "Comment",
        pr.icp_status AS "ICP Status",
        COALESCE(pr.enriched_company_name, comp.company_name, pr.parsed_company) AS "Company",
        COALESCE(pr.enriched_company_domain, comp.domain) AS "Domain",
        pr.enriched_company_linkedin AS "Company LinkedIn",
        CASE WHEN cust.id IS NOT NULL THEN 'Yes' ELSE 'No' END AS "Is Customer?",
        p.post_title AS "Post Title",
        p.post_url AS "Post URL",
        c.scraped_at AS "Scraped At"
     FROM linkedin_comments c
     JOIN linkedin_posts p ON p.id = c.post_id
     JOIN linkedin_profiles pr ON pr.id = c.profile_id
     LEFT JOIN companies comp ON comp.id = pr.company_id
     LEFT JOIN customers cust ON COALESCE(pr.enriched_company_domain, comp.domain) = cust.domain
     WHERE p.campaign_tag = $1
     ORDER BY c.scraped_at DESC`,
    [campaignTag]
  );
}

// ── Enrichment: bulk update profiles from Clay CSV ────────────────────

export async function enrichProfiles(
  updates: Array<{
    slug: string;
    enriched_company_name?: string;
    enriched_company_domain?: string;
    enriched_company_linkedin?: string;
    icp_status?: string;
  }>,
): Promise<{ matched: number; updated: number }> {
  if (updates.length === 0) return { matched: 0, updated: 0 };

  // Bulk update in chunks of 500 using UNNEST — single SQL per chunk
  const CHUNK = 500;
  let matched = 0;
  let updated = 0;

  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    const slugs: string[] = [];
    const names: (string | null)[] = [];
    const domains: (string | null)[] = [];
    const linkedins: (string | null)[] = [];
    const icps: (string | null)[] = [];

    for (const u of chunk) {
      slugs.push(u.slug);
      names.push(u.enriched_company_name || null);
      domains.push(u.enriched_company_domain || null);
      linkedins.push(u.enriched_company_linkedin || null);
      icps.push(u.icp_status || null);
    }

    const result = await qp<{ id: number }>(
      `UPDATE linkedin_profiles AS lp SET
         enriched_company_name     = COALESCE(bulk.name,     lp.enriched_company_name),
         enriched_company_domain   = COALESCE(bulk.domain,   lp.enriched_company_domain),
         enriched_company_linkedin = COALESCE(bulk.linkedin, lp.enriched_company_linkedin),
         icp_status                = COALESCE(bulk.icp,      lp.icp_status),
         updated_at = NOW()
       FROM (
         SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
           AS t(slug, name, domain, linkedin, icp)
       ) AS bulk
       WHERE lp.slug = bulk.slug
       RETURNING lp.id`,
      [slugs, names, domains, linkedins, icps]
    );

    matched += result.length;
    // Count rows that actually had meaningful data to write
    updated += chunk.filter(u => u.enriched_company_domain || u.enriched_company_name || u.icp_status).length;
  }

  return { matched, updated };
}

// ── Stats: campaign-level comment analytics ───────────────────────────

export interface CampaignCommentStats {
  campaign_tag: string;
  total_comments: number;
  unique_profiles: number;
  icp_profiles: number;
  non_icp_profiles: number;
  pending_profiles: number;
  enriched_profiles: number;
  icp_rate: number;
}

export async function getCampaignCommentStats(campaignTag: string): Promise<CampaignCommentStats> {
  const rows = await qp<{
    total_comments: string;
    unique_profiles: string;
    icp_profiles: string;
    non_icp_profiles: string;
    pending_profiles: string;
    enriched_profiles: string;
  }>(
    `SELECT
       COUNT(c.id) AS total_comments,
       COUNT(DISTINCT pr.id) AS unique_profiles,
       COUNT(DISTINCT CASE WHEN LOWER(pr.icp_status) IN ('yes', 'true') THEN pr.id END) AS icp_profiles,
       COUNT(DISTINCT CASE WHEN LOWER(pr.icp_status) IN ('no', 'false') THEN pr.id END) AS non_icp_profiles,
       COUNT(DISTINCT CASE WHEN pr.enriched_company_domain IS NULL THEN pr.id END) AS pending_profiles,
       COUNT(DISTINCT CASE WHEN pr.enriched_company_domain IS NOT NULL THEN pr.id END) AS enriched_profiles
     FROM linkedin_comments c
     JOIN linkedin_posts p ON p.id = c.post_id
     JOIN linkedin_profiles pr ON pr.id = c.profile_id
     WHERE p.campaign_tag = $1`,
    [campaignTag]
  );

  const r = rows[0];
  const unique = parseInt(r?.unique_profiles || '0');
  const icp = parseInt(r?.icp_profiles || '0');

  return {
    campaign_tag: campaignTag,
    total_comments: parseInt(r?.total_comments || '0'),
    unique_profiles: unique,
    icp_profiles: icp,
    non_icp_profiles: parseInt(r?.non_icp_profiles || '0'),
    pending_profiles: parseInt(r?.pending_profiles || '0'),
    enriched_profiles: parseInt(r?.enriched_profiles || '0'),
    icp_rate: unique > 0 ? (icp / unique) * 100 : 0,
  };
}

export async function getAllCampaignCommentStats(): Promise<CampaignCommentStats[]> {
  const rows = await qp<{
    campaign_tag: string;
    total_comments: string;
    unique_profiles: string;
    icp_profiles: string;
    non_icp_profiles: string;
    pending_profiles: string;
    enriched_profiles: string;
  }>(
    `SELECT
       p.campaign_tag,
       COUNT(c.id) AS total_comments,
       COUNT(DISTINCT pr.id) AS unique_profiles,
       COUNT(DISTINCT CASE WHEN LOWER(pr.icp_status) IN ('yes', 'true') THEN pr.id END) AS icp_profiles,
       COUNT(DISTINCT CASE WHEN LOWER(pr.icp_status) IN ('no', 'false') THEN pr.id END) AS non_icp_profiles,
       COUNT(DISTINCT CASE WHEN pr.enriched_company_domain IS NULL THEN pr.id END) AS pending_profiles,
       COUNT(DISTINCT CASE WHEN pr.enriched_company_domain IS NOT NULL THEN pr.id END) AS enriched_profiles
     FROM linkedin_comments c
     JOIN linkedin_posts p ON p.id = c.post_id
     JOIN linkedin_profiles pr ON pr.id = c.profile_id
     GROUP BY p.campaign_tag
     ORDER BY p.campaign_tag`
  );

  return rows.map(r => {
    const unique = parseInt(r.unique_profiles || '0');
    const icp = parseInt(r.icp_profiles || '0');
    return {
      campaign_tag: r.campaign_tag,
      total_comments: parseInt(r.total_comments || '0'),
      unique_profiles: unique,
      icp_profiles: icp,
      non_icp_profiles: parseInt(r.non_icp_profiles || '0'),
      pending_profiles: parseInt(r.pending_profiles || '0'),
      enriched_profiles: parseInt(r.enriched_profiles || '0'),
      icp_rate: unique > 0 ? (icp / unique) * 100 : 0,
    };
  });
}

// ── Get enriched domains for ICP classification ───────────────────────

export async function getEnrichedDomainsForClassification(campaignTag: string): Promise<Array<{ profileId: number; profileSlug: string; domain: string; companyName: string | null }>> {
  return qp(
    `SELECT DISTINCT pr.id AS "profileId", pr.slug AS "profileSlug", pr.enriched_company_domain AS domain, pr.enriched_company_name AS "companyName"
     FROM linkedin_profiles pr
     JOIN linkedin_comments c ON c.profile_id = pr.id
     JOIN linkedin_posts p ON p.id = c.post_id
     WHERE p.campaign_tag = $1
       AND pr.enriched_company_domain IS NOT NULL
       AND pr.enriched_company_domain != ''
       AND (pr.icp_status IS NULL OR pr.icp_status = '')`,
    [campaignTag]
  );
}

// ── Link profile → company (after ICP pipeline runs) ──────────────────

export async function linkProfileToCompany(profileSlug: string, companyId: number, icpStatus: string): Promise<void> {
  await qp(
    `UPDATE linkedin_profiles SET company_id = $2, icp_status = $3, updated_at = NOW() WHERE slug = $1`,
    [profileSlug, companyId, icpStatus]
  );
}
