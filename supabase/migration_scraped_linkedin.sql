-- Migration: store the LinkedIn URL discovered while scraping a company's
-- homepage during classification (separate from Apollo's company_linkedin_url).
-- Run ONCE in the Supabase SQL editor. Safe to re-run.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS scraped_linkedin_url TEXT;
