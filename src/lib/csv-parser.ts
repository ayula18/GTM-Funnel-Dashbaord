import Papa from 'papaparse';
import { normalizeDomain, extractRootName, isJunkName } from './domain-utils';
import { detectCsvSource } from './csv-detect';
export { detectCsvSource } from './csv-detect';
import {
  upsertCompany,
  linkCompanyToFunnel,
  isInMasterIcp,
  findCompanyByDomainSmart,
  addDomainAlias,
  addDataSource,
  createMergeCandidate,
  scanForDuplicates,
  addMasterIcp,
} from './db';
import { CsvSourceType, UploadResult } from './types';

// ── Column Mapping ─────────────────────────────────────────────────────

const COLUMN_MAP: Record<string, string> = {
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
  'employee reo':           'employee_reo',
  'employee_reo':           'employee_reo',
  'reodb employee count':   'employee_reo',
  'reo employee':           'employee_reo',
  'reo employees':          'employee_reo',
  'reo employee count':     'employee_reo',
  'employee count reo':     'employee_reo',

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

  'total funding':          'total_funding',
  'total funding amount':   'total_funding',

  'crunchbase funding':     'crunchbase_funding',
  'cb funding total':       'crunchbase_funding',
  'funding total':          'crunchbase_funding',
  'crunchbase_funding':     'crunchbase_funding',

  'latest funding':         'latest_funding',
  'latest funding type':    'latest_funding',
  'last funding type':      'latest_funding',
  'latest funding amount':  'latest_funding_amount',
  'last raised at':         'last_raised_at',
  'last funding date':      'last_raised_at',
  'founded date':           'founded_year',

  'annual revenue':         'annual_revenue',
  'revenue':                'annual_revenue',
  'revenue reo':            'revenue_reo',
  'revenue_reo':            'revenue_reo',
  'reo revenue':            'revenue_reo',

  'sic codes':              'sic_codes',
  'sic':                    'sic_codes',
  'naics codes':            'naics_codes',
  'naics':                  'naics_codes',
  'industries':             'category',

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

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ');
}

function mapHeaders(headers: string[]): Record<number, string> {
  const mapping: Record<number, string> = {};
  for (let i = 0; i < headers.length; i++) {
    const normalized = normalizeHeader(headers[i]);
    if (COLUMN_MAP[normalized] && COLUMN_MAP[normalized] !== '_skip') {
      mapping[i] = COLUMN_MAP[normalized];
    }
  }
  return mapping;
}

function parseNumeric(value: string | null | undefined): number | null {
  if (!value || value.trim() === '' || value === 'N/A' || value === '-' || value === 'Not Found') return null;
  const cleaned = value.replace(/[$,\s]/g, '').toLowerCase();
  let num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  if (cleaned.includes('b')) num *= 1000000000;
  else if (cleaned.includes('m')) num *= 1000000;
  else if (cleaned.includes('k')) num *= 1000;
  return num;
}

function parseBoolean(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === 'yes' || v === 'true' || v === '1';
}

// ── Main Import Function ──────────────────────────────────────────────

