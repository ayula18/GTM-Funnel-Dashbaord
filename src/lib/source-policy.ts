/**
 * Source authority — which CSV source is allowed to write which company field.
 *
 * PURE module (no DB / server imports) so the upload UI can import the field
 * catalogue for the manual-mapping editor.
 *
 * The model (confirmed with product): every enrichment data-point has its OWN
 * column per source — e.g. Apollo headcount lives in `apollo_employees`, Reo's
 * in `employee_reo`, funding splits `total_funding` (Apollo) vs
 * `crunchbase_funding` (Crunchbase). So each field is OWNED by exactly one
 * source and only that source may write it in auto-detect mode. This is what
 * stops a Reo DB export from silently clobbering Apollo's numbers.
 *
 * A small set of IDENTITY fields share a single column across sources
 * (company_name, country, founded_year, …). Any source may *fill* these, but
 * only when empty — never overwrite — so no source stomps another's value.
 *
 * Manual mapping (the user explicitly maps a header → field in the upload UI)
 * is the deliberate escape hatch: it bypasses these locks entirely.
 */
import { CsvSourceType } from './types';

/** Fields each source EXCLUSIVELY owns. Only the owner may write them (auto mode). */
export const SOURCE_OWNED_FIELDS: Record<CsvSourceType, string[]> = {
  apollo: [
    'apollo_employees',
    'total_funding',
    'latest_funding',
    'latest_funding_amount',
    'last_raised_at',
    'annual_revenue',
    'sic_codes',
    'naics_codes',
    'company_linkedin_url',
    'sales_team_count',
    'is_in_apollo',
  ],
  reo_db: [
    'employee_reo',
    'revenue_reo',
  ],
  crunchbase: [
    'crunchbase_funding',
    'crunchbase_funding_type',
  ],
  icp_output: [
    'icp_decision',
    'company_classification',
    'category',
    'sub_category',
    'company_type',
    'icp_fit_level',
    'confidence',
    'is_devtool',
    'manual_icp',
    'observations',
    'classification_reason',
    'needs_manual_review',
    'is_nonprofit',
  ],
  raw_domains: [],
  unknown: [],
};

/**
 * Shared single-column fields. Any source may fill them, but only when the
 * existing value is empty (fill-if-empty) — never overwrite.
 */
export const IDENTITY_FIELDS: string[] = [
  'company_name',
  'company_country',
  'founded_year',
  'short_description',
  'website',
  'subsidiary_of',
];

/** field → the source that owns it (or null if shared / unowned). */
export const FIELD_OWNER: Record<string, CsvSourceType> = (() => {
  const map: Record<string, CsvSourceType> = {};
  for (const [src, fields] of Object.entries(SOURCE_OWNED_FIELDS)) {
    for (const f of fields) map[f] = src as CsvSourceType;
  }
  return map;
})();

export type WriteMode = 'overwrite' | 'fill_empty' | 'skip';

/**
 * Decide how a field write should be handled in AUTO mode for a given source.
 *  - owned by this source         → overwrite
 *  - owned by a DIFFERENT source  → skip (the contamination guard)
 *  - identity (shared) field      → fill_empty
 *  - unowned, non-identity        → overwrite (operational fields like domain)
 *
 * Manual mappings never reach here — they always overwrite.
 */
export function writePolicy(field: string, source: CsvSourceType): WriteMode {
  const owner = FIELD_OWNER[field];
  if (owner) return owner === source ? 'overwrite' : 'skip';
  if (IDENTITY_FIELDS.includes(field)) return 'fill_empty';
  return 'overwrite';
}

/** Human label for a source. */
export const SOURCE_LABEL: Record<CsvSourceType, string> = {
  apollo: 'Apollo',
  reo_db: 'Reo DB',
  crunchbase: 'Crunchbase',
  icp_output: 'ICP Classifier',
  raw_domains: 'Raw Domains',
  unknown: 'Unknown',
};

/**
 * Field catalogue for the manual-mapping dropdown. `owner` is shown as a hint
 * ("owned by Apollo") so the user understands the lock they're overriding.
 */
export interface MappableField {
  value: string;
  label: string;
  owner: CsvSourceType | null;
}

export const MAPPABLE_FIELDS: MappableField[] = [
  { value: 'domain',                 label: 'Domain',                 owner: null },
  { value: 'website',                label: 'Website',                owner: null },
  { value: 'company_name',           label: 'Company Name',           owner: null },
  { value: 'company_country',        label: 'Country',                owner: null },
  { value: 'founded_year',           label: 'Founded Year',           owner: null },
  { value: 'short_description',      label: 'Description',            owner: null },
  { value: 'subsidiary_of',          label: 'Subsidiary Of',          owner: null },
  { value: 'apollo_employees',       label: 'Employees (Apollo)',     owner: 'apollo' },
  { value: 'employee_reo',           label: 'Employees (Reo)',        owner: 'reo_db' },
  { value: 'total_funding',          label: 'Total Funding (Apollo)', owner: 'apollo' },
  { value: 'crunchbase_funding',     label: 'Funding (Crunchbase)',   owner: 'crunchbase' },
  { value: 'crunchbase_funding_type',label: 'Funding Type (CB)',      owner: 'crunchbase' },
  { value: 'latest_funding',         label: 'Latest Funding Round',   owner: 'apollo' },
  { value: 'latest_funding_amount',  label: 'Latest Funding Amount',  owner: 'apollo' },
  { value: 'last_raised_at',         label: 'Last Raised At',         owner: 'apollo' },
  { value: 'annual_revenue',         label: 'Annual Revenue (Apollo)',owner: 'apollo' },
  { value: 'revenue_reo',            label: 'Revenue (Reo)',          owner: 'reo_db' },
  { value: 'sales_team_count',       label: 'Sales Team (Apollo)',    owner: 'apollo' },
  { value: 'company_linkedin_url',   label: 'LinkedIn URL',           owner: 'apollo' },
  { value: 'sic_codes',              label: 'SIC Codes',              owner: 'apollo' },
  { value: 'naics_codes',            label: 'NAICS Codes',            owner: 'apollo' },
  { value: 'icp_decision',           label: 'ICP Decision',           owner: 'icp_output' },
  { value: 'company_classification', label: 'Classification',         owner: 'icp_output' },
  { value: 'category',               label: 'Category',               owner: 'icp_output' },
  { value: 'sub_category',           label: 'Sub Category',           owner: 'icp_output' },
  { value: 'company_type',           label: 'Company Type',           owner: 'icp_output' },
  { value: 'icp_fit_level',          label: 'ICP Fit Level',          owner: 'icp_output' },
  { value: 'confidence',             label: 'Confidence',             owner: 'icp_output' },
  { value: 'manual_icp',             label: 'Manual ICP',             owner: 'icp_output' },
  { value: 'observations',           label: 'Observations',           owner: 'icp_output' },
];

/** Set of all field names that are valid manual-map targets. */
export const MAPPABLE_FIELD_SET = new Set(MAPPABLE_FIELDS.map(f => f.value));
