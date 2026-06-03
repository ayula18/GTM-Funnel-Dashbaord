'use client';

import { cn } from '@/lib/utils';

interface EfficiencyBadgeProps {
  score: number; // 0-100
  className?: string;
}

export function EfficiencyBadge({ score, className }: EfficiencyBadgeProps) {
  const level = score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low';

  const config = {
    high: { label: 'High', bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/30' },
    mid:  { label: 'Mid',  bg: 'bg-amber-500/10',   text: 'text-amber-500',   border: 'border-amber-500/30' },
    low:  { label: 'Low',  bg: 'bg-red-500/10',      text: 'text-red-500',      border: 'border-red-500/30' },
  };

  const c = config[level];

  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border",
      c.bg, c.text, c.border,
      className
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full", {
        'bg-emerald-500': level === 'high',
        'bg-amber-500': level === 'mid',
        'bg-red-500': level === 'low',
      })} />
      {score.toFixed(0)}
    </span>
  );
}
