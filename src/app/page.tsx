'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatNumber } from '@/lib/utils';
import Link from 'next/link';
import { 
  LayoutDashboard, Users, CheckCircle2, XCircle, AlertTriangle,
  Wifi, WifiOff, Globe, TrendingDown, Eye, ArrowRight, GitMerge
} from 'lucide-react';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [funnels, setFunnels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/stats').then(r => r.json()),
      fetch('/api/funnels').then(r => r.json()),
    ]).then(([s, f]) => {
      setStats(s);
      setFunnels(Array.isArray(f) ? f : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  const s = stats || {};

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">ICP Automation Funnel Overview</p>
      </div>

      {/* Stats Cards - Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Total Companies" value={s.total} icon={<Users className="w-4 h-4" />} />
        <StatCard label="In Apollo" value={s.in_apollo} icon={<Globe className="w-4 h-4" />} color="blue" />
        <StatCard label="ICP Qualified" value={s.icp_yes} icon={<CheckCircle2 className="w-4 h-4" />} color="green" />
        <StatCard label="ICP No" value={s.icp_no} icon={<XCircle className="w-4 h-4" />} color="red" />
        <StatCard label="Needs Review" value={s.icp_review} icon={<AlertTriangle className="w-4 h-4" />} color="amber" />
        <StatCard label="Master ICP" value={s.master_icp_count} icon={<LayoutDashboard className="w-4 h-4" />} color="purple" />
      </div>

      {/* Stats Cards - Row 2: Quality Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="NetNew" value={s.netnew} icon={<TrendingDown className="w-4 h-4" />} color="green" />
        <StatCard label="M&A / Subsidiary" value={s.acquired_count} icon={<GitMerge className="w-4 h-4" />} color="purple" subtitle="Acquired, kept separate" />
        <StatCard label="Dead Domains" value={s.dead_domains} icon={<WifiOff className="w-4 h-4" />} color="red" />
        <StatCard label="False Negatives" value={s.false_negatives} icon={<Eye className="w-4 h-4" />} color="amber" subtitle="No → Manual Yes" />
        <StatCard label="Scrape Success" value={`${s.scrape_success_rate}%`} icon={<Wifi className="w-4 h-4" />} color="blue" />
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
                {s.classification_breakdown.map((item: any) => {
                  const pct = s.total > 0 ? Math.round((item.count / s.total) * 100) : 0;
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
                {s.confidence_breakdown.map((item: any) => {
                  const pct = s.icp_yes > 0 ? Math.round((item.count / s.icp_yes) * 100) : 0;
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
              {s.category_breakdown.slice(0, 18).map((item: any, idx: number) => {
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
              {s.discard_breakdown.map((item: any) => {
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
              {funnels.slice(0, 5).map((f: any) => (
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
