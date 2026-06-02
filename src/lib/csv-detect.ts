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
  apollo:      ['# employees', 'company linkedin url', 'sic codes', 'website', 'total funding', 'apollo account id', 'apollo employees', 'apollo employee count'],
  reo_db:      ['reodb employee count', 'employee reo', 'employee_reo', 'reo employee', 'reo employees', 'revenue reo', 'revenue_reo', 'employee count reo'],
  crunchbase:  ['crunchbase funding', 'crunchbase_funding', 'cb rank', 'organization name', 'cb funding total', 'cb rank (company)', 'founded date', 'last funding type', 'number of employees', 'industries'],
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

/** Human-readable labels for each source type — shared by upload UIs. */
export const SOURCE_LABELS: Record<CsvSourceType, string> = {
  apollo:      'Apollo Export',
  reo_db:      'Reo DB Export',
  crunchbase:  'Crunchbase Export',
  icp_output:  'ICP Classifier Output',
  raw_domains: 'Raw Domain List',
  unknown:     'Auto-detect',
};
