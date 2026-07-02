import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { backupOpenAIKeys, isInsufficientQuota } from '@/lib/openai-keys';
import { qp } from '@/lib/db/core';
import { scanDevSignals, DevSignalScan } from '@/lib/pipeline/dev-signal-scanner';

// ─── The Auditor v2 System Prompt ──────────────────────────────────────────
// Philosophy: Be a SNIPER, not a SHOTGUN. Only flag what you're EXTREMELY sure about.
const systemPrompt = `You are a precision auditor for Reo.Dev. Your job is to review companies that were classified as ICP (Ideal Customer Profile) and catch CLEAR false positives.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT REO.DEV DOES (YOU MUST UNDERSTAND THIS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reo.Dev helps B2B companies identify developer intent signals. It tracks:
- Which companies are reading their API documentation
- Which developers are starring/forking their GitHub repos
- Which engineers are visiting their developer portal
- Which teams are evaluating their SDK/tools

Therefore, a company is ICP for Reo.Dev if it SELLS TO developers/engineers and could benefit from knowing which companies are evaluating their product through developer activity signals.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE GOLDEN RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You are a SNIPER, not a SHOTGUN.
- Only flag companies you are EXTREMELY confident about (confidence ≥ 8/10).
- If there is ANY reasonable argument that a company could be ICP, DO NOT FLAG IT.
- It is FAR WORSE to wrongly flag a real ICP company than to let a false positive through.
- When in doubt: DO NOT FLAG.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE PROTECTION RULES (NEVER FLAG THESE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If ANY of the following are true, the company is ICP. DO NOT FLAG. Period.

1. DEVELOPER SIGNALS DETECTED: If the independent scan found developer signals 
   (dev_signal_score > 0), the company has developer-facing infrastructure.
   A company with API docs, SDKs, GitHub repos, developer portals, or package 
   registry presence is ALWAYS ICP. No exceptions.

2. GAME ENGINES & GAME INFRASTRUCTURE: Unity, Unreal, Godot, game SDKs, 
   blockchain gaming infrastructure (like Ronin), game development platforms.
   These are massive developer ecosystems. Game developers ARE software engineers.
   ONLY flag pure game STUDIOS that just MAKE games (not engines/tools/infra).

3. DEVELOPER APIS IN ANY INDUSTRY: Stripe (finance), Twilio (comms), 
   Plaid (banking), Codat (accounting data), Exotel (communications), 
   Yapily (banking), any company providing APIs for developers to integrate.
   The INDUSTRY doesn't matter — if developers integrate it via code, it's ICP.

4. FINOPS & CLOUD COST TOOLS: Apptio, Kubecost, CloudHealth, etc.
   These are used by engineering teams to manage cloud spend. ICP.

5. DEVICE MANAGEMENT WITH DEV/SECURITY FEATURES: Jamf, Mosyle, Esper, Kandji.
   These have developer APIs, security features, and are used by IT engineering 
   teams. They're borderline but NEVER flag them.

6. DATA CENTER & COLOCATION: Cyxtera, Equinix, etc.
   Infrastructure engineers depend on these. ICP.

7. IT SERVICES & CONSULTING: If they serve engineering teams (Wipro, TCS, 
   Accenture), they're ICP even though they sell services not products.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT TO ACTUALLY FLAG (THE NARROW LIST)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Only flag companies where ALL of these are true:
1. The primary end-user is clearly NOT a software engineer, DevOps, security 
   engineer, data engineer, or any technical role
2. The company has NO developer-facing surface (no APIs, no SDKs, no GitHub, 
   no developer portal, no technical documentation)
3. The dev_signal_score from the independent scan is 0

Examples of TRUE false positives to flag:
- Recruitment/staffing agencies (Airswift — sells people, not software)
- Physical construction management (Andpad — for builders on construction sites)
- Legal contract management (Ironclad — for lawyers)
- Direct mail automation (Lob — for marketing teams sending physical mail)
- Carbon credit trading (Xpansiv — for commodities traders)
- Food service robots (Bear Robotics — physical hardware)
- Emergency dispatch (RapidDeploy — for 911 operators)
- Font management (Monotype — for graphic designers)
- AI video generation for filmmakers (Moonvalley — for creative professionals)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REASONING FRAMEWORK (FOLLOW THIS ORDER)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For each company, reason through these steps:

STEP 1: Check developer signals
   → If dev_signal_score > 0 OR signals_found is not empty → STOP. NOT a false positive.

STEP 2: Think about Reo.Dev's value
   → Could Reo.Dev track developer activity for this company?
   → Does this company have any developer-facing surface (docs, APIs, GitHub)?
   → If YES → STOP. NOT a false positive.

STEP 3: Identify the PRIMARY buyer
   → Who writes the purchase order for this product?
   → If it's an engineering leader (VP Eng, CTO, CISO) → STOP. NOT a false positive.

STEP 4: Apply the Strip Test
   → Remove all tech buzzwords. What is the CORE job the end-user does?
   → Is that job fundamentally non-technical (recruiting, legal, marketing, 
     construction, farming, trading, dispatching)?
   → If YES and dev_signal_score is 0 → FLAG as false positive.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return a JSON object:
{
  "reasoning": "Your step-by-step reasoning (2-4 sentences). Show your work.",
  "is_false_positive": true/false,
  "confidence": 1-10 (ONLY flag if confidence >= 8),
  "flag_reason": "If flagging: 1 sentence explaining why. If not flagging: empty string."
}

CRITICAL: If confidence < 8, set is_false_positive to false regardless of your reasoning.
`;

