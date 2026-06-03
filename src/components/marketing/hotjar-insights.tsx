'use client';

import { cn } from '@/lib/utils';
import { Flame, AlertTriangle, RotateCcw } from 'lucide-react';

interface HotjarInsightsProps {
  foldDropoff: number; // Percentage
  rageClicks: number;
  uTurns: number;
  landingPage: string;
  className?: string;
}

export function HotjarInsights({ foldDropoff, rageClicks, uTurns, landingPage, className }: HotjarInsightsProps) {
  return (
    <div className={cn("bg-card border border-border rounded-xl p-5", className)}>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-500/90" />
            Hotjar Insights
          </h3>
          <p className="text-[10px] text-muted-foreground mt-1 truncate max-w-[200px]">
            {landingPage}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Drop-off */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Drop-off at Fold
          </div>
          <div className="flex items-end gap-2">
            <div className="text-2xl font-bold">{foldDropoff}%</div>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-2">
            <div
              className={cn("h-full rounded-full transition-all", foldDropoff > 50 ? "bg-rose-500/90" : foldDropoff > 30 ? "bg-amber-500/90" : "bg-emerald-500/90")}
              style={{ width: `${foldDropoff}%` }}
            />
          </div>
        </div>

        {/* Rage Clicks */}
        <div className="space-y-1 border-l border-border/50 pl-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="w-3 h-3" /> Rage Clicks
          </div>
          <div className="text-2xl font-bold">{rageClicks}</div>
        </div>

        {/* U-Turns */}
        <div className="space-y-1 border-l border-border/50 pl-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <RotateCcw className="w-3 h-3" /> U-Turns
          </div>
          <div className="text-2xl font-bold">{uTurns}</div>
        </div>
      </div>
    </div>
  );
}
