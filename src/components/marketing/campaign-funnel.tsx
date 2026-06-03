'use client';

import { cn } from '@/lib/utils';

interface FunnelStep {
  label: string;
  value: number;
  color: string;
}

interface CampaignFunnelProps {
  steps: FunnelStep[];
  className?: string;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

export function CampaignFunnel({ steps, className }: CampaignFunnelProps) {
  if (steps.length === 0) return null;

  const maxValue = steps[0].value || 1;

  return (
    <div className={cn("bg-card border border-border rounded-xl p-6", className)}>
      <h3 className="text-sm font-semibold mb-5 text-muted-foreground uppercase tracking-wider">
        Campaign Funnel
      </h3>
      <div className="overflow-x-auto pb-4 -mb-4 custom-scrollbar">
        <div className="flex items-end gap-3 min-w-[1100px]">
        {steps.map((step, i) => {
          const widthPct = Math.max(5, (step.value / maxValue) * 100);
          const convRate = i > 0 && steps[i - 1].value > 0
            ? ((step.value / steps[i - 1].value) * 100).toFixed(1)
            : null;

          return (
            <div key={step.label} className="flex items-center gap-3 flex-1">
              {/* Conversion rate arrow */}
              {i > 0 && (
                <div className="flex flex-col items-center gap-0.5 shrink-0">
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {convRate}%
                  </span>
                  <div className="w-6 h-px bg-border" />
                  <svg width="8" height="6" className="text-muted-foreground">
                    <path d="M0 0 L4 6 L8 0" fill="currentColor" />
                  </svg>
                </div>
              )}

              {/* Step bar */}
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1.5 truncate">
                  {step.label}
                </div>
                <div className="relative h-12 rounded-lg overflow-hidden bg-muted/50">
                  <div
                    className="absolute inset-y-0 left-0 rounded-lg transition-all duration-700 ease-out flex items-center justify-center min-w-[48px]"
                    style={{
                      width: `${widthPct}%`,
                      background: `linear-gradient(135deg, ${step.color}dd, ${step.color}88)`,
                    }}
                  >
                    <span className="text-sm font-bold text-white drop-shadow-sm">
                      {formatNum(step.value)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
