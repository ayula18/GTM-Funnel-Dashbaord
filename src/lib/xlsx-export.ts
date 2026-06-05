import ExcelJS from 'exceljs';
import { getCompanies, getFunnel, getFunnelSteps } from './db';
import { getCategorizationData } from './db/companies';
import type { FunnelSteps, Company } from './types';

// ── Funnel → multi-tab Excel workbook ────────────────────────────────────────
// Mirrors the live funnel state (NOT the original raw CSV files, which aren't
// stored) into one .xlsx with tabs: Main View · ICP Results · per-source
// enrichment · Funnel Summary · Discarded.

type Row = Record<string, unknown>;

const LABELS: Record<string, string> = {
  domain: 'Domain', company_name: 'Company Name', company_country: 'Country',
  website: 'Website', company_linkedin_url: 'LinkedIn (Apollo)',
  apollo_employees: 'Employees (Apollo)', employee_reo: 'Employees (Reo)',
  total_funding: 'Total Funding (Apollo)', crunchbase_funding: 'Funding (Crunchbase)',
  crunchbase_funding_type: 'Funding Type (CB)', annual_revenue: 'Annual Revenue',
  revenue_reo: 'Revenue (Reo)', latest_funding: 'Latest Funding Round',
  latest_funding_amount: 'Latest Funding Amount', last_raised_at: 'Last Raised At',
  founded_year: 'Founded Year', sic_codes: 'SIC Codes', naics_codes: 'NAICS Codes',
  short_description: 'Description', subsidiary_of: 'Subsidiary Of',
  is_in_apollo: 'In Apollo', is_netnew: 'NetNew',
  icp_decision: 'ICP Decision', manual_icp: 'Manual ICP',
  company_classification: 'Classification', category: 'Category', sub_category: 'Sub Category',
  company_type: 'Company Type', icp_fit_level: 'ICP Fit Level', confidence: 'Confidence',
  needs_manual_review: 'Needs Review', classification_reason: 'Reason',
  observations: 'Observations', discard_reason: 'Discard Reason', discard_step: 'Discard Step',
  sales_team_count: 'Sales Team', manual_gtm_bucket: 'Manual Bucket', 
  manual_gtm_reason: 'Manual Reason', funnel_names: 'Funnel Sources',
};
const label = (k: string) => LABELS[k] || k;

// 0/1 columns shown as Yes / blank for readability.
const BOOL_FIELDS = new Set(['is_netnew', 'is_in_apollo', 'needs_manual_review']);

function cellValue(row: Row, key: string): string | number | null {
  const v = row[key];
  if (v === null || v === undefined || v === '') return null;
  if (BOOL_FIELDS.has(key)) return Number(v) === 1 ? 'Yes' : '';
  if (typeof v === 'number') return v;
  return String(v);
}

export interface FunnelWorkbook { buffer: Buffer; funnelName: string }

export async function buildFunnelWorkbook(funnelId: number): Promise<FunnelWorkbook> {
  const funnel = await getFunnel(funnelId);
  if (!funnel) throw new Error('Funnel not found');
  const funnelName = (funnel.name as string) || `Funnel ${funnelId}`;

  const { data } = await getCompanies(funnelId, {
    page: 1, per_page: 100000, sort_by: 'c.company_name', sort_order: 'asc',
  });
  const companies = data as Row[];
  const steps = await getFunnelSteps(funnelId) as unknown as FunnelSteps;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ICP Dashboard';
  wb.created = new Date();

  const addSheet = (name: string, keys: string[], rows: Row[]) => {
    const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = keys.map(k => ({
      header: label(k),
      key: k,
      width: Math.min(40, Math.max(12, label(k).length + 4)),
    }));
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    header.alignment = { vertical: 'middle' };
    for (const r of rows) ws.addRow(keys.map(k => cellValue(r, k)));
    if (rows.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: keys.length } };
    }
  };

  // 1) Main View
  addSheet('Main View', [
    'domain', 'company_name', 'company_country', 'apollo_employees', 'employee_reo',
    'total_funding', 'crunchbase_funding', 'annual_revenue', 'revenue_reo', 'founded_year',
    'company_linkedin_url',
    'icp_decision', 'company_classification', 'category', 'confidence', 'is_netnew', 'subsidiary_of',
  ], companies);

  // 2) ICP Results — only companies that have been classified / decided
  const icpRows = companies.filter(c => c.classified_at || c.icp_decision);
  addSheet('ICP Results', [
    'domain', 'company_name', 'icp_decision', 'manual_icp', 'company_classification',
    'category', 'sub_category', 'company_type', 'icp_fit_level', 'confidence',
    'needs_manual_review', 'classification_reason', 'observations',
  ], icpRows);

  // 3) Enrichment by source — each source's own columns, only rows that have data
  addSheet('Apollo',
    ['domain', 'company_name', 'apollo_employees', 'total_funding', 'latest_funding',
     'latest_funding_amount', 'last_raised_at', 'annual_revenue', 'company_linkedin_url',
     'sic_codes', 'naics_codes'],
    companies.filter(c => Number(c.is_in_apollo) === 1 || c.apollo_employees != null || c.total_funding != null),
  );
  addSheet('Reo DB',
    ['domain', 'company_name', 'employee_reo', 'revenue_reo'],
    companies.filter(c => c.employee_reo != null || c.revenue_reo != null),
  );
  addSheet('Crunchbase',
    ['domain', 'company_name', 'crunchbase_funding', 'crunchbase_funding_type'],
    companies.filter(c => c.crunchbase_funding != null),
  );

  // 4) Discarded — companies dropped out of the funnel, with the reason/step
  addSheet('Discarded', [
    'domain', 'company_name', 'discard_reason', 'discard_step',
    'icp_decision', 'company_classification', 'company_country',
  ], companies.filter(c => c.discard_reason));

  // 5) Funnel Summary — stats + the step funnel (key/value layout)
  buildSummarySheet(wb, funnel, steps);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, funnelName };
}