export async function parseAndImportCsv(
  csvContent: string,
  funnelId: number,
  funnelName: string,
  sourceType?: CsvSourceType,
  sourceFileName?: string,
): Promise<UploadResult> {
  const result: UploadResult = {
    funnel_id:          funnelId,
    funnel_name:        funnelName,
    source_type:        sourceType || 'unknown',
    total_rows:         0,
    new_companies:      0,
    updated_companies:  0,
    matched_companies:  0,
    duplicates_skipped: 0,
    domain_conflicts:   0,
    fields_updated:     {},
    errors:             [],
  };

  const parsed = Papa.parse(csvContent, {
    header:           false,
    skipEmptyLines:   true,
    dynamicTyping:    false,
  });

  if (parsed.errors.length > 0) {
    result.errors.push(...parsed.errors.slice(0, 5).map(e => `Row ${e.row}: ${e.message}`));
  }

  const rows = parsed.data as string[][];
  if (rows.length < 2) {
    result.errors.push('CSV has no data rows');
    return result;
  }

  const headers       = rows[0];
  const columnMapping = mapHeaders(headers);

  if (!sourceType || sourceType === 'unknown') {
    result.source_type = detectCsvSource(headers);
  }

  const domainColIdx  = Object.entries(columnMapping).find(([, field]) => field === 'domain')?.[0];
  const websiteColIdx = Object.entries(columnMapping).find(([, field]) => field === 'website')?.[0];

  if (domainColIdx === undefined && websiteColIdx === undefined) {
    result.errors.push('No domain or website column found in CSV');
    return result;
  }

  const seenDomains = new Set<string>();

  const dataRows = rows.slice(1);
  const chunkArray = <T>(arr: T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
      arr.slice(i * size, i * size + size)
    );
  
  const chunks = chunkArray(dataRows, 20);

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (row, idx) => {
      if (!row || row.length < 1) return;

      result.total_rows++;

      try {
        let rawDomain = domainColIdx !== undefined ? row[parseInt(domainColIdx)] : '';
        if (!rawDomain && websiteColIdx !== undefined) {
          rawDomain = row[parseInt(websiteColIdx)];
        }

        if (!rawDomain || rawDomain.trim().length < 3) return;

        const domain = normalizeDomain(rawDomain);
        if (!domain || domain.length < 4 || !domain.includes('.')) return;

        if (seenDomains.has(domain)) {
          result.duplicates_skipped++;
          return;
        }
        seenDomains.add(domain);

        const companyData: Record<string, unknown> = { domain };
        const fieldsSet: string[] = [];

        for (const [colIdx, field] of Object.entries(columnMapping)) {
          const value = row[parseInt(colIdx)]?.trim();
          if (!value || value === '') continue;

          switch (field) {
            case 'domain':
            case 'website':
              if (field === 'website') companyData.website = value;
              break;
            case 'apollo_employees':
            case 'employee_reo':
            case 'total_funding':
            case 'latest_funding_amount':
            case 'annual_revenue':
            case 'founded_year':
            case 'crunchbase_funding':
            case 'revenue_reo':
              companyData[field] = parseNumeric(value);
              if (companyData[field] !== null) fieldsSet.push(field);
              break;
            case 'is_in_apollo':
            case 'needs_manual_review':
            case 'is_nonprofit':
              companyData[field] = parseBoolean(value) ? 1 : 0;
              fieldsSet.push(field);
              break;
            case 'is_netnew':
              break; // Computed, not imported
            case 'company_name':
              // Never store placeholder names ("Unknown", "N/A", …) — they
              // pollute the data and become false duplicate-matching keys.
              if (!isJunkName(value)) {
                companyData.company_name = value;
                fieldsSet.push('company_name');
              }
              break;
            default:
              companyData[field] = value;
              fieldsSet.push(field);
          }
        }

        if (!companyData.website) {
          companyData.website = `https://${domain}`;
        }

        if (result.source_type === 'apollo') {
          companyData.is_in_apollo = 1;
          if (!fieldsSet.includes('is_in_apollo')) fieldsSet.push('is_in_apollo');
        }

        // Check NetNew status
        const inMaster = await isInMasterIcp(domain);
        companyData.is_netnew = inMaster ? 0 : 1;

        // ── Smart Domain Resolution ──────────────────────────────────────
        const smartMatch = await findCompanyByDomainSmart(
          domain,
          companyData.company_name as string | undefined,
          companyData.company_linkedin_url as string | undefined,
        );

        let companyId: number;
        let wasMatched = false;

        if (smartMatch) {
          if (smartMatch.confidence === 'exact' || smartMatch.confidence === 'high') {
            companyData.domain = smartMatch.domain;
            companyId  = await upsertCompany(companyData);
            wasMatched = true;
          } else {
            companyId = await upsertCompany(companyData);
            await createMergeCandidate(
              smartMatch.id,
              companyId,
              smartMatch.matchType,
              `${domain} ↔ ${smartMatch.domain} (${smartMatch.matchType})`,
              smartMatch.confidence,
            );
            result.domain_conflicts++;
          }
        } else {
          companyId = await upsertCompany(companyData);
        }

        await linkCompanyToFunnel(companyId, funnelId);

        const rootName = extractRootName(domain);
        await addDomainAlias(companyId, domain, rootName, result.source_type, !wasMatched);

        if (fieldsSet.length > 0 && sourceFileName) {
          await addDataSource(companyId, result.source_type, sourceFileName, fieldsSet);
        }

        for (const f of fieldsSet) {
          result.fields_updated[f] = (result.fields_updated[f] || 0) + 1;
        }

        if (wasMatched) {
          result.matched_companies++;
          result.updated_companies++;
        } else {
          result.new_companies++;
        }
      } catch (err) {
        result.errors.push(`Row: ${(err as Error).message}`);
      }
    }));
  }

  // Post-import: scan for remaining duplicates
  try {
    const dupsFound = await scanForDuplicates(funnelId);
    if (dupsFound > 0) {
      result.domain_conflicts += dupsFound;
    }
  } catch (err) {
    result.errors.push(`Dedup scan: ${(err as Error).message}`);
  }

  return result;
}

/**
 * Parse a master ICP list CSV.
 */
export async function parseMasterIcpCsv(csvContent: string): Promise<{ imported: number; errors: string[] }> {
  const parsed = Papa.parse(csvContent, {
    header:         false,
    skipEmptyLines: true,
  });

  const rows = parsed.data as string[][];
  let imported = 0;
  const errors: string[] = [];

  const firstRow = rows[0];
  const hasHeader = firstRow && firstRow.some(cell =>
    /domain|company|name|url|website/i.test(cell)
  );
  const startIdx = hasHeader ? 1 : 0;

  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const rawDomain = row[0]?.trim();
    if (!rawDomain || rawDomain.length < 3) continue;

    const domain = normalizeDomain(rawDomain);
    if (!domain || !domain.includes('.')) continue;

    const companyName = row.length > 1 ? row[1]?.trim() : undefined;

    try {
      await addMasterIcp(domain, companyName);
      imported++;
    } catch (err) {
      errors.push(`Row ${i + 1}: ${(err as Error).message}`);
    }
  }

  return { imported, errors };
}
