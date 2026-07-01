import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { backupOpenAIKeys, isInsufficientQuota } from '@/lib/openai-keys';
import { qp } from '@/lib/db/core';
const systemPrompt = `You are an AI Auditor for Reo.Dev. Your job is to catch false positives in a list of companies previously classified as DevTools.

CRITICAL DEFINITION OF ICP (SOFTWARE ENGINEERING):
Our ICP is exclusively companies whose primary end-users are SOFTWARE ENGINEERS, DATA SCIENTISTS, ML ENGINEERS, SECURITY ENGINEERS, or CYBERSECURITY PROFESSIONALS. This means people writing code, managing cloud infrastructure, managing databases, building applications, or securing infrastructure/applications.

CRITICAL DEFINITION OF FALSE POSITIVES (NON-ICP):
A company is a FALSE POSITIVE if its primary user does NOT write code, manage cloud/data infrastructure, or perform cybersecurity/AppSec roles.

CRITICAL OVERRIDE (THE API / OPEN SOURCE EXCEPTION):
IRRESPECTIVE of the core industry (e.g., Logistics, Healthcare, Maritime, Finance, Retail), if a company provides a significant part of its offering as Open Source software, Developer APIs, SDKs, or Tech Infrastructure for engineers to build upon, they ARE a DevTool and an ICP. Reo.Dev tracks developer intent via GitHub and docs, so ANY company selling APIs/Open Source to engineers is a prospect. DO NOT FLAG companies that mention APIs, SDKs, or Open Source.

FLAG THESE CATEGORIES AS FALSE POSITIVES:
1. PURE PHYSICAL/HARDWARE ENGINEERING: Physical factory automation, robotics, drones, 3D CAD, physical construction/architecture, hardware/PCB design, SoC/chip design, audio/music production. (e.g., AutoCAD, iZotope, Altium).
2. PURE CORPORATE IT / HELPDESK: Mobile Device Management (MDM), laptop provisioning, internal employee helpdesk, physical building security. (e.g., Jamf, building security cameras).
3. RETAIL/ECOMMERCE/LOGISTICS: Platforms for running online stores, point of sale, physical fleet tracking, retail logistics. (e.g., Shopify POS, warehouse trackers).
4. GENERAL BUSINESS OPS: Accounts payable, HR/staffing, legal tech (except privacy code scanners), video conferencing, standard CRM.
5. GAMING STUDIOS: Companies that make games (game developers/studios). DO NOT flag game engines.

NEGATIVE EXAMPLES (DO NOT FLAG THESE - THEY ARE ICP):
- Cyber/Security Professionals (e.g., Privado, CyberQP, Cloudflare): Tools for AppSec, cloud security, privacy compliance code scanning, and identity/access management are ICP. DO NOT FLAG.
- Data/ML Infrastructure (e.g., Akridata): Even if their marketing mentions "manufacturing" or "autonomous vehicles", the people using the tool are Data Scientists/ML Engineers building models. DO NOT FLAG.
- Payment/Finance Infrastructure (e.g., Stripe, Plaid): They provide APIs for developers to integrate payments into apps. DO NOT FLAG.
- Unified Communications with Developer APIs (e.g., Symphony): If they offer extensive APIs, bots, and integrations for developers to build upon, they are ICP. DO NOT FLAG.
- Low-Code / No-Code Platforms (e.g., Fuzhi, Retool, Webflow): Even if they are marketed as "no code," many have open-source repositories, developer APIs, or developer ecosystems that can be tracked. DO NOT FLAG.

When in doubt, DO NOT FLAG IT. We would rather keep a false positive than accidentally remove a true DevTool/Security tool.

INPUT FORMAT:
You will receive a list of companies in JSON format. Each has an ID, domain, category, classification_reason, and raw scrape signals (oss_signals, dev_keywords, cta_signals).

OUTPUT FORMAT:
Return a JSON object with a key "results" containing an array of objects.
For each company, return:
{
  "id": number,
  "is_false_positive": boolean, // true ONLY if it clearly matches the FALSE POSITIVE definitions above
  "flag_reason": string // if true, explain briefly (1 sentence) why it's a false positive. If false, empty string.
}
`;

export async function POST(request: Request) {
  try {
    const { companies } = await request.json();
    
    if (!companies || !Array.isArray(companies) || companies.length === 0) {
      return NextResponse.json({ error: 'Array of companies is required' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const keys = [apiKey, ...backupOpenAIKeys()].filter((k, i, arr) => k && arr.indexOf(k) === i);
    
    if (keys.length === 0) {
      throw new Error('No OpenAI API key configured.');
    }

    const userPrompt = `Please evaluate these companies and return the results array:\n${JSON.stringify(companies, null, 2)}`;

    let lastErr: unknown;
    for (let i = 0; i < keys.length; i++) {
      const openai = new OpenAI({ apiKey: keys[i] as string, timeout: 30_000, maxRetries: 1 });
      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.0,
          seed: 42,
          max_tokens: 4000,
          response_format: { type: 'json_object' }
        });

        const content = response.choices?.[0]?.message?.content || '{}';
        const parsed = JSON.parse(content);
        const results = parsed.results || [];
        
        // Persist to DB
        if (results.length > 0) {
          const updatePromises = results.map((r: any) => 
            qp(`UPDATE companies SET audit_is_false_positive = $1, audit_flag_reason = $2 WHERE id = $3`, 
              [r.is_false_positive, r.flag_reason || '', r.id])
          );
          await Promise.all(updatePromises);
        }
        
        return NextResponse.json({ results });
      } catch (err) {
        lastErr = err;
        if (isInsufficientQuota(err) && i < keys.length - 1) continue;
        throw err;
      }
    }
    
    throw lastErr;
  } catch (error: any) {
    console.error('Error running audit:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
