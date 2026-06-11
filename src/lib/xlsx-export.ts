import ExcelJS from 'exceljs';
import { getCompanies, getFunnel, getFunnelSteps, getFunnelDailyInsights } from './db';
import { getCategorizationData } from './db/companies';
import { getBucketId } from './bucketing';
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
  gtm_bucket: 'GTM Bucket (Computed)',
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
  
  // Compute dynamic buckets before rendering
  companies.forEach(c => {
    c.gtm_bucket = getBucketId(c);
  });

  const steps = await getFunnelSteps(funnelId) as unknown as FunnelSteps;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ICP Dashboard';
  wb.created = new Date();

  const dailyInsights = await getFunnelDailyInsights(funnelId);
  buildInsightsSheet(wb, steps, dailyInsights);

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
    'domain', 'company_name', 'company_country', 'apollo_employees', 'sales_team_count', 'employee_reo',
    'total_funding', 'crunchbase_funding', 'annual_revenue', 'revenue_reo', 'founded_year',
    'company_linkedin_url',
    'icp_decision', 'company_classification', 'category', 'confidence', 'is_netnew', 'subsidiary_of',
    'gtm_bucket', 'manual_gtm_bucket', 'manual_gtm_reason'
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
    ['domain', 'company_name', 'apollo_employees', 'sales_team_count', 'total_funding', 'latest_funding',
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

function buildInsightsSheet(wb: ExcelJS.Workbook, steps: FunnelSteps, dailyInsights: any[]) {
  const ws = wb.addWorksheet('Insights', { views: [{ showGridLines: false }] });
  
  // Funnel View Section
  ws.mergeCells('A1:G1');
  const title1 = ws.getCell('A1');
  title1.value = 'After new automation';
  title1.font = { bold: true };
  title1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF68A2EB' } };
  title1.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell('A2').value = 'Step 1';
  ws.getCell('B2').value = 'Step 2 [Base]';
  ws.getCell('C2').value = 'Step 3';
  ws.mergeCells('D2:E2');
  ws.getCell('D2').value = 'Step 4';
  ws.mergeCells('F2:G2');
  ws.getCell('F2').value = 'Step 5';

  const stepRow = ws.getRow(2);
  stepRow.font = { bold: true };
  stepRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
  stepRow.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell('A3').value = 'Raw dump';
  ws.getCell('B3').value = 'Running list through apollo';
  ws.getCell('C3').value = 'More than 1 > Employe';
  ws.mergeCells('D3:E3');
  ws.getCell('D3').value = 'Is ICP or Not?';
  ws.mergeCells('F3:G3');
  ws.getCell('F3').value = 'Data from NetNew';
  ws.getRow(3).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell('D4').value = 'Total';
  ws.getCell('E4').value = 'NetNew';
  ws.getCell('F4').value = 'Is DevTool?';
  ws.getCell('G4').value = 'Is IT & Services';
  ws.getRow(4).font = { bold: true };
  ws.getRow(4).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell('A5').value = steps.step1_raw;
  ws.getCell('B5').value = steps.step2_apollo;
  ws.getCell('C5').value = steps.step3_employees;
  ws.getCell('D5').value = steps.step4_icp_total;
  ws.getCell('E5').value = steps.step4_icp_netnew;
  ws.getCell('F5').value = steps.step5_netnew_devtool;
  ws.getCell('G5').value = steps.step5_netnew_it;
  ws.getRow(5).alignment = { horizontal: 'center', vertical: 'middle' };

  // Adjust column widths
  ws.getColumn('A').width = 25;
  ws.getColumn('B').width = 30;
  ws.getColumn('C').width = 25;
  ws.getColumn('D').width = 15;
  ws.getColumn('E').width = 15;
  ws.getColumn('F').width = 20;
  ws.getColumn('G').width = 25;

  // Add borders to the first table
  for (let r = 1; r <= 5; r++) {
    for (let c = 1; c <= 7; c++) {
      if (r === 4 && c < 4) continue; // blank cells
      const cell = ws.getCell(r, c);
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      };
    }
  }

  // Daily Insights Section
  const startRow = 8;
  ws.getCell(`B${startRow}`).value = 'Total Domains checked';
  ws.getCell(`C${startRow}`).value = 'Is DevTool?*';
  ws.getCell(`D${startRow}`).value = 'Is IT & Services*';
  
  const headerRow = ws.getRow(startRow);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F2FF' } }; // Light blue like screenshot
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

  let currentRow = startRow + 1;
  let sumDomains = 0;
  let sumIcpsDevTool = 0;
  let sumIcpsIT = 0;

  for (const insight of dailyInsights) {
    const dateStr = insight.date instanceof Date 
      ? insight.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : String(insight.date);

    ws.getCell(`A${currentRow}`).value = dateStr;
    ws.getCell(`B${currentRow}`).value = insight.total_checked;
    ws.getCell(`C${currentRow}`).value = insight.icps_devtool;
    ws.getCell(`D${currentRow}`).value = insight.icps_it;
    ws.getRow(currentRow).alignment = { horizontal: 'center', vertical: 'middle' };
    
    sumDomains += insight.total_checked;
    sumIcpsDevTool += insight.icps_devtool;
    sumIcpsIT += insight.icps_it;
    currentRow++;
  }

  // Empty row before total if needed, but screenshot shows it right after
  ws.getCell(`A${currentRow}`).value = 'Total';
  ws.getCell(`B${currentRow}`).value = sumDomains;
  ws.getCell(`C${currentRow}`).value = sumIcpsDevTool;
  ws.getCell(`D${currentRow}`).value = sumIcpsIT;
  const totalRow = ws.getRow(currentRow);
  totalRow.font = { bold: true };
  totalRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // Add borders to the second table
  for (let r = startRow; r <= currentRow; r++) {
    for (let c = 1; c <= 4; c++) {
      if (r === startRow && c === 1) continue; // Top left is blank
      const cell = ws.getCell(r, c);
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      };
    }
  }

  currentRow++;
  ws.mergeCells(`A${currentRow}:D${currentRow}`);
  const footer = ws.getCell(`A${currentRow}`);
  footer.value = '* Developer focussed companies > 1 emp, Note funding data not checked for this yet';
  footer.font = { size: 10 };
  footer.alignment = { horizontal: 'left', vertical: 'middle' };
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
  const overviewNote = ws.addRow(['(Raw aggregate counts for all imported domains in the database)']);
  overviewNote.font = { italic: true, size: 10, color: { argb: 'FF666666' } };
  
  kv('Total companies', funnel.total_companies);
  kv('Classified', funnel.classified);
  kv('Unclassified', funnel.unclassified);
  kv('ICP — Yes', funnel.icp_yes);
  kv('ICP — No', funnel.icp_no);
  kv('ICP — Review', funnel.icp_review);
  kv('NetNew', funnel.netnew);
  ws.addRow([]);

  section('Funnel Steps');
  const funnelNote = ws.addRow(['(Sequential survival gauntlet: a company MUST pass Step N to reach Step N+1)']);
  funnelNote.font = { italic: true, size: 10, color: { argb: 'FF666666' } };
  
  const stepHeader = ws.addRow(['Step', 'Passed', 'Dropped']);
  stepHeader.font = { bold: true };
  ws.addRow(['1 · Raw Import', steps.step1_raw, '']);
  ws.addRow(['2 · In Apollo', steps.step2_apollo, steps.step2_drop]);
  ws.addRow(['3 · Has Employees', steps.step3_employees, steps.step3_drop]);
  ws.addRow(['4 · ICP = Yes', steps.step4_icp_total, steps.step4_drop]);
  ws.addRow(['5 · Funded / Revenue', steps.step5_funded_total, steps.step5_drop]);
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

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, funnelName: 'Categorization' };
}
