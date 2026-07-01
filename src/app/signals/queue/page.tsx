'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatNumber, formatCurrency, errorMessage } from '@/lib/utils';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  UserCheck, Users, Flame, Zap, Snowflake, Search, RefreshCw, ArrowRight,
  CheckCircle2, XCircle, Activity, Building2, DollarSign, Globe,
  Clock, Target, ChevronRight, Loader2, Plus, X,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────

interface QueueAccount {
  id: number;
  company_id: number;
  domain: string;
  company_name: string | null;
  gtm_bucket: string | null;
  category: string | null;
  employees: number | null;
  total_funding: number | null;
  company_country: string | null;
  tier: 'hot' | 'warm' | 'cold';
  signal_count: number;
  last_signal_title: string | null;
  last_signal_at: string | null;
  assigned_sdr: string | null;
  assigned_at: string | null;
  status: string;
  sdr_notes: string | null;
  last_touched_at: string | null;
}

interface SdrWorkload {
  sdr_name: string;
  total: number;
  hot: number;
  warm: number;
  cold: number;
  working: number;
  converted: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────

const TIER_CONFIG = {
  hot:  { label: 'Hot',  icon: Flame,    color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30', gradFrom: 'from-orange-500/20' },
  warm: { label: 'Warm', icon: Zap,      color: 'text-amber-500',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  gradFrom: 'from-amber-500/20' },
  cold: { label: 'Cold', icon: Snowflake, color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   gradFrom: 'from-blue-500/20' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  unassigned:   { label: 'Unassigned',   color: 'text-muted-foreground', bg: 'bg-muted',            icon: Users },
  assigned:     { label: 'Assigned',     color: 'text-blue-500',         bg: 'bg-blue-500/10',      icon: UserCheck },
  working:      { label: 'Working',      color: 'text-amber-500',        bg: 'bg-amber-500/10',     icon: Activity },
  converted:    { label: 'Converted',    color: 'text-emerald-500',      bg: 'bg-emerald-500/10',   icon: CheckCircle2 },
  disqualified: { label: 'Disqualified', color: 'text-red-400',          bg: 'bg-red-500/10',       icon: XCircle },
};

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

export default function SdrQueuePage() {
  const [accounts, setAccounts] = useState<QueueAccount[]>([]);
  const [workloads, setWorkloads] = useState<SdrWorkload[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterStatus, setFilterStatus] = useState('unassigned');
  const [filterTier, setFilterTier] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Assign dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<QueueAccount | null>(null);
  const [assignSdr, setAssignSdr] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);

  // Bulk assign
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkSdr, setBulkSdr] = useState('');

  // Fetch queue
  const fetchQueue = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterTier !== 'all') params.set('tier', filterTier);
      if (searchQuery) params.set('search', searchQuery);
      params.set('sort_by', 'signal_count');

