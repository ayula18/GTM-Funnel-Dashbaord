-- Cleanup: repair company_name rows that the classifier corrupted with a
-- sentinel/decision value (e.g. "Review") before the fill-empty fix.
--
-- These are NEVER valid company names. Nulling them removes the corruption and
-- drops them out of the "Same company name" duplicate bucket on the next scan.
-- The icp_decision / classification of these rows is left UNTOUCHED.
--
-- Run in the Supabase SQL editor. Step 1 is a dry-run preview; run Step 2 to apply.

-- ── Step 1: PREVIEW — how many rows will be cleaned, and which ──────────────
SELECT id, domain, company_name, icp_decision
FROM companies
WHERE LOWER(TRIM(company_name)) IN (
  'review', 'yes', 'no', 'unknown', 'n/a', 'na', 'none', 'null', 'nil',
  'not relevant', 'devtool', 'it services & solutions', 'it services',
  'maybe', 'pending', 'tbd', 'tba', 'unnamed', 'company', 'undefined'
)
ORDER BY company_name, domain;

-- ── Step 2: APPLY — null out the bogus names ───────────────────────────────
-- UPDATE companies
-- SET company_name = NULL, updated_at = NOW()
-- WHERE LOWER(TRIM(company_name)) IN (
--   'review', 'yes', 'no', 'unknown', 'n/a', 'na', 'none', 'null', 'nil',
--   'not relevant', 'devtool', 'it services & solutions', 'it services',
--   'maybe', 'pending', 'tbd', 'tba', 'unnamed', 'company', 'undefined'
-- );

-- ── Step 3 (optional): retire the bogus "Same company name" merge candidates
-- that were generated from those names, so they disappear from the Duplicates
-- queue without merging anything. Safe — only touches name-based, still-pending
-- candidates. Re-running the duplicate scan afterwards will NOT recreate them
-- (the names are now NULL → treated as junk).
-- UPDATE merge_candidates
-- SET status = 'rejected', resolved_at = NOW()
-- WHERE status = 'pending' AND match_type = 'company_name'
--   AND match_detail ILIKE 'Same company name: review%';
