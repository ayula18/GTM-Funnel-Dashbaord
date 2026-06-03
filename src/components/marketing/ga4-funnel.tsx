'use client';

import { cn } from '@/lib/utils';
import { MousePointerClick, ArrowRight } from 'lucide-react';

interface Ga4Step {
  label: string;
  count: number;
}

interface Ga4FunnelProps {
  steps: Ga4Step[];
  className?: string;
}

export function Ga4Funnel({ steps, className }: Ga4FunnelProps) {
  if (steps.length === 0) return null;
  const max = steps[0].count || 1;

  return (
    <div className={cn("bg-card border border-border rounded-xl p-5", className)}>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-5 flex items-center gap-2">
        <MousePointerClick className="w-4 h-4 text-primary" />
        On-Site Funnel (GA4)
      </h3>

      <div className="space-y-4">
        {steps.map((step, i) => {
          const pct = Math.max(2, (step.count / max) * 100);
          const drop = i > 0 && steps[i - 1].count > 0 
            ? (100 - (step.count / steps[i - 1].count) * 100).toFixed(1)
            : null;

          return (
            <div key={step.label} className="relative">
              {/* Drop-off connector */}
              {i > 0 && (
                <div className="absolute -top-3 left-[15px] flex items-center gap-2 text-[10px] text-muted-foreground bg-card z-10 px-1">
                  <ArrowRight className="w-3 h-3 rotate-90 text-amber-500/50" />
                  <span className="text-amber-500 font-medium">{drop}% drop-off</span>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="w-24 text-xs font-medium text-foreground shrink-0 text-right pr-2">
                  {step.label}
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <div className="h-6 bg-muted rounded overflow-hidden flex-1 relative">
                    <div 
                      className="absolute inset-y-0 left-0 bg-primary/80 rounded transition-all duration-700 ease-out"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="w-10 text-xs font-bold text-right shrink-0">
                    {step.count.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
