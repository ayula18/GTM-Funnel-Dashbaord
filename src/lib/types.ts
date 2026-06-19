/**
 * Shared TypeScript types for the ICP Dashboard v2.
 */

// ── Company ──────────────────────────────────────────────────────────────

export interface Company {
  id: number;
  domain: string;
  domain_aliases: string | null;
  company_name: string | null;

  // Apollo enrichment
  apollo_employees: number | null;
  employee_reo: number | null;
  website: string | null;
  company_linkedin_url: string | null;   // Apollo's LinkedIn
  company_country: string | null;
  total_funding: number | null;
  latest_funding: string | null;
  latest_funding_amount: number | null;
  last_raised_at: string | null;
  annual_revenue: number | null;
  sic_codes: string | null;
  naics_codes: string | null;
  short_description: string | null;
  founded_year: number | null;
  subsidiary_of: string | null;
  is_in_apollo: boolean;

  // Dual-source enrichment (v2)
  crunchbase_funding: number | null;
  crunchbase_funding_type: string | null;
  crunchbase_employees: number | null;
  revenue_reo: number | null;
  sales_team_count: number | null;

  // ICP classification
  company_classification: string | null; // DevTool | IT Services & Solutions | Not Relevant
  category: string | null;
  sub_category: string | null;
  company_type: string | null; // Commercially OSS | Non-OSS | etc.
  icp_fit_level: string | null; // High | Medium | Low | Review | Not a Fit (computed)
  icp_decision: string | null; // Yes | No | Review
  confidence: string | null; // Legacy — kept for backward compat
  is_devtool: string | null;
  is_netnew: boolean | null;

  // Parent/sub-product tracking (v2)
  parent_domain: string | null;
  is_sub_product: boolean;

  // Funnel discard tracking (v2)
  discard_reason: string | null; // not_enriched | low_employees | not_icp | low_funding | dead_domain | scrape_failed
  discard_step: number | null; // 2, 3, 4, 5

  // Manual overrides
  manual_icp: string | null;
  manual_notes: string | null;
  manual_gtm_bucket: string | null;
  manual_gtm_reason: string | null;
  is_nonprofit: boolean;

  // Pipeline metadata
  scrape_status: string | null;
  classification_reason: string | null;
  observations: string | null;
  needs_manual_review: boolean;
  icp_rerun_count: number;
  last_icp_method: string | null; // scrape_only | scrape_plus_search | manual

  // Timestamps
  created_at: string;
  updated_at: string;
  classified_at: string | null;
}

/**
 * A company row as returned by /api/companies for the data table. Mirrors
 * Company but DB integer-booleans arrive as 0/1 and an aggregated
 * `merged_domains` string is attached. Kept loose on the boolean-ish fields
 * so the table can read raw DB values without per-cell casts.
 */
export interface CompanyRow extends Omit<Company,
  'is_in_apollo' | 'is_netnew' | 'needs_manual_review' | 'is_sub_product' | 'is_nonprofit'> {
  is_in_apollo: number | boolean | null;
  is_netnew: number | boolean | null;
  needs_manual_review: number | boolean | null;
  is_sub_product: number | boolean | null;
  is_nonprofit: number | boolean | null;
  merged_domains?: string | null;
}

// ── Funnel ───────────────────────────────────────────────────────────────

export interface Funnel {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  status: string; // active | archived
  color?: string; // e.g., 'default', 'blue', 'green'
}

export interface FunnelWithStats extends Funnel {
  total_companies: number;
  icp_yes: number;
  icp_no: number;
  icp_review: number;
  classified: number;
  unclassified: number;
  netnew: number;
}

// ── Funnel Steps (for the visual funnel bar) ─────────────────────────────

