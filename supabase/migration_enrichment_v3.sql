-- Migration: Enrichment versioning + source-locked uploads (v3)
-- Run ONCE in the Supabase SQL editor. Safe to re-run (IF NOT EXISTS guards).
--
-- Adds the audit trail that powers per-upload rollback. No changes to existing
-- tables — purely additive.

CREATE TABLE IF NOT EXISTS upload_batches (
  id                SERIAL PRIMARY KEY,
  funnel_id         INTEGER REFERENCES funnels(id) ON DELETE CASCADE,
  source_type       TEXT NOT NULL,
  source_file       TEXT,
  status            TEXT DEFAULT 'applied',   -- 'applied' | 'rolled_back'
  total_rows        INTEGER DEFAULT 0,
  new_companies     INTEGER DEFAULT 0,
  matched_companies INTEGER DEFAULT 0,
  fields_updated    JSONB,
  skipped_fields    JSONB,
  mapping           JSONB,
  is_manual_mapping INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  rolled_back_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS company_field_changes (
  id         BIGSERIAL PRIMARY KEY,
  batch_id   INTEGER NOT NULL REFERENCES upload_batches(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  field      TEXT NOT NULL,
  old_value  TEXT,
  new_value  TEXT,
  was_insert INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upload_batches_funnel ON upload_batches(funnel_id);
CREATE INDEX IF NOT EXISTS idx_field_changes_batch   ON company_field_changes(batch_id);
CREATE INDEX IF NOT EXISTS idx_field_changes_company ON company_field_changes(company_id);
