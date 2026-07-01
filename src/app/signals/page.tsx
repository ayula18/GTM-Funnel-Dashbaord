'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { formatNumber, formatCurrency, truncate } from '@/lib/utils';
import Link from 'next/link';
import {
  Radar, Search, Flame, Zap, Snowflake, Users, UserCheck, UserX, Activity,
  ExternalLink, Building2, Globe, DollarSign, Calendar, MapPin, Briefcase,
  ChevronRight, RefreshCw, Upload, Plus, ArrowUpDown, X, Tag, StickyNote,
} from 'lucide-react';

// ── Types (frontend-only until backend is built) ───────────────────────

interface SignalTarget {
  id: number;
  company_id: number;
  domain: string;
  company_name: string | null;
  company_classification: string | null;
  category: string | null;
  sub_category: string | null;
  gtm_bucket: string | null;
  employees: number | null;
  total_funding: number | null;
  annual_revenue: number | null;
  founded_year: number | null;
  company_country: string | null;
  company_linkedin_url: string | null;
  website: string | null;
  short_description: string | null;
  tier: 'hot' | 'warm' | 'cold';
  priority_notes: string | null;
  assigned_sdr: string | null;
  assigned_at: string | null;
  status: 'unassigned' | 'assigned' | 'working' | 'converted' | 'disqualified';
  sdr_notes: string | null;
  last_touched_at: string | null;
  signal_count: number;
  last_signal_at: string | null;
  last_signal_title: string | null;
  created_at: string;
}

interface SignalEvent {
  id: number;
  signal_type: string;
  signal_title: string;
  signal_detail: string | null;
  signal_source: string;
  signal_date: string | null;
  tier: string;
  is_active: boolean;
  created_at: string;
}

interface SignalStats {
  total_targets: number;
  hot: number;
  warm: number;
  cold: number;
  assigned: number;
  unassigned: number;
  working: number;
  converted: number;
  total_signals: number;
}

// ── Mock data for UI development ───────────────────────────────────────

const MOCK_STATS: SignalStats = {
  total_targets: 0, hot: 0, warm: 0, cold: 0,
  assigned: 0, unassigned: 0, working: 0, converted: 0, total_signals: 0,
};

// ── Helpers ─────────────────────────────────────────────────────────────