export interface FunnelSteps {
  step1_raw: number;           // All companies in funnel
  step2_apollo: number;        // In Apollo
  step2_drop: number;          // Drop from step1 to step2
  step3_employees: number;     // Employee filter passed
  step3_drop: number;          // Drop from step2 to step3
  step4_icp_total: number;     // ICP = Yes
  step4_icp_netnew: number;    // ICP = Yes AND NetNew
  step5_netnew_devtool: number; // NetNew AND DevTool
  step5_netnew_it: number;      // NetNew AND IT Services
  step4_services: number;      // IT Services count
  step4_drop: number;          // Drop from step3 to step4
  step5_funded_total: number;  // Funding/Revenue > 100K
  step5_funded_netnew: number;
  step5_drop: number;          // Drop from step4 to step5
}

// ── Upload / CSV ─────────────────────────────────────────────────────────

export type CsvSourceType = 'apollo' | 'reo_db' | 'crunchbase' | 'icp_output' | 'raw_domains' | 'unknown';

export interface UploadResult {
  funnel_id: number;
  funnel_name: string;
  source_type: CsvSourceType;
  total_rows: number;
  new_companies: number;
  updated_companies: number;
  matched_companies: number;
  duplicates_skipped: number;
  domain_conflicts: number;
  fields_updated: Record<string, number>; // field_name → count
  skipped_fields: Record<string, number>; // field_name → count blocked by source policy
  batch_id?: number;                       // upload_batches.id, for rollback
  errors: string[];
}

export interface CsvColumnMapping {
  [csvHeader: string]: keyof Company | null;
}

export interface UploadBatch {
  id: number;
  funnel_id: number;
  source_type: CsvSourceType;
  source_file: string | null;
  status: 'applied' | 'rolled_back';
  total_rows: number;
  new_companies: number;
  matched_companies: number;
  fields_updated: Record<string, number> | null;
  skipped_fields: Record<string, number> | null;
  is_manual_mapping: number;
  created_at: string;
  rolled_back_at: string | null;
}

// ── Pipeline ─────────────────────────────────────────────────────────────

export interface ScrapeResult {
  domain: string;
  html: string | null;
  status: 'success' | 'failed' | 'domain_dead';
  error?: string;
}

export interface ExtractedSignals {
  domain: string;
  linkedin_url: string;
  title: string;
  description: string;
  h1: string;
  page_text: string;
  nav_text: string;
  footer_text: string;
  footer_signals: string;
  dev_keywords: string;
  distribution_signals: string;
  oss_signals: string;
  cta_signals: string;
  consulting_signals: string;
  education_signals: string;
  recruitment_signals: string;
  agency_signals: string;
  observations: string;
  scrape_status: string;
}

export interface ClassificationResult {
  domain: string;
  company_name: string;
  company_classification: string; // DevTool | IT Services & Solutions | Not Relevant
  category: string;
  sub_category: string;
  company_type: string;
  is_icp: string | boolean | null; // "Yes" | "No" | "Review" (or legacy boolean)
  confidence?: string;
  has_pricing: boolean;
  has_signup: boolean;
  is_nonprofit: boolean;
  reason: string;
}

export interface PipelineProgress {
  funnel_id: number;
  total: number;
  completed: number;
  current_domain: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  errors: string[];
}

// ── API Query Params ─────────────────────────────────────────────────────

export interface CompanyFilters {
  funnel_id?: number;
  search?: string;
  icp_decision?: string;         // comma-separated for multi: "Yes,Review"
  company_classification?: string; // comma-separated for multi
  category?: string;              // comma-separated for multi
  confidence?: string;            // comma-separated for multi
  icp_fit_level?: string;         // comma-separated for multi
  company_type?: string;          // comma-separated for multi
  company_country?: string;       // comma-separated for multi
  is_netnew?: boolean;
  needs_manual_review?: boolean;
  is_in_apollo?: boolean;
  discard_reason?: string;        // comma-separated for multi
  discard_step?: number;
  min_employees?: number;
  max_employees?: number;
  min_funding?: number;
  max_funding?: number;
  min_crunchbase_funding?: number;
  max_crunchbase_funding?: number;
  min_revenue?: number;
  max_revenue?: number;
  min_founded_year?: number;
  max_founded_year?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    per_page: number;
    totalPages: number;
  };
}

