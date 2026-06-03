'use client';

import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MarketingKpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: { value: number; label: string };
  icon?: React.ReactNode;
  sparkData?: number[];
  className?: string;
}

export function MarketingKpiCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  sparkData,
  className,
}: MarketingKpiCardProps) {
  const trendColor = !trend
    ? ''
    : trend.value > 0
      ? 'text-emerald-500'
      : trend.value < 0
        ? 'text-red-500'
        : 'text-muted-foreground';

  const TrendIcon = !trend
    ? null
    : trend.value > 0
      ? TrendingUp
      : trend.value < 0
        ? TrendingDown
        : Minus;

  return (
    <div className={cn("bg-card border border-border rounded-xl p-5 flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </div>

      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-3xl font-bold tracking-tight">{value}</div>
          {subtitle && (
            <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
          )}
          {trend && TrendIcon && (
            <div className={cn("flex items-center gap-1 mt-1.5 text-xs font-medium", trendColor)}>
              <TrendIcon className="w-3 h-3" />
              <span>{Math.abs(trend.value)}%</span>
              <span className="text-muted-foreground font-normal">{trend.label}</span>
            </div>
          )}
        </div>

        {/* Mini sparkline */}
        {sparkData && sparkData.length > 1 && (
          <Sparkline data={sparkData} className="w-20 h-10" />
        )}
      </div>
    </div>
  );
}

function Sparkline({ data, className }: { data: number[]; className?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 80;
  const height = 40;
  const padding = 2;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const lastVal = data[data.length - 1];
  const prevVal = data[data.length - 2];
  const color = lastVal >= prevVal ? '#10b981' : '#ef4444';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} fill="none">
      <polyline
        points={points.join(' ')}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Glow dot on last point */}
      <circle
        cx={parseFloat(points[points.length - 1].split(',')[0])}
        cy={parseFloat(points[points.length - 1].split(',')[1])}
        r="3"
        fill={color}
      />
    </svg>
  );
}
