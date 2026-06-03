'use client';

import { cn } from '@/lib/utils';
import { Calendar, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

type Period = 'day' | 'week' | 'month';

interface DateFilterProps {
  period: Period;
  onPeriodChange: (period: Period) => void;
  selectedDate: string; // ISO date string
  onDateChange: (date: string) => void;
  className?: string;
}

const periodLabels: Record<Period, string> = {
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
};

export function DateFilter({ period, onPeriodChange, selectedDate, onDateChange, className }: DateFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const displayLabel = (() => {
    const d = new Date(selectedDate);
    if (period === 'month') {
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    if (period === 'week') {
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  })();

  return (
    <div className={cn("flex items-center gap-2", className)} ref={ref}>
      {/* Period toggle */}
      <div className="flex bg-muted rounded-lg p-0.5">
        {(['day', 'week', 'month'] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => onPeriodChange(p)}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-md transition-all",
              period === p
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {periodLabels[p]}
          </button>
        ))}
      </div>

      {/* Date selector */}
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          <span>{displayLabel}</span>
          <ChevronDown className={cn("w-3 h-3 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <div className="absolute top-full mt-1 right-0 bg-card border border-border rounded-lg shadow-lg p-2 z-50 min-w-[180px]">
            <input
              type={period === 'month' ? 'month' : period === 'week' ? 'week' : 'date'}
              value={period === 'month' ? selectedDate.slice(0, 7) : selectedDate}
              onChange={(e) => {
                onDateChange(period === 'month' ? `${e.target.value}-01` : e.target.value);
                setOpen(false);
              }}
              className="w-full bg-muted/50 border border-border rounded px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        )}
      </div>
    </div>
  );
}
