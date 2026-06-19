/**
 * CSV source-type detection — PURE, no DB / server imports.
 *
 * Safe to import from client components (the upload confirm UI parses the
 * file's header row in the browser and previews the detected source before
 * committing). The server importer in csv-parser.ts re-uses the same logic.
 */
import Papa from 'papaparse';
import { CsvSourceType } from './types';

const SOURCE_SIGNATURES: Record<CsvSourceType, string[]> = {
  // NOTE: 'website' is deliberately EXCLUDED from Apollo — it's too generic
  // (Crunchbase scraper output also has 'website') and caused misdetection.
  // Apollo is reliably identified by definitive columns ('apollo account id',
  // 'apollo employees') or by specific sigs like '# employees', 'sic codes'.
  apollo:      ['# employees', 'company linkedin url', 'sic codes', 'total funding', 'apollo account id', 'apollo employees', 'apollo employee count'],
  reo_db:      ['reodb employee count', 'employee reo', 'employee_reo', 'reo employee', 'reo employees', 'revenue reo', 'revenue_reo', 'employee count reo'],
  crunchbase:  ['crunchbase funding', 'crunchbase_funding', 'cb rank', 'organization name', 'cb funding total', 'cb rank (company)', 'founded date', 'last funding type', 'number of employees', 'industries', 'funding stage', 'operating status', 'revenue range', 'funding total', 'founded on'],
  icp_output:  ['icp new', 'is devtool', 'catogery', 'icp_decision', 'icp decision', 'company_classification', 'icp fit level'],
  raw_domains: [],
  unknown:     [],
};

const DEFINITIVE_COLUMNS: Record<string, CsvSourceType> = {
  'apollo account id':    'apollo',
  'apollo employees':     'apollo',
  'apollo employee count':'apollo',
  'reodb employee count': 'reo_db',
  'employee reo':         'reo_db',
  'employee_reo':         'reo_db',
  'revenue reo':          'reo_db',
  'revenue_reo':          'reo_db',
  'cb rank':              'crunchbase',
  'cb rank (company)':    'crunchbase',
  'cb funding total':     'crunchbase',
  'crunchbase funding':   'crunchbase',
  // Crunchbase scraper output — these column names are unique to Crunchbase
  // data and don't appear in Apollo, Reo DB, or ICP exports.
  'funding stage':        'crunchbase',
  'operating status':     'crunchbase',
  'revenue range':        'crunchbase',
  'icp new':              'icp_output',
  'icp decision':         'icp_output',
  'icp_decision':         'icp_output',
  'company_classification':'icp_output',
};

export function detectCsvSource(headers: string[]): CsvSourceType {
  const normalized = headers.map(h => h.trim().toLowerCase().replace(/[_\-]+/g, ' '));

  for (const header of normalized) {
    if (DEFINITIVE_COLUMNS[header]) return DEFINITIVE_COLUMNS[header];
  }

  for (const [sourceType, signatures] of Object.entries(SOURCE_SIGNATURES)) {
    if (sourceType === 'raw_domains' || sourceType === 'unknown') continue;
    const matchCount = signatures.filter(sig => normalized.some(h => h.includes(sig))).length;
    if (matchCount >= 1) return sourceType as CsvSourceType;
  }

  if (normalized.length <= 5 && normalized.some(h => h.includes('domain') || h.includes('website') || h.includes('url'))) {
    return 'raw_domains';
  }

  return 'unknown';
}

/**
 * Browser helper: read only the first chunk of a file and detect its source
 * type from the header row, without uploading. Used by the upload "confirm"
 * UI to preview the detected source before committing.
 */
export async function detectSourceFromFile(file: File): Promise<CsvSourceType> {
  const text = await file.slice(0, 65536).text();
  const parsed = Papa.parse<string[]>(text, { header: false, preview: 1, skipEmptyLines: true });
  const headers = (parsed.data[0] as string[]) || [];
  return detectCsvSource(headers);
}

// ── Column auto-mapping (client-safe) ────────────────────────────────────────
// Header → company field. Shared by the server importer AND the client mapping
// editor (so the editor's defaults match what auto-import would do).

