'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatNumber } from '@/lib/utils';
import type { DashboardStats, FunnelWithStats } from '@/lib/types';
import Link from 'next/link';
import {
  LayoutDashboard, Users, CheckCircle2, XCircle, AlertTriangle,
  Wifi, WifiOff, Globe, TrendingDown, Eye, ArrowRight, GitMerge
} from 'lucide-react';

// Fetch JSON, patiently retrying transient failures. A fresh Vercel deploy
// cold-starts the function AND a new Supabase pooler connection, which can take
// 10–30s to become reliably responsive — so we retry with exponential backoff
// for ~25s total instead of giving up and showing an empty dashboard. Returns
// null only after all attempts fail, and never returns an API `{error}` body.
async function fetchJsonWithRetry(url: string, attempts = 8): Promise<unknown | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && !(data as { error?: unknown }).error) return data;
      }
    } catch { /* network / cold-start hiccup — retry */ }
    if (i < attempts - 1) {
      await new Promise(r => setTimeout(r, Math.min(5000, 400 * 2 ** i)));
    }
  }
  return null;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [funnels, setFunnels] = useState<FunnelWithStats[]>([]);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Funnel list — for the scope selector + the "Active Funnels" section.
  useEffect(() => {
    let cancelled = false;
    fetchJsonWithRetry('/api/funnels').then(f => {
      if (!cancelled && Array.isArray(f)) setFunnels(f);
    });
    return () => { cancelled = true; };
  }, [reloadNonce]);

  // Stats — refetched on scope change or a manual retry. Patiently retries
  // transient failures and only commits a VALID stats object, so a cold-start
  // self-heals instead of sticking on an empty/undefined view.
  useEffect(() => {
    let cancelled = false;
    const url = selectedFunnelId === 'all' ? '/api/stats' : `/api/stats?funnel_id=${selectedFunnelId}`;

    const load = async () => {
      setStatsLoading(true);
      setLoadError(false);
      const data = await fetchJsonWithRetry(url);
      if (cancelled) return;
      if (data && typeof (data as DashboardStats).total === 'number') {
        setStats(data as DashboardStats);
      } else {
        setLoadError(true);   // exhausted retries — show an honest error, not empty data
      }
      setLoading(false);
      setStatsLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [selectedFunnelId, reloadNonce]);

  const selectedFunnel = funnels.find(f => String(f.id) === selectedFunnelId);

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-screen gap-2">
        <div className="text-muted-foreground">Loading dashboard…</div>
        <div className="text-xs text-muted-foreground/60">Waking up the database — this can take a few seconds right after a deploy.</div>
      </div>
    );
  }

  // Honest error state — only when we genuinely failed to load (never "No data
  // yet" masquerading as a real empty result).
  if (loadError && !stats) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-screen gap-3">
        <div className="text-foreground font-medium">Couldn’t load the dashboard</div>
        <div className="text-sm text-muted-foreground max-w-md text-center">
          The database didn’t respond in time (common for a few seconds right after a new deployment). Your data is safe — just try again.
        </div>
        <button
          onClick={() => { setLoading(true); setReloadNonce(n => n + 1); }}
          className="mt-1 px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90"
        >
          Retry
        </button>
      </div>
    );
  }

  const s = (stats ?? {}) as DashboardStats;
  // Distributions are % of their OWN population (companies that have that field),
  // not of the global total — otherwise a "breakdown" can exceed 100%.
  // NB: Postgres returns COUNT(*) as a string, so coerce with Number() — a bare
  // `+` would concatenate ("0"+"1560") and zero out every percentage.
  const classTotal = (s.classification_breakdown ?? []).reduce((sum, b) => sum + Number(b.count), 0);
  const confTotal  = (s.confidence_breakdown ?? []).reduce((sum, b) => sum + Number(b.count), 0);

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            {selectedFunnelId === 'all'
              ? 'Global overview across all funnels'
              : `Scoped to: ${selectedFunnel?.name ?? 'funnel'}`}
          </p>
        </div>
        <div className="w-full sm:w-72">
          <Select value={selectedFunnelId} onValueChange={v => setSelectedFunnelId(v ?? 'all')}>
            <SelectTrigger className="bg-card">
              <SelectValue placeholder="Select scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Funnels (Global)</SelectItem>
              {funnels.map(f => (
                <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats Cards - Row 1 */}
      <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 transition-opacity ${statsLoading ? 'opacity-50' : ''}`}>
        <StatCard label="Total Companies" value={s.total} icon={<Users className="w-4 h-4" />} />
        <StatCard label="In Apollo" value={s.in_apollo} icon={<Globe className="w-4 h-4" />} color="blue" />
        <StatCard label="ICP Qualified" value={s.icp_yes} icon={<CheckCircle2 className="w-4 h-4" />} color="green" />
        <StatCard label="ICP No" value={s.icp_no} icon={<XCircle className="w-4 h-4" />} color="red" />
        <StatCard label="Needs Review" value={s.icp_review} icon={<AlertTriangle className="w-4 h-4" />} color="amber" />
        <StatCard label="Master ICP" value={s.master_icp_count} icon={<LayoutDashboard className="w-4 h-4" />} color="purple" />
      </div>

      {/* Stats Cards - Row 2: Quality Metrics */}
      <div className={`grid grid-cols-2 md:grid-cols-5 gap-4 transition-opacity ${statsLoading ? 'opacity-50' : ''}`}>
        <StatCard label="NetNew" value={s.netnew} icon={<TrendingDown className="w-4 h-4" />} color="green" />
        <StatCard label="M&A / Subsidiary" value={s.acquired_count} icon={<GitMerge className="w-4 h-4" />} color="purple" subtitle="Acquired, kept separate" />
        <StatCard label="Dead Domains" value={s.dead_domains} icon={<WifiOff className="w-4 h-4" />} color="red" />
        <StatCard label="False Negatives" value={s.false_negatives} icon={<Eye className="w-4 h-4" />} color="amber" subtitle="No → Manual Yes" />
        <StatCard label="Scrape Success" value={`${s.scrape_success_rate ?? 0}%`} icon={<Wifi className="w-4 h-4" />} color="blue" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Classification Breakdown */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Classification Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {s.classification_breakdown?.length > 0 ? (
              <div className="space-y-3">
                {s.classification_breakdown.map((item) => {
                  const pct = classTotal > 0 ? Math.round((item.count / classTotal) * 100) : 0;
                  const color = item.company_classification === 'DevTool' ? 'bg-emerald-500' 
                    : item.company_classification === 'IT Services & Solutions' ? 'bg-amber-500'
                    : 'bg-slate-400';
                  return (
                    <div key={item.company_classification}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{item.company_classification}</span>
                        <span className="text-muted-foreground">{formatNumber(item.count)} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">No data yet</div>
            )}
          </CardContent>
        </Card>

        {/* Confidence Distribution */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Confidence Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {s.confidence_breakdown?.length > 0 ? (
              <div className="space-y-3">
                {s.confidence_breakdown.map((item) => {
                  const pct = confTotal > 0 ? Math.round((item.count / confTotal) * 100) : 0;
                  const color = item.confidence === 'High' ? 'bg-emerald-500'
                    : item.confidence === 'Medium' ? 'bg-amber-500' : 'bg-red-500';
                  return (
                    <div key={item.confidence}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{item.confidence}</span>
                        <span className="text-muted-foreground">{formatNumber(item.count)} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">No data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Category Distribution */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Top Categories</CardTitle>
        </CardHeader>
        <CardContent>
          {s.category_breakdown?.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
              {s.category_breakdown.slice(0, 18).map((item, idx: number) => {
                const maxCount = s.category_breakdown[0]?.count || 1;
                const pct = Math.round((item.count / maxCount) * 100);
                return (
                  <div key={item.category} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4 text-right">{idx + 1}</span>
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="truncate pr-2">{item.category}</span>
                        <span className="text-muted-foreground font-medium tabular-nums">{item.count}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-8">No data yet</div>
          )}
        </CardContent>
      </Card>

      {/* Discard Breakdown */}
      {s.discard_breakdown?.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Discard Reasons (Funnel Drop-offs)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 flex-wrap">
              {s.discard_breakdown.map((item) => {
                const labels: Record<string, string> = {
                  not_in_apollo: 'Not in Apollo',
                  low_employees: 'Low Employees',
                  not_icp: 'Not ICP',
                  low_funding: 'Low Funding',
                  dead_domain: 'Dead Domain',
                  scrape_failed: 'Scrape Failed',
                };
                return (
                  <div key={item.discard_reason} className="bg-muted rounded-lg px-4 py-3 text-center">
                    <div className="text-2xl font-bold">{formatNumber(item.count)}</div>
                    <div className="text-xs text-muted-foreground mt-1">{labels[item.discard_reason] || item.discard_reason}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Funnels */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Active Funnels</CardTitle>
          <Link href="/funnels" className="text-xs text-primary hover:underline flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {funnels.length > 0 ? (
            <div className="space-y-3">
              {funnels.slice(0, 5).map((f) => (
                <Link key={f.id} href={`/funnels/${f.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                    <div>
                      <div className="font-medium text-sm">{f.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {formatNumber(f.total_companies)} companies • Created {new Date(f.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
                        {formatNumber(f.icp_yes)} Yes
                      </Badge>
                      <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs">
                        {formatNumber(f.icp_review)} Review
                      </Badge>
                      <Badge className="bg-red-500/10 text-red-600 border-red-500/20 text-xs">
                        {formatNumber(f.icp_no)} No
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-8">
              No funnels yet. <Link href="/upload" className="text-primary hover:underline">Upload your first CSV</Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Stat Card Component ───────────────────────────────────────────────

function StatCard({ label, value, icon, color, subtitle }: { 
  label: string; value: number | string; icon: React.ReactNode; color?: string; subtitle?: string 
}) {
  const colorMap: Record<string, string> = {
    green: 'text-emerald-600 bg-emerald-500/10',
    red: 'text-red-600 bg-red-500/10',
    amber: 'text-amber-600 bg-amber-500/10',
    blue: 'text-blue-600 bg-blue-500/10',
    purple: 'text-purple-600 bg-purple-500/10',
  };
  const iconClass = color ? colorMap[color] || 'text-muted-foreground bg-muted' : 'text-muted-foreground bg-muted';

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium">{label}</span>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconClass}`}>
            {icon}
          </div>
        </div>
        <div className="text-2xl font-bold tracking-tight">
          {typeof value === 'number' ? formatNumber(value) : value}
        </div>
        {subtitle && <div className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}
