'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, X, Search, Filter } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';

// ── Checkbox Dropdown Filter ─────────────────────────────────────────

interface CheckboxFilterProps {
  label: string;
  options: Array<{ value: string; count: number }>;
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function CheckboxFilter({ label, options, selected, onChange }: CheckboxFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = options.filter(o => 
    o?.value && String(o.value).toLowerCase().includes(search.toLowerCase())
  );
  const allSelected = selected.length === 0 || selected.length === options.length;

  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter(v => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const selectAll = () => onChange([]);
  const clearAll = () => onChange(options.map(o => o.value).slice(0, 1)); // Select first only

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors whitespace-nowrap",
          selected.length > 0 && selected.length < options.length
            ? "bg-primary/10 text-primary border border-primary/30"
            : "text-muted-foreground hover:bg-muted border border-transparent"
        )}
      >
        {label}
        {selected.length > 0 && selected.length < options.length && (
          <span className="text-[10px] bg-primary text-white rounded-full w-4 h-4 flex items-center justify-center">
            {selected.length}
          </span>
        )}
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-lg shadow-lg w-60 max-h-72 flex flex-col">
          {options.length > 6 && (
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="h-7 pl-7 text-xs bg-background border-border"
                />
              </div>
            </div>
          )}

          <div className="p-1.5 border-b border-border flex gap-1">
            <button onClick={selectAll} className="text-[10px] text-primary hover:underline px-1">Select All</button>
            <span className="text-muted-foreground text-[10px]">|</span>
            <button onClick={clearAll} className="text-[10px] text-primary hover:underline px-1">Clear All</button>
          </div>

          <div className="overflow-y-auto p-1 flex-1">
            {filtered.map(opt => {
              const checked = allSelected || selected.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(opt.value)}
                    className="w-3.5 h-3.5"
                  />
                  <span className="flex-1 truncate">{opt.value}</span>
                  <span className="text-muted-foreground text-[10px]">{formatNumber(opt.count)}</span>
                </label>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-xs text-muted-foreground p-2 text-center">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Range Filter ──────────────────────────────────────────────────────

interface RangeFilterProps {
  label: string;
  minValue: string;
  maxValue: string;
  onChange: (min: string, max: string) => void;
  formatAs?: 'number' | 'currency' | 'year';
}

export function RangeFilter({ label, minValue, maxValue, onChange, formatAs = 'number' }: RangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [localMin, setLocalMin] = useState(minValue);
  const [localMax, setLocalMax] = useState(maxValue);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const hasFilter = minValue !== '' || maxValue !== '';

  const apply = () => {
    onChange(localMin, localMax);
    setOpen(false);
  };

  const clear = () => {
    setLocalMin('');
    setLocalMax('');
    onChange('', '');
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors whitespace-nowrap",
          hasFilter
            ? "bg-primary/10 text-primary border border-primary/30"
            : "text-muted-foreground hover:bg-muted border border-transparent"
        )}
      >
        {label}
        {hasFilter && <span className="text-[10px] bg-primary text-white rounded-full w-2 h-2" />}
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-lg shadow-lg w-52 p-3">
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase font-medium">Min</label>
              <Input
                type="number"
                value={localMin}
                onChange={e => setLocalMin(e.target.value)}
                placeholder={formatAs === 'year' ? 'e.g. 2015' : 'Min value'}
                className="h-7 text-xs bg-background border-border mt-0.5"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase font-medium">Max</label>
              <Input
                type="number"
                value={localMax}
                onChange={e => setLocalMax(e.target.value)}
                placeholder={formatAs === 'year' ? 'e.g. 2025' : 'Max value'}
                className="h-7 text-xs bg-background border-border mt-0.5"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={clear} className="flex-1 h-7 text-xs">Clear</Button>
            <Button size="sm" onClick={apply} className="flex-1 h-7 text-xs">Apply</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Active Filter Pills ────────────────────────────────────────────────

interface ActiveFilterPillsProps {
  filters: Record<string, string>;
  onRemove: (key: string) => void;
  onClearAll: () => void;
}

export function ActiveFilterPills({ filters, onRemove, onClearAll }: ActiveFilterPillsProps) {
  const activeFilters = Object.entries(filters).filter(([, v]) => v && v.length > 0);
  
  if (activeFilters.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Filter className="w-3.5 h-3.5 text-muted-foreground" />
      {activeFilters.map(([key, value]) => (
        <div
          key={key}
          className="flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-full"
        >
          <span className="font-medium">{key.replace(/_/g, ' ')}:</span>
          <span className="truncate max-w-[120px]">{value}</span>
          <button onClick={() => onRemove(key)} className="hover:bg-primary/20 rounded-full p-0.5">
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      <button
        onClick={onClearAll}
        className="text-xs text-muted-foreground hover:text-foreground underline"
      >
        Clear all
      </button>
    </div>
  );
}
