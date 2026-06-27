export type GtmSegment =
  // DevTools
  | 'Data & Analytics'
  | 'AI & Machine Learning'
  | 'Cybersecurity & IAM'
  | 'Cloud & Infrastructure'
  | 'DevOps & CI/CD'
  | 'Observability & Monitoring'
  | 'Developer Productivity & QA'
  | 'APIs & Integration'
  // IT Services
  | 'Cloud Migration & Management'
  | 'Cybersecurity Consulting'
  | 'Data & AI Consulting'
  | 'Custom Software Development'
  | 'Managed IT Services & Support'
  // Fallbacks
  | 'Other / Uncategorized';

export function mapCategoryToGtmSegment(category: string | null | undefined, classification: string | null | undefined): GtmSegment {
  const cat = (category || '').toLowerCase();
  const cls = (classification || '').trim();

  // 1. Handle IT Services (Based on classification)
  if (cls === 'IT Services & Solutions') {
    if (cat.includes('cyber') || cat.includes('security') || cat.includes('compliance') || cat.includes('penetration')) {
      return 'Cybersecurity Consulting';
    }
    if (cat.includes('data') || cat.includes('ai ') || cat.includes('ml') || cat.includes('analytics') || cat.includes('artificial intelligence') || cat.includes('machine learning')) {
      return 'Data & AI Consulting';
    }
    if (cat.includes('cloud') || cat.includes('infrastructure') || cat.includes('migration') || cat.includes('aws') || cat.includes('azure') || cat.includes('gcp')) {
      return 'Cloud Migration & Management';
    }
    if (cat.includes('managed') || cat.includes('support') || cat.includes('operations') || cat.includes('outsourcing') || cat.includes('system integration') || cat.includes('itsm')) {
      return 'Managed IT Services & Support';
    }
    if (cat.includes('software') || cat.includes('app') || cat.includes('web') || cat.includes('mobile') || cat.includes('development') || cat.includes('engineering') || cat.includes('transformation')) {
      return 'Custom Software Development';
    }
    
    // Default for IT Services if nothing specifically matched
    return 'Managed IT Services & Support';
  }

  // 2. Handle DevTools
  if (cls === 'DevTool' || cls === 'DevTools') {
    if (cat.includes('cyber') || cat.includes('security') || cat.includes('compliance') || cat.includes('iam') || cat.includes('identity') || cat.includes('sast') || cat.includes('dast') || cat.includes('cspm') || cat.includes('cwpp') || cat.includes('auth')) {
      return 'Cybersecurity & IAM';
    }
    if (cat.includes('ai ') || cat.includes('ml') || cat.includes('llm') || cat.includes('machine learning') || cat.includes('artificial intelligence') || cat.includes('model') || cat.includes('nlp')) {
      return 'AI & Machine Learning';
    }
    if (cat.includes('data') || cat.includes('analytics') || cat.includes('database') || cat.includes('pipeline') || cat.includes('etl') || cat.includes('warehouse')) {
      return 'Data & Analytics';
    }
    if (cat.includes('api') || cat.includes('integration') || cat.includes('middleware') || cat.includes('gateway') || cat.includes('event') || cat.includes('streaming') || cat.includes('kafka')) {
      return 'APIs & Integration';
    }
    if (cat.includes('devops') || cat.includes('ci/cd') || cat.includes('pipeline') || cat.includes('container') || cat.includes('kubernetes') || cat.includes('deployment') || cat.includes('orchestration') || cat.includes('terraform')) {
      return 'DevOps & CI/CD';
    }
    if (cat.includes('observability') || cat.includes('apm') || cat.includes('logging') || cat.includes('tracing') || cat.includes('monitoring') || cat.includes('telemetry') || cat.includes('metrics')) {
      return 'Observability & Monitoring';
    }
    if (cat.includes('cloud') || cat.includes('infrastructure') || cat.includes('hosting') || cat.includes('network') || cat.includes('compute') || cat.includes('storage') || cat.includes('iaas')) {
      return 'Cloud & Infrastructure';
    }
    if (cat.includes('software') || cat.includes('engineering') || cat.includes('ide') || cat.includes('testing') || cat.includes('qa ') || cat.includes('quality') || cat.includes('framework') || cat.includes('low-code') || cat.includes('no-code') || cat.includes('developer productivity') || cat.includes('tooling')) {
      return 'Developer Productivity & QA';
    }

    // Fallbacks based on common dev tool keywords
    if (cat.includes('platform') || cat.includes('engine') || cat.includes('solution')) {
      return 'Developer Productivity & QA'; // Most generic dev tools
    }

    return 'Other / Uncategorized';
  }

  return 'Other / Uncategorized';
}
