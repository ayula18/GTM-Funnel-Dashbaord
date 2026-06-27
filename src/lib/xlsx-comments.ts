import ExcelJS from 'exceljs';
import { qp } from './db/core';

export interface CommentIntelWorkbook {
  buffer: Buffer;
  fileName: string;
}

export async function buildCommentIntelWorkbook(campaignTag: string): Promise<CommentIntelWorkbook> {
  // 1. Query all profiles and their interactions for this campaign
  const profiles = await qp(`
    SELECT 
      pr.name, 
      pr.slug, 
      pr.headline, 
      pr.parsed_company, 
      pr.enriched_company_domain, 
      pr.icp_status,
      pr.company_id,
      COALESCE(SUM(CASE WHEN i.type = 'comment' THEN 1 ELSE 0 END), 0) as comment_count,
      COALESCE(SUM(CASE WHEN i.type = 'reaction' THEN 1 ELSE 0 END), 0) as reaction_count,
      STRING_AGG(DISTINCT i.type, ', ') as interaction_types,
      STRING_AGG(DISTINCT p.post_url, ', ') as post_urls
    FROM linkedin_profiles pr
    JOIN (
      SELECT profile_id, post_id, 'comment' as type FROM linkedin_comments
      UNION ALL
      SELECT profile_id, post_id, 'reaction' as type FROM linkedin_reactions
    ) i ON i.profile_id = pr.id
    JOIN linkedin_posts p ON p.id = i.post_id
    WHERE p.campaign_tag = $1
    GROUP BY pr.id
    ORDER BY pr.icp_status DESC, pr.name ASC
  `, [campaignTag]);

  // 2. See which ones are customers (if company_id is linked to funnel 6, wait, the main dashboard uses a customer check.
  // We can just query if the company_id exists in funnel 6 or has some customer flag, but for now we'll just check if they are in funnel 6 if that's the standard, or skip it if it's too complex. The UI does check if they are in funnel 6.)
  const customerRows = await qp(`SELECT company_id FROM funnel_companies WHERE funnel_id = 6`);
  const customerCompanyIds = new Set(customerRows.map((r: any) => r.company_id));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ICP Dashboard';
  wb.created = new Date();

  const ws = wb.addWorksheet('Comment Intel', { views: [{ state: 'frozen', ySplit: 1 }] });

  const columns = [
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Headline', key: 'headline', width: 50 },
    { header: 'Profile URL', key: 'url', width: 45 },
    { header: 'Parsed Company', key: 'parsed_company', width: 25 },
    { header: 'Enriched Domain', key: 'enriched_domain', width: 25 },
    { header: 'ICP Status', key: 'icp_status', width: 15 },
    { header: 'Customer?', key: 'is_customer', width: 15 },
    { header: 'Comments', key: 'comments', width: 12 },
    { header: 'Reactions', key: 'reactions', width: 12 },
    { header: 'Interaction Type', key: 'types', width: 20 },
    { header: 'Post URLs', key: 'posts', width: 50 },
  ];

  ws.columns = columns;

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }; // Indigo-600
  header.alignment = { vertical: 'middle' };

  for (const p of profiles) {
    const isCustomer = p.company_id ? customerCompanyIds.has(p.company_id) : false;
    
    ws.addRow({
      name: p.name,
      headline: p.headline,
      url: p.slug ? (String(p.slug).startsWith('http') ? p.slug : `https://linkedin.com/in/${p.slug}`) : '',
      parsed_company: p.parsed_company,
      enriched_domain: p.enriched_company_domain,
      icp_status: p.icp_status || 'Pending',
      is_customer: isCustomer ? 'Yes' : 'No',
      comments: Number(p.comment_count),
      reactions: Number(p.reaction_count),
      types: p.interaction_types,
      posts: p.post_urls
    });
  }

  if (profiles.length > 0) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }

  // Generate safe filename
  const safeName = campaignTag.replace(/[^\w\- ]+/g, '').trim() || 'Campaign';
  const date = new Date().toISOString().split('T')[0];
  const fileName = `Comment Intel - ${safeName}.xlsx`; // Removed the date so it can be predictably synced/overwritten without making a mess, or if we keep the date, it will create a new file every day. The prompt asked to sync to the SAME sheet in drive. So the filename must be static per campaign!
  // Actually, wait, if the filename has a date, upsertXlsxToDrive will create a NEW file every day! 
  // We MUST NOT include the date in the filename if we want it to sync to the same file forever.
  const staticFileName = `Comment Intel - ${safeName}.xlsx`;

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, fileName: staticFileName };
}
