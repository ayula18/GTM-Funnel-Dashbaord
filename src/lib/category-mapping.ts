export type GtmSegment =
  | 'Cloud & DevOps'
  | 'Cybersecurity & Compliance'
  | 'Data & AI Infrastructure'
  | 'Software Engineering Tools'
  | 'APIs & Integration'
  | 'Cloud & Infrastructure Consulting'
  | 'Software & App Development Services'
  | 'Managed IT & Operations'
  | 'Data & AI Consulting'
  | 'Cybersecurity Consulting'
  | 'Other / Uncategorized';

export function mapCategoryToGtmSegment(category: string | null | undefined, classification: string | null | undefined): GtmSegment {
  const cat = (category || '').toLowerCase();
  const cls = (classification || '').trim();

  // 1. Handle IT Services (Based on classification)
  if (cls === 'IT Services & Solutions') {
    if (cat.includes('cyber') || cat.includes('security') || cat.includes('compliance')) {
      return 'Cybersecurity Consulting';
    }
    if (cat.includes('data') || cat.includes('ai ') || cat.includes('ml') || cat.includes('analytics') || cat.includes('artificial intelligence') || cat.includes('machine learning')) {
      return 'Data & AI Consulting';
    }
    if (cat.includes('cloud') || cat.includes('infrastructure') || cat.includes('devops') || cat.includes('network') || cat.includes('hosting')) {
      return 'Cloud & Infrastructure Consulting';
    }
    if (cat.includes('managed') || cat.includes('support') || cat.includes('operations') || cat.includes('outsourcing') || cat.includes('system integration') || cat.includes('itsm')) {
      return 'Managed IT & Operations';
    }
    if (cat.includes('software') || cat.includes('app') || cat.includes('web') || cat.includes('mobile') || cat.includes('development') || cat.includes('engineering') || cat.includes('transformation')) {
      return 'Software & App Development Services';
    }
    
    // Default for IT Services if nothing specifically matched
    return 'Managed IT & Operations';
  }

  // 2. Handle DevTools
  if (cls === 'DevTool' || cls === 'DevTools') {
    if (cat.includes('cyber') || cat.includes('security') || cat.includes('compliance') || cat.includes('iam') || cat.includes('identity') || cat.includes('sast') || cat.includes('dast') || cat.includes('cspm') || cat.includes('cwpp') || cat.includes('auth')) {
      return 'Cybersecurity & Compliance';
    }
    if (cat.includes('data') || cat.includes('ai ') || cat.includes('ml') || cat.includes('analytics') || cat.includes('database') || cat.includes('pipeline') || cat.includes('llm') || cat.includes('machine learning') || cat.includes('artificial intelligence')) {
      return 'Data & AI Infrastructure';
    }
    if (cat.includes('api') || cat.includes('integration') || cat.includes('middleware') || cat.includes('payment') || cat.includes('gateway') || cat.includes('messaging') || cat.includes('event')) {
      return 'APIs & Integration';
    }
    if (cat.includes('cloud') || cat.includes('devops') || cat.includes('infrastructure') || cat.includes('ci/cd') || cat.includes('container') || cat.includes('kubernetes') || cat.includes('observability') || cat.includes('apm') || cat.includes('deployment') || cat.includes('hosting') || cat.includes('network')) {
      return 'Cloud & DevOps';
    }
    if (cat.includes('software') || cat.includes('engineering') || cat.includes('ide') || cat.includes('testing') || cat.includes('qa ') || cat.includes('quality') || cat.includes('framework') || cat.includes('mobile') || cat.includes('web') || cat.includes('low-code') || cat.includes('no-code') || cat.includes('developer tool')) {
      return 'Software Engineering Tools';
    }

    // Fallbacks based on common dev tool keywords
    if (cat.includes('tooling') || cat.includes('platform') || cat.includes('engine')) {
      return 'Software Engineering Tools';
    }

    return 'Other / Uncategorized';
  }

  return 'Other / Uncategorized';
}
