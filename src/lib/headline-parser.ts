/**
 * Headline Parser — Extracts current company and designation from LinkedIn headlines.
 * Ported from the LinkedIn Enrichment Dashboard project.
 *
 * Handles: "VP of Sales at Acme Corp", "CEO | CloudTech", "Co-Founder @Razorpay",
 *          "Ex-Google | Now at StartupX", "Former CTO at BigCo | Advisor at SmallCo"
 */

const EX_MARKERS = [
  'ex-', 'ex –', 'ex—', 'ex ',
  'former', 'formerly', 'previously', 'prev ',
  'past ', 'retired', 'alumni', 'alum ',
  'was at', 'worked at', 'left '
];

const CURRENT_MARKERS = [
  'now at', 'currently at', 'currently @', 'joining',
  'joined', 'now @', 'working at', 'working @'
];

const DESIGNATION_KEYWORDS = [
  'ceo', 'cto', 'cfo', 'coo', 'cmo', 'cpo', 'cro', 'ciso',
  'founder', 'co-founder', 'cofounder',
  'president', 'vice president', 'vp',
  'director', 'managing director', 'md',
  'head', 'lead', 'principal', 'senior', 'junior', 'staff',
  'manager', 'engineer', 'developer', 'architect', 'designer',
  'analyst', 'consultant', 'advisor', 'associate', 'partner',
  'specialist', 'coordinator', 'strategist', 'evangelist',
  'executive', 'officer', 'intern', 'trainee',
  'recruiter', 'hr', 'sales', 'marketing', 'product',
  'growth', 'operations', 'business development', 'bd',
  'svp', 'evp', 'avp', 'gm', 'agm', 'dgm',
];

export function parseHeadline(headline: string): { company: string; designation: string } {
  if (!headline || typeof headline !== 'string') {
    return { company: '', designation: '' };
  }

  const original = headline.trim();
  if (!original) return { company: '', designation: '' };

  const atResult = extractFromAtPattern(original);
  if (atResult.company) return atResult;

  const segmentResult = extractFromSegments(original);
  if (segmentResult.company || segmentResult.designation) return segmentResult;

  return extractFromSingleSegment(original);
}

function extractFromAtPattern(headline: string) {
  const segments = splitIntoSegments(headline);

  for (const segment of segments) {
    const seg = segment.trim();
    if (isExCompany(seg)) continue;

    for (const marker of CURRENT_MARKERS) {
      const idx = seg.toLowerCase().indexOf(marker);
      if (idx !== -1) {
        const company = seg.slice(idx + marker.length).trim();
        const designation = seg.slice(0, idx).trim() || findDesignationInSegments(segments, seg);
        return { company: cleanCompanyName(company), designation: cleanDesignation(designation) };
      }
    }

    const atMatch = seg.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
    if (atMatch) {
      const possibleTitle = atMatch[1].trim();
      const possibleCompany = atMatch[2].trim();
      if (!isExCompany(possibleCompany) && !isExCompany(seg)) {
        return { company: cleanCompanyName(possibleCompany), designation: cleanDesignation(possibleTitle) };
      }
    }
  }

  return { company: '', designation: '' };
}

function extractFromSegments(headline: string) {
  const segments = splitIntoSegments(headline);
  if (segments.length < 2) return { company: '', designation: '' };

  let bestCompany = '';
  let bestDesignation = '';

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i].trim();
    if (!seg) continue;
    if (isExCompany(seg)) continue;

    const atMatch = seg.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
    if (atMatch && !isExCompany(seg)) {
      return { company: cleanCompanyName(atMatch[2].trim()), designation: cleanDesignation(atMatch[1].trim()) };
    }

    const looksLikeTitle = isDesignation(seg);

    if (looksLikeTitle && i + 1 < segments.length) {
      const nextSeg = segments[i + 1].trim();
      if (!isExCompany(nextSeg) && !isDesignation(nextSeg)) {
        bestDesignation = seg;
        bestCompany = nextSeg;
      }
    }

    if (i > 0 && !looksLikeTitle) {
      const prevSeg = segments[i - 1].trim();
      if (isDesignation(prevSeg) && !isExCompany(seg)) {
        if (!bestCompany) {
          bestDesignation = prevSeg;
          bestCompany = seg;
        }
      }
    }
  }

  return { company: cleanCompanyName(bestCompany), designation: cleanDesignation(bestDesignation) };
}

function extractFromSingleSegment(headline: string) {
  if (isDesignation(headline)) {
    return { company: '', designation: cleanDesignation(headline) };
  }
  return { company: '', designation: '' };
}

function splitIntoSegments(headline: string) {
  return headline
    .split(/\s*[|·•—–]\s*|\s*\/\s*(?=[A-Z])|\s+-\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function isExCompany(text: string) {
  const lower = text.toLowerCase().trim();
  return EX_MARKERS.some(marker => lower.startsWith(marker) || lower.includes(` ${marker}`));
}

function isDesignation(text: string) {
  const lower = text.toLowerCase();
  return DESIGNATION_KEYWORDS.some(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    return regex.test(lower);
  });
}

function findDesignationInSegments(segments: string[], skipSegment: string) {
  for (const seg of segments) {
    if (seg === skipSegment) continue;
    if (isExCompany(seg)) continue;
    if (isDesignation(seg)) return seg.trim();
  }
  return '';
}

function cleanCompanyName(name: string) {
  if (!name) return '';
  return name.replace(/^[,.\s|·•—–]+/, '').replace(/[,.\s|·•—–]+$/, '').replace(/\s+/g, ' ').trim();
}

function cleanDesignation(title: string) {
  if (!title) return '';
  return title.replace(/^[,.\s|·•—–]+/, '').replace(/[,.\s|·•—–]+$/, '').replace(/\s+/g, ' ').trim();
}
