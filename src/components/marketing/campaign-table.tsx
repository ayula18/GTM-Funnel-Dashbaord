'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { EfficiencyBadge } from './efficiency-badge';
import { ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { useState } from 'react';

export interface CampaignRow {
  id: number;
  name: string;
  status: 'active' | 'paused' | 'completed';
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  cpc: number;
  comments: number;
  icp_comments: number;
  icp_rate: number;
  landed: number;
  rb2b: number;
  hotjar_sessions: number;
  meetings: number;
  companies: string;
  cost_per_meeting: number | null;
  efficiency_score: number;
}

interface CampaignTableProps {
  campaigns: CampaignRow[];
  className?: string;
}

type SortKey = keyof CampaignRow;

function formatCurrency(n: number): string {
  if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
  return '$' + n.toFixed(2);
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

const statusConfig = {
  active: { label: 'Active', dot: 'bg-emerald-500' },
  paused: { label: 'Paused', dot: 'bg-amber-500' },
  completed: { label: 'Done', dot: 'bg-muted-foreground' },
};

export function CampaignTable({ campaigns, className }: CampaignTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('efficiency_score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = [...campaigns].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === 'string' ? (av as string).localeCompare(bv as string) : (av as number) - (bv as number);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const SortHeader = ({ label, field, align }: { label: string; field: SortKey; align?: 'right' }) => (
    <button
      onClick={() => handleSort(field)}
      className={cn(
        "flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors",
        align === 'right' && "ml-auto"
      )}
    >
      {label}
      {sortKey === field ? (
        sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-30" />
      )}
    </button>
  );

  return (
    <div className={cn("bg-card border border-border rounded-xl overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-3"><SortHeader label="Campaign" field="name" /></th>
              <th className="text-left px-2 py-3"><SortHeader label="Status" field="status" /></th>
              <th className="text-right px-2 py-3"><SortHeader label="Spend" field="spend" align="right" /></th>
              <th className="text-right px-2 py-3"><SortHeader label="Impr" field="impressions" align="right" /></th>
              <th className="text-right px-2 py-3"><SortHeader label="Clicks" field="clicks" align="right" /></th>
              <th className="text-right px-2 py-3"><SortHeader label="CTR" field="ctr" align="right" /></th>
              <th className="text-right px-2 py-3"><SortHeader label="CPM" field="cpm" align="right" /></th>
              <th className="text-right px-2 py-3"><SortHeader label="CPC" field="cpc" align="right" /></th>
              <th className="text-right px-2 py-3"><SortHeader label="Comments" field="comments" align="right" /></th>
              <th className="text-right px-2 py-3"><SortHeader label="ICP" field="icp_comments" align="right" /></th>
              <th className="text-right px-2 py-3"><SortHeader label="Landed" field="landed" align="right" /></th>
              <th className="text-right px-2 py-3"><SortHeader label="Meetings" field="meetings" align="right" /></th>
              <th className="text-right px-2 py-3"><SortHeader label="$/Meeting" field="cost_per_meeting" align="right" /></th>
              <th className="text-right px-3 py-3"><SortHeader label="Score" field="efficiency_score" align="right" /></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => {
              const sc = statusConfig[c.status];
              return (
                <Link
                  key={c.id}
                  href={`/marketing/campaigns/${c.id}`}
                  className="contents"
                >
                  <tr className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer">
                    <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">
                      {c.name}
                    </td>
                    <td className="px-2 py-3">
                      <span className="flex items-center gap-1.5">
                        <span className={cn("w-1.5 h-1.5 rounded-full", sc.dot)} />
                        <span className="text-muted-foreground">{sc.label}</span>
                      </span>
                    </td>
                    <td className="px-2 py-3 text-right font-medium">{formatCurrency(c.spend)}</td>
                    <td className="px-2 py-3 text-right text-muted-foreground">{formatNum(c.impressions)}</td>
                    <td className="px-2 py-3 text-right text-muted-foreground">{formatNum(c.clicks)}</td>
                    <td className="px-2 py-3 text-right text-muted-foreground">{c.ctr.toFixed(2)}%</td>
                    <td className="px-2 py-3 text-right text-muted-foreground">{formatCurrency(c.cpm)}</td>
                    <td className="px-2 py-3 text-right text-muted-foreground">{formatCurrency(c.cpc)}</td>
                    <td className="px-2 py-3 text-right">
                      {c.comments > 0 ? (
                        <span>
                          {formatNum(c.comments)}
                          {c.icp_comments > 0 && (
                            <span className="text-primary ml-1">({c.icp_comments} ICP)</span>
                          )}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-2 py-3 text-right">
                      {c.icp_rate > 0 ? (
                        <span className="text-primary font-medium">{c.icp_rate.toFixed(1)}%</span>
                      ) : '—'}
                    </td>
                    <td className="px-2 py-3 text-right text-muted-foreground">{c.landed || '—'}</td>
                    <td className="px-2 py-3 text-right font-medium">
                      {c.meetings > 0 ? c.meetings : '—'}
                    </td>
                    <td className="px-2 py-3 text-right text-muted-foreground">
                      {c.cost_per_meeting ? formatCurrency(c.cost_per_meeting) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <EfficiencyBadge score={c.efficiency_score} />
                    </td>
                  </tr>
                </Link>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