export const COLUMN_MAP: Record<string, string> = {
  'company name':           'company_name',
  'company name for emails':'_skip',
  'company':                'company_name',
  'name':                   'company_name',
  'organization name':      'company_name',
  'org name':               'company_name',
  'domain':                 'domain',
  'domains':                'domain',
  'domain name':            'domain',
  'company domain':         'domain',
  'website':                'website',
  'website url':            'website',
  'url':                    'website',

  '# employees':            'apollo_employees',
  'apollo employees':       'apollo_employees',
  'apollo employee count':  'apollo_employees',
  'employees':              'apollo_employees',
  '# of employees':         'apollo_employees',
  'number of employees':    'apollo_employees',
  'employee count':         'apollo_employees',
  'crunchbase employees':   'crunchbase_employees',
  'cb employees':           'crunchbase_employees',
  'cb employee count':      'crunchbase_employees',
  'employee reo':           'employee_reo',
  'employee_reo':           'employee_reo',
  'reodb employee count':   'employee_reo',
  'reo employee':           'employee_reo',
  'reo employees':          'employee_reo',
  'reo employee count':     'employee_reo',
  'employee count reo':     'employee_reo',

  'sales team count':       'sales_team_count',
  'sales_team_count':       'sales_team_count',
  'sales team':             'sales_team_count',
  'sales people':           'sales_team_count',
  'sales people count':     'sales_team_count',
  'number of sales people': 'sales_team_count',
  'no of sales people':     'sales_team_count',
  '# sales people':         'sales_team_count',
  'sales headcount':        'sales_team_count',
  'sales employees':        'sales_team_count',
  '# sales employees':      'sales_team_count',
  'sales department headcount': 'sales_team_count',
  'sales department':       'sales_team_count',

  'company linkedin url':   'company_linkedin_url',
  'company linkedin':       'company_linkedin_url',
  'linkedin':               'company_linkedin_url',
  'linkedin url':           'company_linkedin_url',
  'linkedin company url':   'company_linkedin_url',

  'company country':        'company_country',
  'country':                'company_country',
  'hq country':             'company_country',
  'headquarters location':  'company_country',
  'hq location':            'company_country',
  'location':               'company_country',
  'location identifiers':   'company_country',

  'total funding':          'total_funding',
  'total funding amount':   'total_funding',

  'crunchbase funding':     'crunchbase_funding',
  'cb funding total':       'crunchbase_funding',
  'funding total':          'crunchbase_funding',
  'crunchbase_funding':     'crunchbase_funding',

  'latest funding':         'latest_funding',
  'latest funding type':    'latest_funding',
  'last funding type':      'latest_funding',
  'funding stage':          'crunchbase_funding_type',
  'latest funding amount':  'latest_funding_amount',
  'last raised at':         'last_raised_at',
  'last funding date':      'last_raised_at',
  'last funding at':        'last_raised_at',
  'founded date':           'founded_year',
  'founded on':             'founded_year',

  'annual revenue':         'annual_revenue',
  'revenue':                'annual_revenue',
  'revenue range':          'annual_revenue',
  'revenue reo':            'revenue_reo',
  'revenue_reo':            'revenue_reo',
  'reo revenue':            'revenue_reo',

  'sic codes':              'sic_codes',
  'sic':                    'sic_codes',
  'naics codes':            'naics_codes',
  'naics':                  'naics_codes',
  'industries':             'category',
  'categories':             'category',

  'operating status':       '_skip',
  'contact email':          '_skip',
  'phone number':           '_skip',

  'short description':      'short_description',
  'description':            'short_description',
  'company description':    'short_description',

  'founded year':           'founded_year',
  'year founded':           'founded_year',
  'subsidiary of':          'subsidiary_of',
  'parent company':         'subsidiary_of',
  'is in apollo':           'is_in_apollo',
  'apollo account id':      '_skip',
  'cb rank':                '_skip',
  'cb rank (company)':      '_skip',

  'icp new':                'icp_decision',
  'icp':                    'icp_decision',
  'icp decision':           'icp_decision',
  'is icp':                 'icp_decision',
  'is devtool?':            'is_devtool',
  'is devtool':             'is_devtool',
  'is services?':           'company_classification',
  'company classification': 'company_classification',
  'catogery':               'category',
  'category':               'category',
  'sub category':           'sub_category',
  'sub_category':           'sub_category',
  'confidence':             'confidence',
  'manual icp':             'manual_icp',
  'company type':           'company_type',
  'icp fit level':          'icp_fit_level',
  'is netnew?':             'is_netnew',
  'is netnew':              'is_netnew',
  'observations':           'observations',
  'reason':                 'classification_reason',
  'scrape status':          'scrape_status',
  'needs manual review':    'needs_manual_review',
  'non profit ?':           'is_nonprofit',
  'non profit':             'is_nonprofit',
};

export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ');
}

/** Auto-detected field for a single header, or null if it maps to nothing / _skip. */
export function autoMapField(header: string): string | null {
  const field = COLUMN_MAP[normalizeHeader(header)];
  return field && field !== '_skip' ? field : null;
}

/**
 * Browser helper: read the header row + first data row of a file so the upload
 * UI can show a column-mapping editor with sample values.
 */
export async function parseCsvPreview(file: File): Promise<{ headers: string[]; sample: string[] }> {
  const text = await file.slice(0, 65536).text();
  const parsed = Papa.parse<string[]>(text, { header: false, preview: 2, skipEmptyLines: true });
  const headers = (parsed.data[0] as string[]) || [];
  const sample  = (parsed.data[1] as string[]) || [];
  return { headers, sample };
}

/** Human-readable labels for each source type — shared by upload UIs. */
export const SOURCE_LABELS: Record<CsvSourceType, string> = {
  apollo:      'Apollo Export',
  reo_db:      'Reo DB Export',
  crunchbase:  'Crunchbase Export',
  icp_output:  'ICP Classifier Output',
  raw_domains: 'Raw Domain List',
  unknown:     'Auto-detect',
};