// ─── Batch size for concurrent dev-signal scanning ──────────────────────────
const SCAN_CONCURRENCY = 5;

// ─── Main handler ──────────────────────────────────────────────────────────
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

    // ── Step 1: Independent dev-signal scan for all companies ──────────────
    console.log(`[Auditor v2] Scanning dev signals for ${companies.length} companies...`);
    const devSignals: Record<string, DevSignalScan> = {};
    
    // Scan in batches to avoid overwhelming the network
    for (let i = 0; i < companies.length; i += SCAN_CONCURRENCY) {
      const batch = companies.slice(i, i + SCAN_CONCURRENCY);
      const scanResults = await Promise.allSettled(
        batch.map((c: any) => scanDevSignals(c.domain))
      );
      
      scanResults.forEach((result, idx) => {
        const domain = batch[idx].domain;
        if (result.status === 'fulfilled') {
          devSignals[domain] = result.value;
        } else {
          devSignals[domain] = {
            domain,
            has_dev_signals: false,
            signals_found: [],
            signal_score: 0,
            raw_evidence: '',
            scrape_quality: 'failed', // Explicitly mark as failed
          };
        }
      });
    }

    // ── Step 2: Auto-pass companies with strong dev signals ─────────────────
    // If the scanner found strong signals, don't even waste an LLM call
    const AUTO_PASS_THRESHOLD = 3;
    const autoPassResults: any[] = [];
    const needsLlmAudit: any[] = [];

    for (const company of companies) {
      const scan = devSignals[company.domain];
      if (scan && scan.signal_score >= AUTO_PASS_THRESHOLD) {
        // Strong dev signals — auto-pass, no LLM needed
        autoPassResults.push({
          id: company.id,
          is_false_positive: false,
          confidence: 10,
          flag_reason: '',
          reasoning: `Auto-passed: ${scan.signals_found.length} developer signals detected (score: ${scan.signal_score}). Signals: ${scan.signals_found.slice(0, 5).join(', ')}`,
          dev_signals: scan.signals_found.join(', '),
          dev_signal_score: scan.signal_score,
        });
      } else {
        needsLlmAudit.push(company);
      }
    }

    console.log(`[Auditor v2] Auto-passed ${autoPassResults.length} companies with strong dev signals. Sending ${needsLlmAudit.length} to LLM.`);

    // ── Step 3: LLM audit for remaining companies ──────────────────────────
    const llmResults: any[] = [];
    
    if (needsLlmAudit.length > 0) {
      // Build the prompt with dev signal context
      const companiesWithSignals = needsLlmAudit.map((c: any) => {
        const scan = devSignals[c.domain];
        return {
          id: c.id,
          domain: c.domain,
          company_name: c.company_name,
          category: c.category,
          classification_reason: c.classification_reason,
          dev_signal_score: scan?.signal_score || 0,
          dev_signals_found: scan?.signals_found || [],
          dev_evidence: scan?.raw_evidence || 'None found',
          // CRITICAL: tells the LLM whether to trust a score of 0
          scrape_quality: scan?.scrape_quality || 'failed',
          scrape_note: (() => {
            const q = scan?.scrape_quality || 'failed';
            if (q === 'rich') return 'Website was successfully scraped with rich content. Score reflects actual signals.';
            if (q === 'thin') return 'WARNING: Website scrape returned thin/minimal content (likely a JS SPA). Score may be UNDERESTIMATED. Do NOT flag based on low score alone.';
            if (q === 'blocked') return 'WARNING: Website is blocked or unreachable. Score is 0 because scraping failed, NOT because there are no dev signals. Use classification_reason to judge.';
            return 'WARNING: Website scrape failed completely. Score is 0 because no data was obtained, NOT because there are no dev signals. Rely on classification_reason and category instead.';
          })(),
        };
      });

      const userPrompt = `Evaluate these ${companiesWithSignals.length} companies. For each, follow the reasoning framework and return results.

IMPORTANT: The dev_signal_score and dev_signals_found are from an INDEPENDENT scan of each company's website. If dev_signal_score > 0, those signals are REAL and the company has genuine developer-facing infrastructure. RESPECT these signals.

Companies:
${JSON.stringify(companiesWithSignals, null, 2)}

Return a JSON object with key "results" containing an array of objects, one per company:
{
  "results": [
    {
      "id": number,
      "reasoning": "step-by-step reasoning",
      "is_false_positive": boolean,
      "confidence": number (1-10),
      "flag_reason": "reason if flagging, empty string if not"
    }
  ]
}`;

      let lastErr: unknown;
      for (let i = 0; i < keys.length; i++) {
        const openai = new OpenAI({ apiKey: keys[i] as string, timeout: 60_000, maxRetries: 1 });
        try {
          const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.0,
            seed: 42,
            max_tokens: 8000,
            response_format: { type: 'json_object' }
          });

          const content = response.choices?.[0]?.message?.content || '{}';
          const parsed = JSON.parse(content);
          const rawResults = parsed.results || [];
          
          // Apply overrides
          for (const r of rawResults) {
            const company = needsLlmAudit.find((c: any) => c.id === r.id);
            const scan = devSignals[company?.domain];
            const scrapeQuality = scan?.scrape_quality || 'failed';
            
            // HARD OVERRIDE 1: If dev signals were found (score > 0), NEVER flag
            if (scan && scan.signal_score > 0 && r.is_false_positive) {
              r.is_false_positive = false;
              r.flag_reason = '';
              r.reasoning = (r.reasoning || '') + ` [OVERRIDE: Dev signals detected (score=${scan.signal_score}), cannot flag]`;
            }
            
            // CONFIDENCE THRESHOLD: Only flag if confidence >= 8
            if (r.is_false_positive && (r.confidence || 0) < 8) {
              r.is_false_positive = false;
              r.flag_reason = '';
              r.reasoning = (r.reasoning || '') + ` [OVERRIDE: Confidence ${r.confidence}/10 below threshold of 8, removing flag]`;
            }

            llmResults.push({
              ...r,
              dev_signals: scan?.signals_found?.join(', ') || '',
              dev_signal_score: scan?.signal_score || 0,
            });
          }

          break; // Success — no need to try backup keys
        } catch (err) {
          lastErr = err;
          if (isInsufficientQuota(err) && i < keys.length - 1) continue;
          throw err;
        }
      }

      if (llmResults.length === 0 && lastErr) throw lastErr;
    }

    // ── Step 4: Merge results and persist ──────────────────────────────────
    const allResults = [...autoPassResults, ...llmResults];
    
    if (allResults.length > 0) {
      const updatePromises = allResults.map((r: any) => 
        qp(
          `UPDATE companies 
           SET audit_is_false_positive = $1, 
               audit_flag_reason = $2,
               audit_confidence = $3,
               audit_reasoning = $4,
               audit_dev_signals = $5,
               audit_dev_signal_score = $6
           WHERE id = $7`, 
          [
            r.is_false_positive, 
            r.flag_reason || '', 
            r.confidence || 10,
            r.reasoning || '',
            r.dev_signals || '',
            r.dev_signal_score || 0,
            r.id
          ]
        )
      );
      await Promise.all(updatePromises);
    }
    
    return NextResponse.json({ results: allResults });
  } catch (error: any) {
    console.error('Error running audit:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