const TIER_CONFIG = {
  hot:  { label: 'Hot',  icon: Flame,    color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  warm: { label: 'Warm', icon: Zap,      color: 'text-amber-500',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30' },
  cold: { label: 'Cold', icon: Snowflake, color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  unassigned:   { label: 'Unassigned',   color: 'text-muted-foreground', bg: 'bg-muted' },
  assigned:     { label: 'Assigned',     color: 'text-blue-500',         bg: 'bg-blue-500/10' },
  working:      { label: 'Working',      color: 'text-amber-500',        bg: 'bg-amber-500/10' },
  converted:    { label: 'Converted',    color: 'text-emerald-500',      bg: 'bg-emerald-500/10' },
  disqualified: { label: 'Disqualified', color: 'text-red-400',          bg: 'bg-red-500/10' },
};

const BUCKET_COLORS: Record<string, string> = {
  enterprise:   'bg-purple-500/10 text-purple-400 border-purple-500/30',
  commercial:   'bg-blue-500/10 text-blue-400 border-blue-500/30',
  smb:          'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  startup:      'bg-amber-500/10 text-amber-400 border-amber-500/30',
  immature:     'bg-slate-500/10 text-slate-400 border-slate-500/30',
  future_icp:   'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  unclassified: 'bg-muted text-muted-foreground border-border',
};

function TierBadge({ tier }: { tier: string }) {
  const cfg = TIER_CONFIG[tier as keyof typeof TIER_CONFIG] || TIER_CONFIG.cold;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`${cfg.bg} ${cfg.color} ${cfg.border} text-[10px] gap-1`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unassigned;
  return (
    <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Main Component ──────────────────────────────────────────────────────

export default function SignalBoardPage() {
  const [targets, setTargets] = useState<SignalTarget[]>([]);
  const [stats, setStats] = useState<SignalStats>(MOCK_STATS);
  const [loading, setLoading] = useState(true);
  const [selectedTarget, setSelectedTarget] = useState<SignalTarget | null>(null);
  const [targetSignals, setTargetSignals] = useState<SignalEvent[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTier, setFilterTier] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterBucket, setFilterBucket] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('signal_count');

  // Fetch targets
  const fetchTargets = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (filterTier !== 'all') params.set('tier', filterTier);
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterBucket !== 'all') params.set('bucket', filterBucket);
      if (sortBy) params.set('sort_by', sortBy);

      const res = await fetch(`/api/signals/targets?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTargets(data.targets || []);
      }
    } catch {
      // API not built yet — will show empty state
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filterTier, filterStatus, filterBucket, sortBy]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/signals/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // API not built yet
    }
  }, []);

  // Fetch signals for selected target
  const fetchTargetSignals = useCallback(async (companyId: number) => {
    try {
      const res = await fetch(`/api/signals/events?company_id=${companyId}`);
      if (res.ok) {
        const data = await res.json();
        setTargetSignals(data.events || []);
      }
    } catch {
      setTargetSignals([]);
    }
  }, []);

  useEffect(() => { fetchTargets(); fetchStats(); }, [fetchTargets, fetchStats]);

  const handleSelectTarget = (target: SignalTarget) => {
    setSelectedTarget(target);
    setDetailOpen(true);
    fetchTargetSignals(target.company_id);
  };

  const handleTierChange = async (targetId: number, newTier: string) => {
    // Optimistic update
    setTargets(prev => prev.map(t => t.id === targetId ? { ...t, tier: newTier as SignalTarget['tier'] } : t));
    if (selectedTarget?.id === targetId) {
      setSelectedTarget(prev => prev ? { ...prev, tier: newTier as SignalTarget['tier'] } : prev);
    }
    try {
      await fetch('/api/signals/targets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: targetId, tier: newTier }),
      });
      fetchStats();
    } catch { /* will succeed when backend is built */ }
  };

  const handleAssign = async (targetId: number, sdrName: string) => {
    setTargets(prev => prev.map(t =>
      t.id === targetId ? { ...t, assigned_sdr: sdrName, status: 'assigned' as const, assigned_at: new Date().toISOString() } : t
    ));
    try {
      await fetch('/api/signals/targets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: targetId, assigned_sdr: sdrName, status: 'assigned' }),
      });
      fetchStats();
    } catch { /* will succeed when backend is built */ }
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 via-amber-500/20 to-blue-500/20 flex items-center justify-center">
              <Radar className="w-5 h-5 text-primary" />
            </div>
            Signal Board
          </h1>
          <p className="text-muted-foreground mt-1">
            Target accounts with buying signals — prioritize and assign to SDRs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { fetchTargets(); fetchStats(); }}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Link href="/signals/upload">
            <Button size="sm" className="gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Upload Targets
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <StatCard label="Total Targets" value={stats.total_targets} icon={<Users className="w-3.5 h-3.5" />} />
        <StatCard label="Hot" value={stats.hot} icon={<Flame className="w-3.5 h-3.5" />} color="orange" />
        <StatCard label="Warm" value={stats.warm} icon={<Zap className="w-3.5 h-3.5" />} color="amber" />
        <StatCard label="Cold" value={stats.cold} icon={<Snowflake className="w-3.5 h-3.5" />} color="blue" />
        <StatCard label="Unassigned" value={stats.unassigned} icon={<UserX className="w-3.5 h-3.5" />} color="red" />
        <StatCard label="Assigned" value={stats.assigned} icon={<UserCheck className="w-3.5 h-3.5" />} color="blue" />
        <StatCard label="Working" value={stats.working} icon={<Activity className="w-3.5 h-3.5" />} color="amber" />
        <StatCard label="Converted" value={stats.converted} icon={<UserCheck className="w-3.5 h-3.5" />} color="green" />
      </div>

      {/* Filters Bar */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search companies or domains..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm bg-background"
            />
          </div>

          {/* Tier */}
          <Select value={filterTier} onValueChange={v => setFilterTier(v ?? 'all')}>
            <SelectTrigger className="w-[130px] h-9 text-xs">
              <SelectValue placeholder="Tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              <SelectItem value="hot">🔥 Hot</SelectItem>
              <SelectItem value="warm">⚡ Warm</SelectItem>
              <SelectItem value="cold">❄️ Cold</SelectItem>
            </SelectContent>
          </Select>

          {/* Status */}
          <Select value={filterStatus} onValueChange={v => setFilterStatus(v ?? 'all')}>
            <SelectTrigger className="w-[150px] h-9 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="working">Working</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
              <SelectItem value="disqualified">Disqualified</SelectItem>
            </SelectContent>
          </Select>

          {/* Bucket */}
          <Select value={filterBucket} onValueChange={v => setFilterBucket(v ?? 'all')}>
            <SelectTrigger className="w-[150px] h-9 text-xs">
              <SelectValue placeholder="Bucket" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Buckets</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
              <SelectItem value="commercial">Commercial</SelectItem>
              <SelectItem value="smb">SMB</SelectItem>
              <SelectItem value="startup">Startup</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select value={sortBy} onValueChange={v => setSortBy(v ?? 'signal_count')}>
            <SelectTrigger className="w-[160px] h-9 text-xs">
              <ArrowUpDown className="w-3 h-3 mr-1" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="signal_count">Signal Count</SelectItem>
              <SelectItem value="last_signal">Latest Signal</SelectItem>
              <SelectItem value="tier">Tier</SelectItem>
              <SelectItem value="employees">Employees</SelectItem>
              <SelectItem value="funding">Funding</SelectItem>
              <SelectItem value="company_name">Company Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Table */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Loading targets…</div>
      ) : targets.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/10 via-amber-500/10 to-blue-500/10 flex items-center justify-center mx-auto mb-5">
            <Radar className="w-8 h-8 text-muted-foreground/40" />
          </div>
          <h3 className="text-lg font-semibold">No target accounts yet</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Upload your refined ICP list to start tracking signals and assigning accounts to SDRs.
          </p>
          <Link href="/signals/upload">
            <Button className="mt-5 gap-2">
              <Upload className="w-4 h-4" /> Upload Target List
            </Button>
          </Link>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/30 text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Bucket</th>
                  <th className="px-4 py-3 font-medium">Tier</th>
                  <th className="px-4 py-3 font-medium text-center">Signals</th>
                  <th className="px-4 py-3 font-medium">Last Signal</th>
                  <th className="px-4 py-3 font-medium">SDR</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Employees</th>
                  <th className="px-4 py-3 font-medium text-right">Funding</th>
                  <th className="px-4 py-3 font-medium w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {targets.map(target => (
                  <tr
                    key={target.id}
                    className="hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => handleSelectTarget(target)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5 min-w-[180px]">
                        <div className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                          {(target.company_name || target.domain).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate max-w-[200px]">
                            {target.company_name || target.domain}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                            {target.domain}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {target.gtm_bucket && (
                        <Badge variant="outline" className={`text-[10px] capitalize ${BUCKET_COLORS[target.gtm_bucket] || ''}`}>
                          {target.gtm_bucket}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <TierBadge tier={target.tier} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {target.signal_count > 0 ? (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold">
                          {target.signal_count}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {target.last_signal_title ? (
                        <div className="min-w-[140px]">
                          <div className="text-xs truncate max-w-[180px]">{target.last_signal_title}</div>
                          <div className="text-[10px] text-muted-foreground">{timeAgo(target.last_signal_at)}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No signals</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium">{target.assigned_sdr || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={target.status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">
                      {target.employees ? formatNumber(target.employees) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">
                      {target.total_funding ? formatCurrency(target.total_funding) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Panel (Sheet) */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="sm:max-w-xl w-full overflow-y-auto">
          {selectedTarget && (
            <>
              <SheetHeader className="border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-lg font-bold text-primary">
                    {(selectedTarget.company_name || selectedTarget.domain).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="text-lg truncate">
                      {selectedTarget.company_name || selectedTarget.domain}
                    </SheetTitle>
                    <SheetDescription className="flex items-center gap-2 mt-0.5">
                      <Globe className="w-3 h-3" />
                      <a href={`https://${selectedTarget.domain}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">
                        {selectedTarget.domain}
                      </a>
                      {selectedTarget.company_linkedin_url && (
                        <a href={selectedTarget.company_linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-[11px]">
                          LinkedIn ↗
                        </a>
                      )}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="py-5 space-y-6">
                {/* Tier & Status Controls */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tier</label>
                    <Select value={selectedTarget.tier} onValueChange={v => handleTierChange(selectedTarget.id, v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hot">🔥 Hot</SelectItem>
                        <SelectItem value="warm">⚡ Warm</SelectItem>
                        <SelectItem value="cold">❄️ Cold</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</label>
                    <Select value={selectedTarget.status} onValueChange={v => {
                      setTargets(prev => prev.map(t => t.id === selectedTarget.id ? { ...t, status: v as SignalTarget['status'] } : t));
                      setSelectedTarget(prev => prev ? { ...prev, status: v as SignalTarget['status'] } : prev);
                    }}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        <SelectItem value="assigned">Assigned</SelectItem>
                        <SelectItem value="working">Working</SelectItem>
                        <SelectItem value="converted">Converted</SelectItem>
                        <SelectItem value="disqualified">Disqualified</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Company Info */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-3 h-3" /> Company Info
                  </h4>
                  <div className="bg-muted/30 rounded-lg border border-border p-3 space-y-2">
                    {selectedTarget.short_description && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{selectedTarget.short_description}</p>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <InfoRow icon={<Briefcase className="w-3 h-3" />} label="Category" value={selectedTarget.category} />
                      <InfoRow icon={<Tag className="w-3 h-3" />} label="Bucket" value={selectedTarget.gtm_bucket} />
                      <InfoRow icon={<Users className="w-3 h-3" />} label="Employees" value={selectedTarget.employees ? formatNumber(selectedTarget.employees) : null} />
                      <InfoRow icon={<DollarSign className="w-3 h-3" />} label="Funding" value={selectedTarget.total_funding ? formatCurrency(selectedTarget.total_funding) : null} />
                      <InfoRow icon={<DollarSign className="w-3 h-3" />} label="Revenue" value={selectedTarget.annual_revenue ? formatCurrency(selectedTarget.annual_revenue) : null} />
                      <InfoRow icon={<Calendar className="w-3 h-3" />} label="Founded" value={selectedTarget.founded_year?.toString()} />
                      <InfoRow icon={<MapPin className="w-3 h-3" />} label="Country" value={selectedTarget.company_country} />
                      <InfoRow icon={<Tag className="w-3 h-3" />} label="Class" value={selectedTarget.company_classification} />
                    </div>
                  </div>
                </div>

                {/* SDR Assignment */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <UserCheck className="w-3 h-3" /> SDR Assignment
                  </h4>
                  <div className="bg-muted/30 rounded-lg border border-border p-3 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="SDR name..."
                        className="h-8 text-xs flex-1"
                        defaultValue={selectedTarget.assigned_sdr || ''}
                        onBlur={e => {
                          const val = e.target.value.trim();
                          if (val && val !== selectedTarget.assigned_sdr) {
                            handleAssign(selectedTarget.id, val);
                          }
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const val = (e.target as HTMLInputElement).value.trim();
                            if (val) handleAssign(selectedTarget.id, val);
                          }
                        }}
                      />
                    </div>
                    {selectedTarget.assigned_at && (
                      <div className="text-[10px] text-muted-foreground">
                        Assigned {timeAgo(selectedTarget.assigned_at)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Signal Timeline */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Activity className="w-3 h-3" /> Signal Timeline
                    </h4>
                    <Link href={`/signals/feed?company=${selectedTarget.company_id}`}>
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-primary">
                        View All <ExternalLink className="w-2.5 h-2.5" />
                      </Button>
                    </Link>
                  </div>

                  {targetSignals.length === 0 ? (
                    <div className="bg-muted/30 rounded-lg border border-dashed border-border p-6 text-center">
                      <Activity className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">No signals recorded yet</p>
                      <Link href="/signals/feed">
                        <Button variant="outline" size="sm" className="mt-3 h-7 text-[10px] gap-1">
                          <Plus className="w-3 h-3" /> Add Signal
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {targetSignals.slice(0, 10).map(signal => (
                        <div key={signal.id} className="bg-muted/30 rounded-lg border border-border p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <TierBadge tier={signal.tier} />
                                <Badge variant="outline" className="text-[9px]">{signal.signal_type}</Badge>
                              </div>
                              <div className="text-xs font-medium mt-1">{signal.signal_title}</div>
                              {signal.signal_detail && (
                                <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{signal.signal_detail}</div>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                              {timeAgo(signal.signal_date || signal.created_at)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[9px] text-muted-foreground/70">via {signal.signal_source}</span>
                            {!signal.is_active && (
                              <span className="text-[9px] text-red-400">Archived</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <StickyNote className="w-3 h-3" /> Notes
                  </h4>
                  <textarea
                    className="w-full bg-muted/30 border border-border rounded-lg p-3 text-xs min-h-[80px] resize-none outline-none focus:border-primary/50 placeholder:text-muted-foreground/50"
                    placeholder="Add notes about this account..."
                    defaultValue={selectedTarget.priority_notes || selectedTarget.sdr_notes || ''}
                  />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function StatCard({ label, value, icon, color }: {
  label: string; value: number; icon: React.ReactNode; color?: string;
}) {
  const colorMap: Record<string, string> = {
    orange: 'text-orange-500 bg-orange-500/10',
    amber: 'text-amber-500 bg-amber-500/10',
    blue: 'text-blue-500 bg-blue-500/10',
    green: 'text-emerald-500 bg-emerald-500/10',
    red: 'text-red-500 bg-red-500/10',
  };
  const iconClass = color ? colorMap[color] || 'text-muted-foreground bg-muted' : 'text-muted-foreground bg-muted';

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
          <div className={`w-6 h-6 rounded-md flex items-center justify-center ${iconClass}`}>
            {icon}
          </div>
        </div>
        <div className="text-xl font-bold tracking-tight">{formatNumber(value)}</div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium truncate">{value || '—'}</span>
    </div>
  );
}