function buildSummarySheet(wb: ExcelJS.Workbook, funnel: Row, steps: FunnelSteps) {
  const ws = wb.addWorksheet('Funnel Summary');
  ws.columns = [{ width: 34 }, { width: 16 }, { width: 16 }];

  const title = ws.addRow([String(funnel.name ?? '')]);
  title.font = { bold: true, size: 14 };
  ws.addRow([`Exported ${new Date().toLocaleString()}`]).font = { italic: true, color: { argb: 'FF888888' } };
  ws.addRow([]);

  const section = (text: string) => {
    const r = ws.addRow([text]);
    r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  };
  const kv = (k: string, v: unknown) => { ws.addRow([k, Number(v) || 0]); };

  section('Overview');
  kv('Total companies', funnel.total_companies);
  kv('Classified', funnel.classified);
  kv('Unclassified', funnel.unclassified);
  kv('ICP — Yes', funnel.icp_yes);
  kv('ICP — No', funnel.icp_no);
  kv('ICP — Review', funnel.icp_review);
  kv('NetNew', funnel.netnew);
  ws.addRow([]);

  section('Funnel Steps');
  const stepHeader = ws.addRow(['Step', 'Passed', 'Dropped']);
  stepHeader.font = { bold: true };
  ws.addRow(['1 · Raw Import', steps.step1_raw, '']);
  ws.addRow(['2 · In Apollo', steps.step2_apollo, steps.step2_drop]);
  ws.addRow(['3 · Has Employees', steps.step3_employees, steps.step3_drop]);
  ws.addRow(['4 · ICP = Yes', steps.step4_icp_total, steps.step4_drop]);
  ws.addRow(['5 · Funded / Revenue', steps.step5_funded_total, steps.step5_drop]);
}

function getBucketId(company: any): string {
  if (company.manual_gtm_bucket) {
    return company.manual_gtm_bucket;
  }

  const isDevTool = company.company_classification === 'DevTool' || company.company_classification === 'DevTools';
  const isITServices = company.company_classification === 'IT Services & Solutions';
  const categoryStr = (company.category || '') + ' ' + (company.sub_category || '');
  const isApiSdk = categoryStr.toLowerCase().includes('api') || categoryStr.toLowerCase().includes('sdk');

  const employees = company.employee_reo || company.apollo_employees || 0;
  
  let funding = company.total_funding || 0;
  if (!funding && company.crunchbase_funding) funding = company.crunchbase_funding;
  
  let revenue = company.revenue_reo || company.annual_revenue || 0;

  const salesTeam = company.sales_team_count;

  if (!isDevTool) {
    if (isITServices || isApiSdk) {
      return 'future_icp';
    }
    return 'irrelevant';
  }

  if (employees >= 500) return 'enterprise';
  if (employees >= 200) return 'commercial';

  if (salesTeam !== null && salesTeam !== undefined) {
    if (salesTeam >= 2) return 'smb';
    if (salesTeam === 1 || (salesTeam === 0 && (funding >= 5000000 || revenue >= 3000000))) return 'startup';
    if (salesTeam === 0 && funding < 5000000 && revenue < 3000000) return 'immature';
  }

  if (employees >= 50) return 'smb';
  
  if (funding >= 5000000 || revenue >= 3000000) return 'startup';
  if (funding > 0 || revenue > 0) return 'immature';

  return 'unclassified';
}

export async function buildCategorizationWorkbook(funnelId: number | null, netNewFilter: string): Promise<FunnelWorkbook> {
  const data = await getCategorizationData(funnelId, netNewFilter);
  const companies = data as Row[];
  
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ICP Dashboard';
  wb.created = new Date();

  const addSheet = (name: string, keys: string[], rows: Row[]) => {
    const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = keys.map(k => ({
      header: LABELS[k] || k,
      key: k,
      width: Math.min(40, Math.max(12, (LABELS[k] || k).length + 4)),
    }));
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    header.alignment = { vertical: 'middle' };
    for (const r of rows) ws.addRow(keys.map(k => cellValue(r, k)));
    if (rows.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: keys.length } };
    }
  };

  const buckets: Record<string, Row[]> = {
    enterprise: [],
    commercial: [],
    smb: [],
    startup: [],
    immature: [],
    future_icp: [],
    irrelevant: [],
    unclassified: [],
  };

  for (const c of companies) {
    const bucketId = getBucketId(c);
    buckets[bucketId].push(c);
  }

  const exportColumns = [
    'domain', 'company_name', 'apollo_employees', 'employee_reo',
    'total_funding', 'crunchbase_funding', 'annual_revenue', 'revenue_reo',
    'sales_team_count', 'manual_gtm_bucket', 'manual_gtm_reason', 'funnel_names',
    'company_classification', 'category', 'sub_category', 'website', 'company_linkedin_url'
  ];

  addSheet('Enterprise', exportColumns, buckets.enterprise);
  addSheet('Commercial', exportColumns, buckets.commercial);
  addSheet('SMB', exportColumns, buckets.smb);
  addSheet('Startup', exportColumns, buckets.startup);
  addSheet('Immature', exportColumns, buckets.immature);
  addSheet('Future ICP', exportColumns, buckets.future_icp);
  addSheet('Irrelevant', exportColumns, buckets.irrelevant);
  addSheet('Unclassified', exportColumns, buckets.unclassified);

  const buffer = await wb.xlsx.writeBuffer();
  return { buffer: buffer as Buffer, funnelName: 'Categorization' };
}
