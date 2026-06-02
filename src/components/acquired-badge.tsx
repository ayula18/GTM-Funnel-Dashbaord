'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { GitMerge, ExternalLink } from 'lucide-react';
import { parseSubsidiaryOf } from '@/lib/ma-utils';
import { cn } from '@/lib/utils';

/**
 * Tag shown on companies that are an acquisition / subsidiary of a parent
 * (from Apollo's "Subsidiary of" column). Renders nothing if not applicable.
 *
 * `variant="compact"` shows just an "M&A" pill (for dense tables);
 * `variant="full"` shows "Subsidiary of {Parent}" (for detail / review cards).
 */
export function AcquiredBadge({
  subsidiaryOf,
  variant = 'compact',
  className,
}: {
  subsidiaryOf: string | null | undefined;
  variant?: 'compact' | 'full';
  className?: string;
}) {
  const parent = parseSubsidiaryOf(subsidiaryOf);
  if (!parent) return null;

  const pill = (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 border-violet-500/30 bg-violet-500/10 text-violet-600 font-medium',
        variant === 'compact' ? 'text-[9px] px-1 py-0 h-4' : 'text-[11px]',
        className,
      )}
    >
      <GitMerge className={variant === 'compact' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      {variant === 'compact' ? 'M&A' : <span className="truncate max-w-[180px]">Subsidiary of {parent.name}</span>}
    </Badge>
  );

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        {pill}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-1">
          <div className="font-medium">Acquired / subsidiary</div>
          <div className="text-xs text-muted-foreground">
            Owned by <span className="text-foreground font-medium">{parent.name}</span>
            {parent.domain && (
              <>
                {' '}
                <a
                  href={`https://${parent.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary inline-flex items-center gap-0.5 hover:underline"
                >
                  {parent.domain} <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">Kept as a separate entity — not merged into the parent.</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
