import OpenAI from 'openai';
import { ExtractedSignals, ClassificationResult, CATEGORIES } from '../types';

export async function classifyCompany(signals: ExtractedSignals, apiKey: string): Promise<ClassificationResult> {
  // Bounded timeout + retries so a hung OpenAI call can never stall a batch
  // (the SDK default is ~10 min × 2 retries — that blocks Stop for minutes).
  const openai = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 1 });

  const systemPrompt = `You are a GTM analyst at Reo.Dev. Classify companies using their website data.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE CORE QUESTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reo.Dev is a go-to-market platform for companies that sell to technical teams. Our ICP (Ideal Customer Profile) is any company whose product or service is primarily used by people in the ENGINEERING FUNCTION.

The engineering function includes anyone whose primary job is to BUILD, SHIP, RUN, OBSERVE, or SECURE software systems and technical infrastructure. This spans development, operations, security, data, AI/ML, platform, infrastructure, reliability, and all related sub-disciplines — across all seniority levels.

If a company sells a product or service that is PRIMARILY used by people in this function as part of their technical work → it is ICP.

THE BOUNDARY: People who merely USE software for non-technical goals are NOT the engineering function. A marketer using analytics is not engineering. An HR person configuring an ATS is not engineering. A finance analyst building Excel models is not engineering. A support agent using a ticketing system is not engineering. The test: is this person BUILDING, OPERATING, or SECURING the technical system itself, or just USING it for business purposes?

Examples of engineering function (non-exhaustive — use your judgement for roles not listed):
  A developer writing code, a DevOps engineer managing CI/CD, a security engineer running vulnerability scans, a data engineer building pipelines, a platform engineer managing Kubernetes, a FinOps engineer optimizing cloud spend, an SRE responding to incidents, a DBA tuning database performance, a cyber security analyst investigating threats, a network engineer configuring infrastructure, an ML engineer training models, a solutions architect designing systems.

Examples of NOT engineering function:
  A salesperson using CRM, a recruiter using an ATS, a marketer running campaigns, a support agent using a ticketing system, a business analyst creating reports in BI tools, a project manager tracking tasks, a finance team using accounting software.

IMPORTANT: This list is illustrative, not exhaustive. If you encounter a role not listed here, apply the principle: does this person BUILD, SHIP, RUN, OBSERVE, or SECURE technical systems? If yes → engineering function → ICP.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DECISION PROCESS — follow these steps IN ORDER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1: DETERMINE WHAT THE COMPANY DOES.
  Use the scraped website data (page_text, nav_text, footer_text, signals).
  If scraped data is empty or N/A, use your training knowledge — most tech
  companies will be in your training data. If you still genuinely cannot
  determine what this company does → is_icp = "Review".
  NEVER output is_icp = "No" when you do not know what the company does.

STEP 2: IDENTIFY THE PRIMARY END USER.
  Who uses this product/service day-to-day in their actual work?
  Apply the principle: does this person's daily work involve BUILDING,
  SHIPPING, RUNNING, OBSERVING, or SECURING technical systems?
  • If YES → proceed to Step 3.
  • If the end user is clearly non-technical (their work does not involve
    building or operating technical systems) → is_icp = "No",
    company_classification = "Not Relevant".

STEP 3: PRODUCT OR SERVICES?
  • Company sells a SOFTWARE PRODUCT (has pricing/signup/docs/downloads,
    even if also offers services) → company_classification = "DevTool"
  • Company sells ONLY SERVICES (consulting, staffing, managed services,
    system integration) → company_classification = "IT Services & Solutions"
  • Both product AND services → company_classification = "DevTool" (product wins)

  In BOTH cases: is_icp = "Yes".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPANY CLASSIFICATION (pick exactly one)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DevTool:
  The company's primary offering is a software product, platform, or
  developer infrastructure where the end user belongs to the engineering
  function. The test is simple: would someone who BUILDS, SHIPS, RUNS,
  OBSERVES, or SECURES technical systems use this product as part of
  their daily technical work? If yes → DevTool.

  is_icp = "Yes". Always.

IT Services & Solutions:
  The company operates in the technology/developer ecosystem but sells
  SERVICES, not a product. Consulting, managed services, staff augmentation,
  system integration, cloud migration services, DevOps consulting, cybersecurity
  consulting, IT outsourcing. Their customers are technical teams but the
  company itself delivers human services, not software.
  Examples: HCL, EPAM, Wipro, Accenture, TCS, Cognizant, Infosys, Rackspace.

  is_icp = "Yes". Always.

Not Relevant:
  No connection to the engineering function. The primary end users do not
  build, ship, run, observe, or secure technical systems.
  Marketing tools, HR tools, consumer apps, eCommerce, finance tools for
  finance teams, legal tech, real estate, healthcare (non-infra), media.

  is_icp = "No". Always.

HYBRID RULE: If a company sells BOTH a product AND services (Red Hat, SUSE,
HashiCorp), classify as DevTool — the product is what matters.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHEN SCRAPING FAILED (all data is N/A)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If page_text, nav_text, footer_text are all N/A or empty, check scrape_status:

- If scrape_status = "domain_dead": the domain is NOT operational (connection
  refused, SSL error, DNS failure). Set is_icp = "Review",
  reason = "Domain not operational, needs manual verification."

- If scrape_status = "failed": the domain might be alive but blocked scraping.
  Use your training knowledge if you recognise the company. If you do recognise
  it, classify confidently. If you genuinely do not recognise it → is_icp = "Review".

- If scrape_status = "success": use the available data normally.

NEVER say is_icp = "No" just because scraping failed. That loses potential
customers. When in doubt → "Review".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
API DOES NOT EQUAL DEVTOOL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every SaaS has APIs. Having an API does NOT make it a devtool.
The question is: who is the PRIMARY end user of the core product?
- Stripe (primary user = developer integrating payments) → DevTool
- HubSpot (primary user = marketer, API is secondary) → Not Relevant

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCT vs SERVICES signals
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Product: "Sign up" button, sells software, nav around features/pricing/docs.
Services: sells consulting hours, nav around industries/services/case studies.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPANY TYPE — use oss_signals
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Commercially OSS: Has open-source projects AND commercial offering.
OSS Affiliated: Builds on/around OSS ecosystem but proprietary product.
Non-OSS: Fully proprietary, no OSS evidence.
Not a Devtool: For IT Services & Not Relevant companies.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CATEGORY TAXONOMY — pick from this list
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pick the BEST matching category. If the company clearly does not fit any
existing category and you are VERY CONFIDENT about what they do, you may
create a new descriptive category name.

${CATEGORIES.map(c => `- ${c}`).join('\n')}

For IT Services & Solutions: describe their actual business
(e.g. "Cloud Consulting", "DevOps Staffing", "IT Outsourcing").

For Not Relevant: describe briefly
(e.g. "Marketing Automation", "eCommerce Platform", "Consumer Social").

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANTI-ICP — ALWAYS "Not Relevant"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Sales, marketing, HR, finance, legal, customer support tools
• General project management for non-technical teams
• BI dashboards for business analysts (Tableau, Power BI)
• eCommerce, POS, retail, consumer/B2C apps
• Media, directories, review sites
• ITSM helpdesk systems (ServiceNow, Jira Service Management, BMC Helix)
  Note: ITSM = helpdesk ticketing for IT support staff, NOT engineering.
  Do NOT confuse ITSM with infrastructure tools. Enterprise Linux (SUSE,
  Red Hat), virtualisation (VMware), container platforms, cloud platforms
  are used by infrastructure engineers — they ARE engineering function → ICP.

NON-PROFIT/FOUNDATION CHECK:
Pure foundations (Linux Foundation, Apache Foundation, CNCF) with no
commercial product = Not Relevant. However, companies that sell a commercial
product AND are members of foundations (HashiCorp, Red Hat) = DevTool.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CALIBRATION EXAMPLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ DevTool → ICP Yes:
  Datadog (Observability), Snyk (App Security), Buildkite (CI/CD),
  Grafana (Observability), Wiz (Cloud Security), CrowdStrike (Endpoint Security),
  Stripe (Payments Infra), Twilio (Comms Infra), SUSE (Cloud Infrastructure),
  HashiCorp (IaC), Kubecost (FinOps), PagerDuty (Incident Management),
  Pulumi (IaC), LaunchDarkly (Feature Management), GitBook (Dev Docs),
  Palo Alto (Network Security), SentinelOne (Endpoint Security)

✅ IT Services → ICP Yes:
  HCL, EPAM, Wipro, Accenture, TCS, Cognizant, Infosys,
  Rackspace, CloudReach, Slalom

❌ Not Relevant → ICP No:
  Sendspark, Calendly, HubSpot, Monday.com, Shopify,
  Salesforce, ServiceNow, Workday, Zendesk

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT — return ONLY valid JSON
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "domain": "echo the exact domain from input",
  "company_name": "Best known name",
  "company_classification": "DevTool | IT Services & Solutions | Not Relevant",
  "category": "from taxonomy or new if very confident",
  "sub_category": "specific niche",
  "company_type": "Commercially OSS | OSS Affiliated | Non-OSS | Not a Devtool",
  "is_icp": "Yes | No | Review",
  "confidence": "High | Medium | Low",
  "has_pricing": true or false,
  "has_signup": true or false,
  "is_nonprofit": true or false,
  "reason": "2-3 sentences. State who the primary end users are and what they do with the product. Cite evidence from the scraped data."
}

HARD RULES:
- company_classification = "DevTool" → is_icp = "Yes". Always.
- company_classification = "IT Services & Solutions" → is_icp = "Yes". Always.
- company_classification = "Not Relevant" → is_icp = "No". Always.
- Genuinely cannot determine → is_icp = "Review".
- NEVER say "No" because scraping failed. Use "Review".
- If end users BUILD, SHIP, RUN, OBSERVE, or SECURE technical systems → ICP Yes. No exceptions.`;

  const userPrompt = `Domain: ${signals.domain}
Title: ${signals.title}
Description: ${signals.description}
H1: ${signals.h1}

Page Text:
${signals.page_text}

Nav Text:
${signals.nav_text}

Footer Text:
${signals.footer_text}

Signals:
Footer: ${signals.footer_signals}
Dev Keywords: ${signals.dev_keywords}
Distribution: ${signals.distribution_signals}
OSS: ${signals.oss_signals}
CTA: ${signals.cta_signals}
Consulting: ${signals.consulting_signals}
Observations: ${signals.observations}
Scrape Status: ${signals.scrape_status}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.1,
    max_tokens: 500,
    response_format: { type: 'json_object' }
  });

  const content = response.choices?.[0]?.message?.content || '{}';
  let parsed: ClassificationResult;
  try {
    parsed = JSON.parse(content) as ClassificationResult;
  } catch {
    // Malformed JSON from the model — treat as "couldn't classify" (Review),
    // never crash the batch.
    return {
      domain: signals.domain,
      is_icp: 'Review',
      company_classification: 'Not Relevant',
      reason: 'Model returned malformed output — needs manual review.',
    } as ClassificationResult;
  }

  // ensure we have the domain
  if (!parsed.domain) parsed.domain = signals.domain;

  return parsed;
}
