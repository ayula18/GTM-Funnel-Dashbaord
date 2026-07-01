import Papa from 'papaparse';
import { normalizeDomain, extractRootName, isJunkName } from './domain-utils';
import { detectCsvSource, COLUMN_MAP, normalizeHeader } from './csv-detect';
export { detectCsvSource } from './csv-detect';
import {
  qp,
  upsertCompanyTracked,
  linkCompanyToFunnel,
  isInMasterIcp,
  findCompanyByDomainSmart,
  addDomainAlias,
  addDataSource,
  createMergeCandidate,
  scanForDuplicates,
  addMasterIcp,
  createUploadBatch,
  recordFieldChanges,
  finalizeUploadBatch,
  deleteUploadBatch,
  ensureMatchDecisionsTable,
  recordMatchDecisions,
} from './db';
import type { BatchChangeRow, UpsertResult, MatchDecisionRow } from './db';
import { MAPPABLE_FIELD_SET } from './source-policy';
import { knownCurrency, currencyFromSymbol, toUsd } from './currency';
import { CsvSourceType, UploadResult } from './types';

// ── Column Mapping ─────────────────────────────────────────────────────
// COLUMN_MAP + normalizeHeader live in csv-detect.ts (client-safe) so the
// upload UI's mapping editor shows the same auto-detected defaults.

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
  const trimmed = value.trim();

  // ── Range values (Crunchbase employee counts: "101-250", "501-1,000") ──
  // Take the midpoint for the most representative estimate.
  const rangeMatch = trimmed.match(/^[\s$€£]*([0-9][0-9,]*)\s*[-–—]\s*([0-9][0-9,]*)/);
  if (rangeMatch) {
    const low  = parseFloat(rangeMatch[1].replace(/,/g, ''));
    const high = parseFloat(rangeMatch[2].replace(/,/g, ''));
    if (!isNaN(low) && !isNaN(high)) return Math.round((low + high) / 2);
  }

  // ── Open-ended values ("10001+", "10,000+") ────────────────────────────
  const plusMatch = trimmed.match(/^[\s$€£]*([0-9][0-9,]*)\s*\+/);
  if (plusMatch) {
    const n = parseFloat(plusMatch[1].replace(/,/g, ''));
    if (!isNaN(n)) return n;
  }

  // ── Standard numeric with optional currency / multiplier suffix ────────
  // Strip all non-numeric characters EXCEPT decimals, minus signs, and k/m/b multipliers.
  // This handles currency symbols like €, £, ₹, etc. safely.
  const cleaned = trimmed.replace(/[^0-9.\-bmk]/gi, '').toLowerCase();
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
  manualMapping?: Record<string, string> | null,
  onProgress?: (processed: number, total: number) => void,
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
    skipped_fields:     {},
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

  const headers = rows[0];

  if (!sourceType || sourceType === 'unknown') {
    result.source_type = detectCsvSource(headers);
  }

  // Build the index → field map. A MANUAL mapping (user picked header → field in
  // the upload UI) decides WHICH columns import and which column is the domain
  // key. Source-ownership protection ALWAYS applies — the upload UI only offers
  // fields this source is allowed to write, so a manual mapping can never write
  // a column another source owns. No bypass.
  const isManual = !!manualMapping && Object.keys(manualMapping).length > 0;
  const columnMapping: Record<number, string> = {};

  if (isManual) {
    for (let i = 0; i < headers.length; i++) {
      const field = manualMapping![headers[i]];
      if (field && field !== '_skip' && MAPPABLE_FIELD_SET.has(field)) {
        columnMapping[i] = field;
      }
    }
  } else {
    Object.assign(columnMapping, mapHeaders(headers));
  }

  // ── Source-aware column remapping ─────────────────────────────────────
  // Generic headers like "Number of Employees" auto-map to apollo_employees,
  // but if the source is Crunchbase, the source-policy will BLOCK writes to
  // apollo_employees (owned by Apollo). Remap to the Crunchbase-owned column
  // so the data actually gets stored. Same logic for total_funding → crunchbase_funding.
  if (result.source_type === 'crunchbase') {
    for (const [idx, field] of Object.entries(columnMapping)) {
      if (field === 'apollo_employees') columnMapping[Number(idx)] = 'crunchbase_employees';
      if (field === 'total_funding')    columnMapping[Number(idx)] = 'crunchbase_funding';
      // latest_funding is Apollo-owned; for Crunchbase, store in crunchbase_funding_type.
      if (field === 'latest_funding')   columnMapping[Number(idx)] = 'crunchbase_funding_type';
      // category is icp_output-owned; Crunchbase's "categories" / "industries"
      // column would be blocked by source policy. Store it in short_description
      // (identity field, fill-if-empty) so we don't lose the data entirely — the
      // ICP classifier will set the canonical category later.
      if (field === 'category')         columnMapping[Number(idx)] = 'short_description';
      // Crunchbase's company_type is "For Profit"/"Non-profit"/"Government" —
      // completely different from the ICP taxonomy ("Commercially OSS"/"Non-OSS").
      // Drop it to prevent data contamination.
      if (field === 'company_type')     delete columnMapping[Number(idx)];
      // annual_revenue is Apollo-owned; no CB-owned equivalent column exists.
      // Drop to avoid silent source-policy skip + misleading upload logs.
      if (field === 'annual_revenue')   delete columnMapping[Number(idx)];
      // last_raised_at is Apollo-owned; drop for same reason.
      if (field === 'last_raised_at')   delete columnMapping[Number(idx)];
    }
  }

  const domainColIdx  = Object.entries(columnMapping).find(([, field]) => field === 'domain')?.[0];
  const websiteColIdx = Object.entries(columnMapping).find(([, field]) => field === 'website')?.[0];

  if (domainColIdx === undefined && websiteColIdx === undefined) {
    result.errors.push('No domain or website column found in CSV');
    return result;
  }

  // Open an upload batch — every field write below is logged against it so the
  // whole upload can be rolled back.
  const batchId = await createUploadBatch({
    funnel_id:         funnelId,
    source_type:       result.source_type,
    source_file:       sourceFileName ?? null,
    mapping:           isManual ? manualMapping! : null,
    is_manual_mapping: isManual,
  });
  result.batch_id = batchId;

  // Ensure match_decisions table exists (idempotent)
  await ensureMatchDecisionsTable();

  const seenDomains = new Set<string>();

  const dataRows = rows.slice(1);
  const chunkArray = <T>(arr: T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
      arr.slice(i * size, i * size + size)
    );
  
  const chunks = chunkArray(dataRows, 20);
  const totalRows = dataRows.length;
  let processedRows = 0;
  onProgress?.(0, totalRows);

  for (const chunk of chunks) {
    const batchStats = await processRowBatch({
      rawRows: chunk,
      columnMapping,
      domainColIdx: domainColIdx !== undefined ? parseInt(domainColIdx) : undefined,
      websiteColIdx: websiteColIdx !== undefined ? parseInt(websiteColIdx) : undefined,
      sourceType: result.source_type,
      funnelId,
      batchId,
      sourceFileName,
      seenDomains,
    });
    result.total_rows        += batchStats.total_rows;
    result.new_companies     += batchStats.new_companies;
    result.matched_companies += batchStats.matched_companies;
    result.updated_companies += batchStats.updated_companies;
    result.duplicates_skipped += batchStats.duplicates_skipped;
    result.domain_conflicts  += batchStats.domain_conflicts;
    for (const [f, c] of Object.entries(batchStats.fields_updated))
      result.fields_updated[f] = (result.fields_updated[f] || 0) + (c as number);
    for (const [f, c] of Object.entries(batchStats.skipped_fields))
      result.skipped_fields[f] = (result.skipped_fields[f] || 0) + (c as number);
    result.errors.push(...batchStats.errors);

    processedRows += chunk.length;
    onProgress?.(processedRows, totalRows);
  }

  // Persist the batch summary (or drop the empty shell if nothing was imported).
  if (result.total_rows === 0 && Object.keys(result.fields_updated).length === 0) {
    await deleteUploadBatch(batchId);
    result.batch_id = undefined;
  } else {
    await finalizeUploadBatch(batchId, {
      total_rows:        result.total_rows,
      new_companies:     result.new_companies,
      matched_companies: result.matched_companies,
      fields_updated:    result.fields_updated,
      skipped_fields:    result.skipped_fields,
    });
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

// ─────────────────────────────────────────────────────────────────────────────
// Shared row-processing kernel — called by both parseAndImportCsv (file path)
// AND the /api/upload/batch endpoint (chunked JSON path).
// ─────────────────────────────────────────────────────────────────────────────

export interface ProcessRowBatchInput {
  /** Pre-parsed data rows as raw string arrays (from the original CSV). */
  rawRows: string[][];
  /** index → field mapping already resolved for this source. */
  columnMapping: Record<number, string>;
  domainColIdx?: number;
  websiteColIdx?: number;
  sourceType: CsvSourceType;
  funnelId: number;
  batchId: number;
  sourceFileName?: string | null;
  /** Shared dedup set across multiple calls for the same upload session. */
  seenDomains: Set<string>;
}

export interface ProcessRowBatchOutput {
  total_rows: number;
  new_companies: number;
  matched_companies: number;
  updated_companies: number;
  duplicates_skipped: number;
  domain_conflicts: number;
  fields_updated: Record<string, number>;
  skipped_fields: Record<string, number>;
  errors: string[];
}

export async function processRowBatch(input: ProcessRowBatchInput): Promise<ProcessRowBatchOutput> {
  const {
    rawRows, columnMapping, domainColIdx, websiteColIdx,
    sourceType, funnelId, batchId, sourceFileName, seenDomains,
  } = input;

  const out: ProcessRowBatchOutput = {
    total_rows: 0, new_companies: 0, matched_companies: 0,
    updated_companies: 0, duplicates_skipped: 0, domain_conflicts: 0,
    fields_updated: {}, skipped_fields: {}, errors: [],
  };

  const pending: BatchChangeRow[] = [];
  const pendingDecisions: MatchDecisionRow[] = [];

  // Process rows SEQUENTIALLY — each row fires ~6 DB queries
  // (isInMasterIcp, findCompanyByDomainSmart, upsertCompanyTracked,
  // linkCompanyToFunnel, addDomainAlias, addDataSource).
  // Running 100 rows with Promise.all = ~600 simultaneous connections
  // against a pool of 3 → connection exhaustion after a few chunks.
  // Sequential is slower per-chunk but completely stable and still fast
  // enough (each row typically takes 30-100ms, 100 rows ≈ 3-10s).
  for (const row of rawRows) {
    if (!row || row.length < 1) continue;
    out.total_rows++;

    try {
      let rawDomain = domainColIdx !== undefined ? row[domainColIdx] : '';
      if (!rawDomain && websiteColIdx !== undefined) {
        rawDomain = row[websiteColIdx];
      }

      if (!rawDomain || rawDomain.trim().length < 3) continue;

      const domain = normalizeDomain(rawDomain);
      if (!domain || domain.length < 4 || !domain.includes('.')) continue;

      if (seenDomains.has(domain)) {
        out.duplicates_skipped++;
        continue;
      }
      seenDomains.add(domain);

      const companyData: Record<string, unknown> = { domain };
      let rawCrunchbaseFunding: string | undefined; // pre-strip cell, for currency-symbol detection

      for (const [colIdx, field] of Object.entries(columnMapping)) {
        const value = row[parseInt(colIdx)]?.trim();
        if (!value || value === '') continue;
        if (field === 'crunchbase_funding') rawCrunchbaseFunding = value;

        switch (field) {
          case 'domain':
          case 'website':
            if (field === 'website') companyData.website = value;
            break;
          case 'apollo_employees':
          case 'employee_reo':
          case 'crunchbase_employees':
          case 'total_funding':
          case 'latest_funding_amount':
          case 'annual_revenue':
          case 'founded_year':
          case 'crunchbase_funding':
          case 'revenue_reo':
          case 'sales_team_count':
            companyData[field] = parseNumeric(value);
            break;
          case 'is_in_apollo':
          case 'needs_manual_review':
          case 'is_nonprofit':
            companyData[field] = parseBoolean(value) ? 1 : 0;
            break;
          case 'is_netnew':
            break; // Computed, not imported
          case 'company_name':
            if (!isJunkName(value)) companyData.company_name = value;
            break;
          default:
            companyData[field] = value;
        }
      }

      if (!companyData.website) {
        companyData.website = `https://${domain}`;
      }

      // ── Crunchbase funding → USD ──────────────────────────────────────
      // Convert to USD ONLY on an EXPLICIT currency signal: a currency column or
      // an unambiguous symbol in the cell. We deliberately do NOT infer from
      // country — many companies (esp. India/Israel) report funding in USD on
      // Crunchbase, so a country guess wrongly shrinks already-USD values. No
      // signal ⇒ leave the number exactly as uploaded.
      if (
        sourceType === 'crunchbase' &&
        typeof companyData.crunchbase_funding === 'number' &&
        companyData.crunchbase_funding > 0
      ) {
        const currency =
          knownCurrency(companyData._funding_currency as string | undefined) ??
          currencyFromSymbol(rawCrunchbaseFunding);
        if (currency) {
          companyData.crunchbase_funding = toUsd(companyData.crunchbase_funding, currency);
        }
      }
      delete companyData._funding_currency; // transient — never a DB column

      if (sourceType === 'apollo') {
        companyData.is_in_apollo = 1;
      }

      // Check NetNew status
      const inMaster = await isInMasterIcp(domain);
      companyData.is_netnew = inMaster ? 0 : 1;

      // Smart Domain Resolution
      const smartMatch = await findCompanyByDomainSmart(
        domain,
        companyData.company_name as string | undefined,
        companyData.company_linkedin_url as string | undefined,
      );

      const upsertOpts = { source: sourceType };
      let up: UpsertResult;

      if (smartMatch && smartMatch.confidence === 'exact') {
        companyData.domain = smartMatch.domain;
        up = await upsertCompanyTracked(companyData, upsertOpts);
        pendingDecisions.push({
          batch_id: batchId, input_domain: domain,
          matched_domain: smartMatch.domain, company_id: up.id,
          match_method: smartMatch.matchType,
          match_detail: domain === smartMatch.domain ? null : `${domain} → ${smartMatch.domain}`,
          confidence: 'exact',
        });
      } else if (smartMatch) {
        up = await upsertCompanyTracked(companyData, upsertOpts);
        await createMergeCandidate(
          smartMatch.id, up.id, smartMatch.matchType,
          `${domain} ↔ ${smartMatch.domain} (${smartMatch.matchType})`,
          smartMatch.confidence,
        );
        out.domain_conflicts++;
        pendingDecisions.push({
          batch_id: batchId, input_domain: domain,
          matched_domain: smartMatch.domain, company_id: up.id,
          match_method: 'merge_candidate',
          match_detail: `${domain} ↔ ${smartMatch.domain} via ${smartMatch.matchType}`,
          confidence: smartMatch.confidence,
        });
      } else {
        up = await upsertCompanyTracked(companyData, upsertOpts);
        pendingDecisions.push({
          batch_id: batchId, input_domain: domain,
          matched_domain: null, company_id: up.id,
          match_method: 'new_insert',
          match_detail: null,
          confidence: 'none',
        });
      }

      const companyId = up.id;
      await linkCompanyToFunnel(companyId, funnelId);

      const rootName = extractRootName(domain);
      await addDomainAlias(companyId, domain, rootName, sourceType, up.wasInsert);

      for (const c of up.applied) {
        pending.push({ company_id: companyId, was_insert: up.wasInsert, field: c.field, old_value: c.old_value, new_value: c.new_value });
        out.fields_updated[c.field] = (out.fields_updated[c.field] || 0) + 1;
      }
      for (const s of up.skipped) {
        out.skipped_fields[s] = (out.skipped_fields[s] || 0) + 1;
      }

      const appliedNames = up.applied.map(c => c.field);
      if (appliedNames.length > 0 && sourceFileName) {
        await addDataSource(companyId, sourceType, sourceFileName, appliedNames);
      }

      if (up.wasInsert) {
        out.new_companies++;
      } else {
        out.matched_companies++;
        out.updated_companies++;
      }
    } catch (err) {
      out.errors.push(`Row: ${(err as Error).message}`);
    }
  }

  await recordFieldChanges(batchId, pending);
  await recordMatchDecisions(pendingDecisions);

  return out;
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

  // Retroactively sync is_netnew for any existing companies that match the new master list
  try {
    const { isExactRootMatch } = await import('./domain-utils');
    const masterRes = await qp('SELECT domain FROM master_icp');
    const masterDomains = masterRes.map((r: any) => r.domain as string);

    const netnewRes = await qp('SELECT id, domain FROM companies WHERE is_netnew = 1');
    const toUpdate: number[] = [];

    for (const c of netnewRes) {
      for (const mDomain of masterDomains) {
        if (isExactRootMatch(c.domain as string, mDomain)) {
          toUpdate.push(c.id as number);
          break;
        }
      }
    }

    if (toUpdate.length > 0) {
      await qp('UPDATE companies SET is_netnew = 0 WHERE id = ANY($1::int[])', [toUpdate]);
    }
  } catch (err) {
    errors.push(`Failed to sync is_netnew flags: ${(err as Error).message}`);
  }

  return { imported, errors };
}
