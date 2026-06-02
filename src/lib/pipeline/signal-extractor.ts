import * as cheerio from 'cheerio';
import { ExtractedSignals } from '../types';

// CDN/Hosting skip list
const SKIP_DOMAINS = new Set([
  'netlify.app', 'vercel.app', 'herokuapp.com', 'github.io', 'gitlab.io',
  'pages.dev', 'fly.dev', 'railway.app', 'render.com', 'onrender.com',
  'surge.sh', 'now.sh', 'firebaseapp.com', 'web.app', 'appspot.com',
  'azurewebsites.net', 'cloudfront.net', 'amazonaws.com'
]);

export function extractSignals(domain: string, html: string): ExtractedSignals {
  // If it's just plain text (from Jina)
  if (!html.includes('<html') && !html.includes('<body')) {
    return parseJinaText(domain, html);
  }

  const $ = cheerio.load(html);

  // 1. Basic Metadata
  const title = $('title').text().trim();
  const description = $('meta[name="description"]').attr('content')?.trim() || 
                      $('meta[property="og:description"]').attr('content')?.trim() || '';
  const h1 = $('h1').first().text().trim();

  // 2. Main Page Text (h2, h3, p, li)
  let page_text = '';
  $('h2, h3, p, li').each((_, el) => {
    page_text += $(el).text().trim() + ' ';
  });
  page_text = page_text.replace(/\s+/g, ' ').trim().slice(0, 3000); // Limit to 3000 chars

  // 3. Navigation Text
  let nav_text = '';
  $('nav, header').find('a, button, span, div').each((_, el) => {
    nav_text += $(el).text().trim() + ' ';
  });
  nav_text = nav_text.replace(/\s+/g, ' ').trim().slice(0, 1000);

  // 4. Footer Text
  let footer_text = '';
  $('footer').find('a, span, p, div').each((_, el) => {
    footer_text += $(el).text().trim() + ' ';
  });
  footer_text = footer_text.replace(/\s+/g, ' ').trim().slice(0, 1500);

  // 5. LinkedIn URL
  let linkedin_url = '';
  $('a[href*="linkedin.com/company"]').each((_, el) => {
    linkedin_url = $(el).attr('href') || '';
  });

  // Compile full text for signal matching
  const full_text = (title + ' ' + description + ' ' + h1 + ' ' + nav_text + ' ' + page_text + ' ' + footer_text).toLowerCase();

  return {
    domain,
    linkedin_url,
    title: title.slice(0, 200),
    description: description.slice(0, 500),
    h1: h1.slice(0, 200),
    page_text,
    nav_text,
    footer_text,
    footer_signals: extractFooterSignals(full_text),
    dev_keywords: extractDevKeywords(full_text),
    distribution_signals: extractDistributionSignals(full_text),
    oss_signals: extractOssSignals(full_text),
    cta_signals: extractCtaSignals(full_text),
    consulting_signals: extractConsultingSignals(full_text),
    observations: extractObservations(domain, full_text),
    scrape_status: 'success'
  };
}

function parseJinaText(domain: string, text: string): ExtractedSignals {
  const full_text = text.toLowerCase();
  
  // Extract LinkedIn URL if present
  const liMatch = text.match(/https?:\/\/(www\.)?linkedin\.com\/company\/[a-zA-Z0-9_-]+/i);
  const linkedin_url = liMatch ? liMatch[0] : '';
  
  return {
    domain,
    linkedin_url,
    title: text.slice(0, 100).trim(), // Mock title
    description: '',
    h1: '',
    page_text: text.slice(0, 4000).replace(/\s+/g, ' '),
    nav_text: '',
    footer_text: '',
    footer_signals: extractFooterSignals(full_text),
    dev_keywords: extractDevKeywords(full_text),
    distribution_signals: extractDistributionSignals(full_text),
    oss_signals: extractOssSignals(full_text),
    cta_signals: extractCtaSignals(full_text),
    consulting_signals: extractConsultingSignals(full_text),
    observations: extractObservations(domain, full_text),
    scrape_status: 'success'
  };
}

function extractFooterSignals(text: string): string {
  const signals: string[] = [];
  if (text.includes('github') || text.includes('source code')) signals.push('GitHub/Source');
  if (text.match(/documentation|docs/)) signals.push('Docs');
  if (text.match(/api|api reference|api docs/)) signals.push('API Docs');
  if (text.match(/community|forum|discord|slack/)) signals.push('Community');
  if (text.includes('pricing')) signals.push('Pricing');
  if (text.includes('developer hub') || text.includes('developers')) signals.push('Developer Hub');
  if (text.includes('changelog') || text.includes('release notes')) signals.push('Changelog');
  return signals.join(', ');
}

function extractDevKeywords(text: string): string {
  const keywords = [
    'api', 'sdk', 'cli', 'developer', 'developers', 'open source', 'kubernetes', 'docker',
    'infrastructure', 'deployment', 'ci/cd', 'backend', 'frontend', 'database', 'cloud native',
    'observability', 'monitoring', 'workflow', 'automation', 'devops', 'sre', 'microservices',
    'serverless', 'graphql', 'rest api', 'webhook'
  ];
  const found = keywords.filter(k => text.includes(k));
  return found.join(', ');
}

function extractDistributionSignals(text: string): string {
  const signals = ['npm', 'pypi', 'docker', 'helm', 'go get', 'cargo', 'gem', 'nuget', 'maven', 'apt-get', 'brew'];
  const found = signals.filter(s => text.match(new RegExp(`\\b${s}\\b`)));
  return found.join(', ');
}

function extractOssSignals(text: string): string {
  const signals: string[] = [];
  if (text.includes('open source') || text.includes('open-source')) signals.push('Open Source Mention');
  if (text.match(/apache 2\.0|mit license|gpl/)) signals.push('OSS License');
  if (text.includes('community edition')) signals.push('Community Edition');
  if (text.includes('enterprise edition') || text.includes('enterprise tier')) signals.push('Enterprise Tier');
  return signals.join(', ');
}

function extractCtaSignals(text: string): string {
  const signals: string[] = [];
  if (text.match(/sign up|get started for free|start free trial|create account/)) signals.push('Self-Serve Signup');
  if (text.match(/book a demo|request demo|schedule demo/)) signals.push('Book a Demo');
  if (text.match(/contact sales|talk to sales|contact us/)) signals.push('Contact Sales');
  return signals.join(', ');
}

function extractConsultingSignals(text: string): string {
  const signals: string[] = [];
  if (text.match(/consulting|consultancy/)) signals.push('Consulting');
  if (text.match(/staff augmentation|staffing|hire developers/)) signals.push('Staffing');
  if (text.match(/digital transformation/)) signals.push('Digital Transformation');
  if (text.match(/custom software development|app development agency/)) signals.push('Agency');
  if (text.match(/managed services/)) signals.push('Managed Services');
  if (text.match(/outsourcing/)) signals.push('Outsourcing');
  return signals.join(', ');
}

function extractObservations(domain: string, text: string): string {
  const obs: string[] = [];
  
  // CDN skip check
  const isCdn = Array.from(SKIP_DOMAINS).some(skip => domain.endsWith(skip));
  if (isCdn) obs.push('CDN/Hosting Subdomain');
  
  if (text.match(/under construction|coming soon|parked domain/)) obs.push('Under Construction/Parked');
  if (text.match(/non-profit|501\(c\)\(3\)|charity/)) obs.push('Non-profit');
  
  return obs.join(', ');
}
