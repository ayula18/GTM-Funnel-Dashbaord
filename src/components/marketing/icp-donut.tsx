'use client';

import { cn } from '@/lib/utils';

interface IcpDonutProps {
  icpCount: number;
  nonIcpCount: number;
  size?: number;
  className?: string;
}

export function IcpDonut({ icpCount, nonIcpCount, size = 120, className }: IcpDonutProps) {
  const total = icpCount + nonIcpCount;
  const icpPct = total > 0 ? (icpCount / total) * 100 : 0;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const icpArc = (icpPct / 100) * circumference;

  return (
    <div className={cn("flex items-center gap-5", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          {/* Background ring */}
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="12"
          />
          {/* ICP arc */}
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="12"
            strokeDasharray={`${icpArc} ${circumference - icpArc}`}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold">{icpPct.toFixed(0)}%</span>
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">ICP</span>
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-primary" />
          <div>
            <div className="text-sm font-semibold">{icpCount.toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground">ICP Match</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-muted" />
          <div>
            <div className="text-sm font-semibold">{nonIcpCount.toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground">Non-ICP</div>
          </div>
        </div>
      </div>
    </div>
  );
}