// ── Dashboard Stats ─────────────────────────────────────────────────────

export interface DashboardStats {
  total: number;
  in_apollo: number;
  icp_yes: number;
  icp_no: number;
  icp_review: number;
  netnew: number;
  funnel_count: number;
  master_icp_count: number;
  acquired_count: number;
  dead_domains: number;
  false_negatives: number;
  scrape_success_rate: number;
  classification_breakdown: Array<{ company_classification: string; count: number }>;
  category_breakdown: Array<{ category: string; count: number }>;
  confidence_breakdown: Array<{ confidence: string; count: number }>;
  company_type_breakdown: Array<{ company_type: string; count: number }>;
  fit_level_breakdown: Array<{ icp_fit_level: string; count: number }>;
  discard_breakdown: Array<{ discard_reason: string; count: number }>;
}

// ── Constants ────────────────────────────────────────────────────────────

export const ICP_DECISIONS = ['Yes', 'No', 'Review'] as const;
export const ICP_FIT_LEVELS = ['High', 'Medium', 'Low', 'Review', 'Not a Fit'] as const;
export const COMPANY_CLASSIFICATIONS = ['DevTool', 'IT Services & Solutions', 'Other'] as const;
export const COMPANY_TYPES = ['Commercially OSS', 'OSS Affiliated', 'Non-OSS', 'Not a Devtool'] as const;
export const CONFIDENCE_LEVELS = ['High', 'Medium', 'Low'] as const;
export const DISCARD_REASONS = ['not_enriched', 'low_employees', 'not_icp', 'low_funding', 'dead_domain', 'scrape_failed'] as const;

export const DISCARD_REASON_LABELS: Record<string, string> = {
  not_enriched: 'Not Enriched',
  not_in_apollo: 'Not in Apollo',  // Legacy — kept for backward compat with existing data
  low_employees: 'Low Employee Count',
  not_icp: 'Not ICP',
  low_funding: 'Low Funding',
  dead_domain: 'Dead Domain',
  scrape_failed: 'Scrape Failed',
};

export const CATEGORIES = [
  // Build & Code
  'Source Code Management & Version Control',
  'IDE & Developer Productivity',
  'Code Quality & Static Analysis',
  'Low-Code & Internal Tooling',
  'Frontend & Web Development',
  'Mobile Development',
  'Backend & Server Infrastructure',
  // Test & Ship
  'CI/CD & Build Systems',
  'Testing & QA Automation',
  'Feature Management & Experimentation',
  'Artifact & Package Management',
  // Run & Operate
  'Cloud Infrastructure & Compute',
  'Container & Orchestration',
  'Serverless & Edge Computing',
  'Infrastructure as Code',
  'Networking & Service Mesh',
  'FinOps & Cloud Cost Management',
  // Observe & Respond
  'Observability & APM',
  'Logging & Tracing',
  'Incident Management & On-Call',
  'Chaos Engineering & Reliability',
  // Secure
  'Application Security (SAST/DAST/SCA)',
  'Cloud & Runtime Security (CSPM/CWPP)',
  'Identity & Access Management',
  'Secret Management & PKI',
  'Supply Chain & Container Security',
  'Network & Endpoint Security',
  // Data & AI
  'Database & Storage',
  'Data Infrastructure & Pipelines',
  'Data Streaming & Messaging',
  'AI/ML Infrastructure & MLOps',
  'AI Developer Tools & LLM Infra',
  // Connect & Integrate
  'API Platform & Gateway',
  'Developer Communications Infra',
  'Payments & FinTech Infrastructure',
  'Workflow Automation & iPaaS',
] as const;
