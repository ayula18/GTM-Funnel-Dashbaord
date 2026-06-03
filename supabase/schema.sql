-- ICP Dashboard — Supabase PostgreSQL Schema
-- Run this once in the Supabase SQL Editor to initialize all tables and indexes.
-- Project: https://supabase.com/dashboard

-- ── Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS funnels (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  status      TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS companies (
  id          SERIAL PRIMARY KEY,
  domain      TEXT NOT NULL,
  domain_aliases TEXT,
  company_name TEXT,

  -- Apollo enrichment
  apollo_employees      INTEGER,
  employee_reo          INTEGER,
  website               TEXT,
  company_linkedin_url  TEXT,
  company_country       TEXT,
  total_funding         DOUBLE PRECISION,
  latest_funding        TEXT,
  latest_funding_amount DOUBLE PRECISION,
  last_raised_at        TEXT,
  annual_revenue        DOUBLE PRECISION,
  sic_codes             TEXT,
  naics_codes           TEXT,
  short_description     TEXT,
  founded_year          INTEGER,
  subsidiary_of         TEXT,
  is_in_apollo          INTEGER DEFAULT 0,

  -- Dual-source enrichment (v2)
  crunchbase_funding      DOUBLE PRECISION,
  crunchbase_funding_type TEXT,
  revenue_reo             DOUBLE PRECISION,

  -- ICP classification
  company_classification TEXT,
  category               TEXT,
  sub_category           TEXT,
  company_type           TEXT,
  icp_fit_level          TEXT,
  icp_decision           TEXT,
  confidence             TEXT,
  is_devtool             TEXT,
  is_netnew              INTEGER,

  -- Parent/sub-product tracking (v2)
  parent_domain  TEXT,
  is_sub_product INTEGER DEFAULT 0,

  -- Funnel discard tracking (v2)
  discard_reason TEXT,
  discard_step   INTEGER,

  -- Manual overrides
  manual_icp   TEXT,
  manual_notes TEXT,
  is_nonprofit INTEGER DEFAULT 0,

  -- Pipeline metadata
  scrape_status         TEXT,
  classification_reason TEXT,
  observations          TEXT,
  needs_manual_review   INTEGER DEFAULT 0,
  icp_rerun_count       INTEGER DEFAULT 0,
  last_icp_method       TEXT,

  -- Timestamps
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  classified_at TIMESTAMPTZ,

  -- Merge tracking
  merged_into_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,

  UNIQUE(domain)
);

CREATE TABLE IF NOT EXISTS funnel_companies (
  id         SERIAL PRIMARY KEY,
  funnel_id  INTEGER NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  added_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(funnel_id, company_id)
);

CREATE TABLE IF NOT EXISTS master_icp (
  id           SERIAL PRIMARY KEY,
  domain       TEXT NOT NULL UNIQUE,
  company_name TEXT,
  added_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scrape_cache (
  domain     TEXT PRIMARY KEY,
  html       TEXT,
  jina_text  TEXT,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  status     TEXT
);

CREATE TABLE IF NOT EXISTS domain_aliases (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  domain       TEXT NOT NULL UNIQUE,
  root_name    TEXT NOT NULL,
  core_root    TEXT,
  source       TEXT,
  is_canonical INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_sources (
  id             SERIAL PRIMARY KEY,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_type    TEXT NOT NULL,
  source_file    TEXT,
  fields_updated TEXT,
  uploaded_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merge_candidates (
  id           SERIAL PRIMARY KEY,
  company_id_1 INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  company_id_2 INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  match_type   TEXT NOT NULL,
  match_detail TEXT,
  confidence   TEXT DEFAULT 'medium',
  status       TEXT DEFAULT 'pending',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ,
  UNIQUE(company_id_1, company_id_2)
);

-- Replaces data/settings.json — stores app-level key/value config (e.g. openai_api_key)
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Enrichment versioning (v3) ──────────────────────────────────────────────
-- Every CSV upload becomes one batch. company_field_changes records the BEFORE
-- and AFTER value of every field a batch touched, so an upload can be rolled
-- back to its exact prior state.

CREATE TABLE IF NOT EXISTS upload_batches (
  id                SERIAL PRIMARY KEY,
  funnel_id         INTEGER REFERENCES funnels(id) ON DELETE CASCADE,
  source_type       TEXT NOT NULL,
  source_file       TEXT,
  status            TEXT DEFAULT 'applied',   -- 'applied' | 'rolled_back'
  total_rows        INTEGER DEFAULT 0,
  new_companies     INTEGER DEFAULT 0,
  matched_companies INTEGER DEFAULT 0,
  fields_updated    JSONB,                    -- { field: count }
  skipped_fields    JSONB,                    -- { field: count } blocked by source policy
  mapping           JSONB,                    -- effective header → field map used
  is_manual_mapping INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  rolled_back_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS company_field_changes (
  id         BIGSERIAL PRIMARY KEY,
  batch_id   INTEGER NOT NULL REFERENCES upload_batches(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  field      TEXT NOT NULL,
  old_value  TEXT,          -- NULL = field was empty before this batch
  new_value  TEXT,
  was_insert INTEGER DEFAULT 0,  -- 1 if this batch created the company row
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_companies_domain         ON companies(domain);
CREATE INDEX IF NOT EXISTS idx_companies_icp            ON companies(icp_decision);
CREATE INDEX IF NOT EXISTS idx_companies_classification ON companies(company_classification);
CREATE INDEX IF NOT EXISTS idx_companies_category       ON companies(category);
CREATE INDEX IF NOT EXISTS idx_companies_discard        ON companies(discard_reason);
CREATE INDEX IF NOT EXISTS idx_funnel_companies_funnel  ON funnel_companies(funnel_id);
CREATE INDEX IF NOT EXISTS idx_funnel_companies_company ON funnel_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_master_icp_domain        ON master_icp(domain);
CREATE INDEX IF NOT EXISTS idx_aliases_domain           ON domain_aliases(domain);
CREATE INDEX IF NOT EXISTS idx_aliases_root             ON domain_aliases(root_name);
CREATE INDEX IF NOT EXISTS idx_aliases_company          ON domain_aliases(company_id);
CREATE INDEX IF NOT EXISTS idx_aliases_core_root        ON domain_aliases(core_root);
CREATE INDEX IF NOT EXISTS idx_merge_candidates_status  ON merge_candidates(status);
CREATE INDEX IF NOT EXISTS idx_upload_batches_funnel    ON upload_batches(funnel_id);
CREATE INDEX IF NOT EXISTS idx_field_changes_batch      ON company_field_changes(batch_id);
CREATE INDEX IF NOT EXISTS idx_field_changes_company    ON company_field_changes(company_id);
