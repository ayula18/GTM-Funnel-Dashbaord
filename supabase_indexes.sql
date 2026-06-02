-- Performance Optimization Indexes
-- Run this in your Supabase SQL Editor

-- 1. Accelerate exact domain lookups (critical for the CSV upload process)
CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies (domain);

-- 2. Accelerate domain alias lookups
CREATE INDEX IF NOT EXISTS idx_domain_aliases_domain ON domain_aliases (domain);
CREATE INDEX IF NOT EXISTS idx_domain_aliases_company_id ON domain_aliases (company_id);

-- 3. Accelerate fuzzy searching by name in the Data Table
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_companies_name_trgm ON companies USING gin (company_name gin_trgm_ops);

-- 4. Accelerate Funnel queries (getting all companies in a funnel)
CREATE INDEX IF NOT EXISTS idx_funnel_companies_funnel_id ON funnel_companies (funnel_id);
CREATE INDEX IF NOT EXISTS idx_funnel_companies_company_id ON funnel_companies (company_id);

-- 5. Accelerate Dashboard Stats (grouping and counting)
CREATE INDEX IF NOT EXISTS idx_companies_icp_decision ON companies (icp_decision);
CREATE INDEX IF NOT EXISTS idx_companies_classification ON companies (company_classification);
