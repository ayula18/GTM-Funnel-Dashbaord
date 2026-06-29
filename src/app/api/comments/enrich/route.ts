export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { ensureCommentTables, enrichProfiles } from '@/lib/db';

export async function POST(request: Request) {
  try {
    await ensureCommentTables();

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'CSV file required' }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());

    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV must have at least a header row and one data row' }, { status: 400 });
    }

    // Parse headers
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));

    // Find relevant columns
    const slugIdx = headers.findIndex(h =>
      h.includes('slug') || h === 'profile url' || h === 'linkedin url' ||
      h === 'url' || h === 'linkedin' || h === 'person linkedin url' || h === 'linkedin_profile_url'
    );
    let companyIdx = headers.findIndex(h =>
      (h.includes('company') && !h.includes('linkedin')) || h === 'company name' || h === 'company_name'
    );

    let domainIdx = headers.findIndex(h =>
      h.includes('domain') || h === 'website' || h === 'domain_url'
    );
    const companyLinkedinIdx = headers.findIndex(h =>
      h === 'company linkedin' || h === 'company linkedin url' || h === 'company_linkedin_url'
    );
    const icpIdx = headers.findIndex(h =>
      h === 'icp' || h === 'is icp?' || h === 'is_icp' || h === 'icp status' || h === 'icp_status'
    );

    if (slugIdx < 0) {
      return NextResponse.json({
        error: 'CSV must contain a column for LinkedIn profile identification (slug, profile url, linkedin url, etc.)',
      }, { status: 400 });
    }

    // Parse rows
    const updates: Array<{
      slug: string;
      enriched_company_name?: string;
      enriched_company_domain?: string;
      enriched_company_linkedin?: string;
      icp_status?: string;
    }> = [];

    for (let i = 1; i < lines.length; i++) {
      // Simple CSV field parser that handles quoted fields
      const fields: string[] = [];
      let current = '';
      let inQuote = false;
      for (const ch of lines[i]) {
        if (ch === '"') { inQuote = !inQuote; continue; }
        if (ch === ',' && !inQuote) { fields.push(current.trim()); current = ''; continue; }
        current += ch;
      }
      fields.push(current.trim());

      const rawSlug = fields[slugIdx] || '';
      // Extract the slug from the URL to match DB records exactly
      const slug = rawSlug.replace(/.*\/in\//, '').replace(/\/$/, '');
      if (!slug) continue;

      updates.push({
        slug,
        enriched_company_name: companyIdx >= 0 ? fields[companyIdx] || undefined : undefined,
        enriched_company_domain: domainIdx >= 0 ? fields[domainIdx] || undefined : undefined,
        enriched_company_linkedin: companyLinkedinIdx >= 0 ? fields[companyLinkedinIdx] || undefined : undefined,
        icp_status: icpIdx >= 0 ? fields[icpIdx] || undefined : undefined,
      });
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No valid rows found in CSV' }, { status: 400 });
    }

    const result = await enrichProfiles(updates);

    return NextResponse.json({
      total_rows: updates.length,
      matched: result.matched,
      updated: result.updated,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