      const res = await fetch(`/api/signals/targets?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.targets || []);
      }
    } catch {
      // API not built yet
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterTier, searchQuery]);

  // Fetch SDR workloads
  const fetchWorkloads = useCallback(async () => {
    try {
      const res = await fetch('/api/signals/stats?view=workloads');
      if (res.ok) {
        const data = await res.json();
        setWorkloads(data.workloads || []);
      }
    } catch {
      // API not built yet
    }
  }, []);

  useEffect(() => { fetchQueue(); fetchWorkloads(); }, [fetchQueue, fetchWorkloads]);

  // Assign account
  const handleAssign = async () => {
    if (!assignTarget || !assignSdr.trim()) return;

    setAssignLoading(true);
    try {
      await fetch('/api/signals/targets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: assignTarget.id, assigned_sdr: assignSdr.trim(), status: 'assigned' }),
      });
      toast.success(`Assigned ${assignTarget.company_name || assignTarget.domain} to ${assignSdr.trim()}`);
      setAssignDialogOpen(false);
      setAssignSdr('');
      fetchQueue();
      fetchWorkloads();
    } catch (err) {
      toast.error('Assignment failed', { description: errorMessage(err) });
    } finally {
      setAssignLoading(false);
    }
  };

  // Bulk assign
  const handleBulkAssign = async () => {
    if (selectedIds.size === 0 || !bulkSdr.trim()) return;

    try {
      for (const id of selectedIds) {
        await fetch('/api/signals/targets', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, assigned_sdr: bulkSdr.trim(), status: 'assigned' }),
        });
      }
      toast.success(`Assigned ${selectedIds.size} accounts to ${bulkSdr.trim()}`);
      setBulkAssignOpen(false);
      setBulkSdr('');
      setSelectedIds(new Set());
      fetchQueue();
      fetchWorkloads();
    } catch (err) {
      toast.error('Bulk assignment failed', { description: errorMessage(err) });
    }
  };

  // Update status
  const handleStatusChange = async (accountId: number, newStatus: string) => {
    setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, status: newStatus } : a));
    try {
      await fetch('/api/signals/targets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: accountId, status: newStatus }),
      });
      fetchWorkloads();
    } catch { /* will work when backend is built */ }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === accounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(accounts.map(a => a.id)));
    }
  };

  // Count stats
  const unassignedCount = accounts.filter(a => a.status === 'unassigned').length;
  const hotUnassigned = accounts.filter(a => a.status === 'unassigned' && a.tier === 'hot').length;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-primary/10 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-primary" />
            </div>
            SDR Queue
          </h1>
          <p className="text-muted-foreground mt-1">
            Assign target accounts to SDRs and track outreach progress
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { fetchQueue(); fetchWorkloads(); }}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          {selectedIds.size > 0 && (
            <Button size="sm" onClick={() => setBulkAssignOpen(true)} className="gap-1.5">
              <UserCheck className="w-3.5 h-3.5" />
              Assign {selectedIds.size} Selected
            </Button>
          )}
        </div>
      </div>

      {/* SDR Workload Cards */}
      {workloads.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">SDR Workloads</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {workloads.map(sdr => (
              <Card key={sdr.sdr_name} className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{sdr.sdr_name}</span>
                    <span className="text-lg font-bold">{sdr.total}</span>
                  </div>
                  <div className="flex gap-1.5">
                    {sdr.hot > 0 && (
                      <Badge variant="outline" className="text-[9px] bg-orange-500/10 text-orange-500 border-orange-500/30">
                        {sdr.hot} hot
                      </Badge>
                    )}
                    {sdr.warm > 0 && (
                      <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-500 border-amber-500/30">
                        {sdr.warm} warm
                      </Badge>
                    )}
                    {sdr.cold > 0 && (
                      <Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-400 border-blue-500/30">
                        {sdr.cold} cold
                      </Badge>
                    )}
                  </div>
                  {sdr.converted > 0 && (
                    <div className="text-[10px] text-emerald-500 mt-1.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> {sdr.converted} converted
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Alert: Hot unassigned accounts */}
      {hotUnassigned > 0 && (
        <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
            <Flame className="w-5 h-5 text-orange-500" />
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm text-orange-500">
              {hotUnassigned} hot account{hotUnassigned !== 1 ? 's' : ''} unassigned
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              These accounts have strong buying signals and should be assigned to SDRs immediately.
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-orange-500/30 text-orange-500 hover:bg-orange-500/10 shrink-0"
            onClick={() => { setFilterStatus('unassigned'); setFilterTier('hot'); }}
          >
            View Hot Accounts
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search companies..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm bg-background"
            />
          </div>

          <Select value={filterStatus} onValueChange={v => setFilterStatus(v ?? 'unassigned')}>
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

          {(filterStatus !== 'unassigned' || filterTier !== 'all') && (
            <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setFilterStatus('unassigned'); setFilterTier('all'); }}>
              <X className="w-3 h-3 mr-1" /> Clear
            </Button>
          )}
        </div>
      </div>

      {/* Queue Table */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Loading queue…</div>
      ) : accounts.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-primary/10 flex items-center justify-center mx-auto mb-5">
            <UserCheck className="w-8 h-8 text-muted-foreground/40" />
          </div>
          <h3 className="text-lg font-semibold">
            {filterStatus === 'unassigned' ? 'All accounts are assigned!' : 'No accounts match filters'}
          </h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            {filterStatus === 'unassigned'
              ? 'Great job — every target account has been assigned to an SDR.'
              : 'Try adjusting your filters to see more accounts.'}
          </p>
          {filterStatus !== 'all' && (
            <Button variant="outline" className="mt-4" onClick={() => { setFilterStatus('all'); setFilterTier('all'); }}>
              Show All Accounts
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/30 text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === accounts.length && accounts.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-border"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Tier</th>
                  <th className="px-4 py-3 font-medium text-center">Signals</th>
                  <th className="px-4 py-3 font-medium">Last Signal</th>
                  <th className="px-4 py-3 font-medium">Bucket</th>
                  <th className="px-4 py-3 font-medium text-right">Employees</th>
                  <th className="px-4 py-3 font-medium">SDR</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium w-24">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {accounts.map(account => {
                  const tierCfg = TIER_CONFIG[account.tier as keyof typeof TIER_CONFIG] || TIER_CONFIG.cold;
                  const TierIcon = tierCfg.icon;
                  const isSelected = selectedIds.has(account.id);

                  return (
                    <tr key={account.id} className={`hover:bg-muted/20 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}>
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(account.id)}
                          className="rounded border-border"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="min-w-[150px]">
                          <div className="font-medium text-sm truncate max-w-[200px]">
                            {account.company_name || account.domain}
                          </div>
                          <div className="text-[11px] text-muted-foreground">{account.domain}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`text-[10px] gap-1 ${tierCfg.bg} ${tierCfg.color} ${tierCfg.border}`}>
                          <TierIcon className="w-3 h-3" />
                          {tierCfg.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {account.signal_count > 0 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                            {account.signal_count}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {account.last_signal_title ? (
                          <div className="min-w-[120px]">
                            <div className="text-xs truncate max-w-[150px]">{account.last_signal_title}</div>
                            <div className="text-[10px] text-muted-foreground">{timeAgo(account.last_signal_at)}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {account.gtm_bucket && (
                          <span className="text-[10px] font-medium capitalize">{account.gtm_bucket}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs">
                        {account.employees ? formatNumber(account.employees) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium">{account.assigned_sdr || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={account.status}
                          onValueChange={v => handleStatusChange(account.id, v)}
                        >
                          <SelectTrigger className="h-7 text-[10px] w-[110px] border-none bg-transparent p-0">
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
                      </td>
                      <td className="px-4 py-3">
                        {account.status === 'unassigned' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] gap-1"
                            onClick={() => { setAssignTarget(account); setAssignDialogOpen(true); }}
                          >
                            <UserCheck className="w-3 h-3" /> Assign
                          </Button>
                        ) : (
                          <Link href={`/signals?target=${account.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 text-primary">
                              View <ChevronRight className="w-3 h-3" />
                            </Button>
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-[400px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-primary" />
              Assign Account
            </DialogTitle>
          </DialogHeader>
          {assignTarget && (
            <div className="space-y-4 py-2">
              <div className="bg-muted/30 rounded-lg border border-border p-3">
                <div className="font-medium text-sm">{assignTarget.company_name || assignTarget.domain}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{assignTarget.domain}</div>
                <div className="flex gap-2 mt-2">
                  {assignTarget.tier && (
                    <Badge variant="outline" className={`text-[9px] ${TIER_CONFIG[assignTarget.tier]?.bg} ${TIER_CONFIG[assignTarget.tier]?.color}`}>
                      {TIER_CONFIG[assignTarget.tier]?.label}
                    </Badge>
                  )}
                  {assignTarget.signal_count > 0 && (
                    <Badge variant="outline" className="text-[9px]">{assignTarget.signal_count} signals</Badge>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium">Assign to SDR</label>
                <Input
                  placeholder="SDR name..."
                  value={assignSdr}
                  onChange={e => setAssignSdr(e.target.value)}
                  className="h-9"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleAssign()}
                />
                {workloads.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {workloads.map(w => (
                      <button
                        key={w.sdr_name}
                        onClick={() => setAssignSdr(w.sdr_name)}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                      >
                        {w.sdr_name} ({w.total})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)} disabled={assignLoading}>Cancel</Button>
            <Button onClick={handleAssign} disabled={!assignSdr.trim() || assignLoading}>
              {assignLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <UserCheck className="w-4 h-4 mr-1.5" />}
              {assignLoading ? 'Assigning…' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Assign Dialog */}
      <Dialog open={bulkAssignOpen} onOpenChange={setBulkAssignOpen}>
        <DialogContent className="sm:max-w-[400px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Bulk Assign ({selectedIds.size} accounts)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Assign all to SDR</label>
              <Input
                placeholder="SDR name..."
                value={bulkSdr}
                onChange={e => setBulkSdr(e.target.value)}
                className="h-9"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleBulkAssign()}
              />
              {workloads.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {workloads.map(w => (
                    <button
                      key={w.sdr_name}
                      onClick={() => setBulkSdr(w.sdr_name)}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                    >
                      {w.sdr_name} ({w.total})
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkAssignOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkAssign} disabled={!bulkSdr.trim()}>
              <UserCheck className="w-4 h-4 mr-1.5" />
              Assign {selectedIds.size} Accounts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
