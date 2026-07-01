'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatNumber, errorMessage } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Rss, Plus, Search, Flame, Zap, Snowflake, Upload, RefreshCw,
  Calendar, Globe, Building2, MessageSquareText, Loader2, FileSpreadsheet,
  Activity, ArrowRight, ExternalLink, X, Filter, Trash2,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────

interface SignalEvent {
  id: number;
  company_id: number;
  company_name: string | null;
  domain: string;
  signal_type: string;
  signal_title: string;
  signal_detail: string | null;
  signal_source: string;
  signal_date: string | null;
  tier: string;
  tags: string[];
  is_active: boolean;
  created_at: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<string, { label: string; icon: typeof Flame; color: string; bg: string; border: string }> = {
  high:   { label: 'High',   icon: Flame,    color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  medium: { label: 'Medium', icon: Zap,      color: 'text-amber-500',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30' },
  low:    { label: 'Low',    icon: Snowflake, color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30' },
};

const SOURCE_ICONS: Record<string, typeof Globe> = {
  manual: Plus,
  csv_import: FileSpreadsheet,
  marketing_comments: MessageSquareText,
  system: Activity,
};

function timeAgo(dateStr: string | null) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Main Component ──────────────────────────────────────────────────────

export default function SignalFeedPage() {
  const [events, setEvents] = useState<SignalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [signalTypes, setSignalTypes] = useState<string[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterTier, setFilterTier] = useState('all');
  const [filterSource, setFilterSource] = useState('all');

  // Add Signal Modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    domain: '',
    signal_type: '',
    signal_title: '',
    signal_detail: '',
    tier: 'medium',
    signal_date: new Date().toISOString().split('T')[0],
  });
  const [addLoading, setAddLoading] = useState(false);

  // CSV Import Modal
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  // Comment Sync
  const [syncingComments, setSyncingComments] = useState(false);

  // Fetch events
  const fetchEvents = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (filterType !== 'all') params.set('type', filterType);
      if (filterTier !== 'all') params.set('tier', filterTier);
      if (filterSource !== 'all') params.set('source', filterSource);
      params.set('limit', '100');

      const res = await fetch(`/api/signals/events?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        // Extract unique signal types for filter
        const types = [...new Set((data.events || []).map((e: SignalEvent) => e.signal_type))].filter(Boolean);
        setSignalTypes(types as string[]);
      }
    } catch {
      // API not built yet
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filterType, filterTier, filterSource]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Add signal manually
  const handleAddSignal = async () => {
    if (!addForm.domain.trim() || !addForm.signal_type.trim() || !addForm.signal_title.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setAddLoading(true);
    try {
      const res = await fetch('/api/signals/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...addForm,
          signal_source: 'manual',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add signal');

      toast.success('Signal added');
      setAddModalOpen(false);
      setAddForm({
        domain: '', signal_type: '', signal_title: '', signal_detail: '',
        tier: 'medium', signal_date: new Date().toISOString().split('T')[0],
      });
      fetchEvents();
    } catch (err) {
      toast.error('Failed to add signal', { description: errorMessage(err) });
    } finally {
      setAddLoading(false);
    }
  };

  // CSV Import
  const handleImport = async () => {
    if (!importFile) return;

    setImportLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);

      const res = await fetch('/api/signals/events/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      toast.success(`Imported ${data.imported || 0} signals`);
      setImportModalOpen(false);
      setImportFile(null);
      fetchEvents();
    } catch (err) {
      toast.error('Import failed', { description: errorMessage(err) });
    } finally {
      setImportLoading(false);
    }
  };

  // Comment sync
  const handleSyncComments = async () => {
    setSyncingComments(true);
    try {
      const res = await fetch('/api/signals/sync-comments', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');

      toast.success(`Synced ${data.new_signals || 0} signals from Comment Intel`);
      fetchEvents();
    } catch (err) {
      toast.error('Comment sync failed', { description: errorMessage(err) });
    } finally {
      setSyncingComments(false);
    }
  };

  // Archive signal
  const handleArchive = async (eventId: number) => {
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, is_active: false } : e));
    try {
      await fetch(`/api/signals/events?id=${eventId}`, { method: 'DELETE' });
    } catch { /* will work when backend is built */ }
  };

  // Group by date for timeline display
  const groupedEvents = events.reduce<Record<string, SignalEvent[]>>((acc, event) => {
    const dateKey = event.signal_date
      ? new Date(event.signal_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'No Date';
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(event);
    return acc;
  }, {});

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-primary/10 flex items-center justify-center">
              <Rss className="w-5 h-5 text-primary" />
            </div>
            Signal Feed
          </h1>
          <p className="text-muted-foreground mt-1">
            All signal events across target accounts — add, import, and track buying signals
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={fetchEvents}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleSyncComments} disabled={syncingComments}>
            {syncingComments ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <MessageSquareText className="w-3.5 h-3.5 mr-1.5" />
            )}
            {syncingComments ? 'Syncing…' : 'Sync from Comments'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportModalOpen(true)}>
            <Upload className="w-3.5 h-3.5 mr-1.5" /> Import CSV
          </Button>
          <Button size="sm" onClick={() => setAddModalOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Signal
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search signals, companies, domains..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm bg-background"
            />
          </div>

          <Select value={filterType} onValueChange={v => setFilterType(v ?? 'all')}>
            <SelectTrigger className="w-[160px] h-9 text-xs">
              <SelectValue placeholder="Signal Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {signalTypes.map(t => (
                <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterTier} onValueChange={v => setFilterTier(v ?? 'all')}>
            <SelectTrigger className="w-[130px] h-9 text-xs">
              <SelectValue placeholder="Tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              <SelectItem value="high">🔥 High</SelectItem>
              <SelectItem value="medium">⚡ Medium</SelectItem>
              <SelectItem value="low">❄️ Low</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterSource} onValueChange={v => setFilterSource(v ?? 'all')}>
            <SelectTrigger className="w-[160px] h-9 text-xs">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="csv_import">CSV Import</SelectItem>
              <SelectItem value="marketing_comments">Marketing Comments</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Signal Feed */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Loading signals…</div>
      ) : events.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/10 to-primary/10 flex items-center justify-center mx-auto mb-5">
            <Rss className="w-8 h-8 text-muted-foreground/40" />
          </div>
          <h3 className="text-lg font-semibold">No signals recorded yet</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Add buying signals manually, import from CSV, or sync from your Comment Intelligence data.
          </p>
          <div className="flex items-center gap-2 justify-center mt-5">
            <Button onClick={() => setAddModalOpen(true)} className="gap-1.5">
              <Plus className="w-4 h-4" /> Add Signal
            </Button>
            <Button variant="outline" onClick={handleSyncComments} disabled={syncingComments}>
              <MessageSquareText className="w-4 h-4 mr-1.5" /> Sync Comments
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedEvents).map(([dateLabel, dateEvents]) => (
            <div key={dateLabel}>
              {/* Date Header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <Calendar className="w-3.5 h-3.5" />
                  {dateLabel}
                </div>
                <div className="flex-1 h-px bg-border" />
                <Badge variant="outline" className="text-[9px]">{dateEvents.length} signal{dateEvents.length !== 1 ? 's' : ''}</Badge>
              </div>

              {/* Signal Cards */}
              <div className="space-y-2 ml-2 pl-4 border-l-2 border-border">
                {dateEvents.map(event => {
                  const tierCfg = TIER_CONFIG[event.tier] || TIER_CONFIG.medium;
                  const TierIcon = tierCfg.icon;
                  const SourceIcon = SOURCE_ICONS[event.signal_source] || Activity;

                  return (
                    <div
                      key={event.id}
                      className={`bg-card border border-border rounded-xl p-4 transition-all hover:border-primary/30 group
                        ${!event.is_active ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Tier icon */}
                        <div className={`w-8 h-8 rounded-lg ${tierCfg.bg} flex items-center justify-center shrink-0`}>
                          <TierIcon className={`w-4 h-4 ${tierCfg.color}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{event.company_name || event.domain}</span>
                            <span className="text-[11px] text-muted-foreground">({event.domain})</span>
                          </div>
                          <div className="text-sm mt-0.5">{event.signal_title}</div>
                          {event.signal_detail && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{event.signal_detail}</p>
                          )}
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge variant="outline" className={`text-[9px] ${tierCfg.bg} ${tierCfg.color} ${tierCfg.border}`}>
                              {tierCfg.label}
                            </Badge>
                            <Badge variant="outline" className="text-[9px] gap-1">
                              {event.signal_type.replace(/_/g, ' ')}
                            </Badge>
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <SourceIcon className="w-2.5 h-2.5" />
                              {event.signal_source.replace(/_/g, ' ')}
                            </span>
                            {event.tags?.length > 0 && event.tags.map(tag => (
                              <Badge key={tag} variant="secondary" className="text-[8px]">{tag}</Badge>
                            ))}
                          </div>
                        </div>

                        {/* Right side: time + actions */}
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {timeAgo(event.signal_date || event.created_at)}
                          </span>
                          {event.is_active && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400"
                              onClick={() => handleArchive(event.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Signal Modal */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="sm:max-w-[500px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" />
              Add Signal
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Company Domain *</Label>
                <Input
                  placeholder="e.g. datadog.com"
                  value={addForm.domain}
                  onChange={e => setAddForm(prev => ({ ...prev, domain: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Signal Type *</Label>
                <Input
                  placeholder="e.g. new_funding, gtm_hire"
                  value={addForm.signal_type}
                  onChange={e => setAddForm(prev => ({ ...prev, signal_type: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Signal Title *</Label>
              <Input
                placeholder="e.g. Series B — $25M raised from Accel"
                value={addForm.signal_title}
                onChange={e => setAddForm(prev => ({ ...prev, signal_title: e.target.value }))}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Detail / URL</Label>
              <Textarea
                placeholder="Additional context, source URL, etc."
                value={addForm.signal_detail}
                onChange={e => setAddForm(prev => ({ ...prev, signal_detail: e.target.value }))}
                rows={2}
                className="text-sm resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tier</Label>
                <Select value={addForm.tier} onValueChange={v => setAddForm(prev => ({ ...prev, tier: v }))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">🔥 High</SelectItem>
                    <SelectItem value="medium">⚡ Medium</SelectItem>
                    <SelectItem value="low">❄️ Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Signal Date</Label>
                <Input
                  type="date"
                  value={addForm.signal_date}
                  onChange={e => setAddForm(prev => ({ ...prev, signal_date: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModalOpen(false)} disabled={addLoading}>Cancel</Button>
            <Button onClick={handleAddSignal} disabled={addLoading}>
              {addLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
              {addLoading ? 'Adding…' : 'Add Signal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Modal */}
      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent className="sm:max-w-[460px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-primary" />
              Import Signals from CSV
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              Upload a CSV with signal events. Expected columns: <code className="px-1 py-0.5 bg-muted rounded text-[10px]">domain</code>, <code className="px-1 py-0.5 bg-muted rounded text-[10px]">signal_type</code>, <code className="px-1 py-0.5 bg-muted rounded text-[10px]">signal_title</code>, and optionally <code className="px-1 py-0.5 bg-muted rounded text-[10px]">signal_detail</code>, <code className="px-1 py-0.5 bg-muted rounded text-[10px]">tier</code>, <code className="px-1 py-0.5 bg-muted rounded text-[10px]">signal_date</code>.
            </p>

            <div
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
                ${importFile ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/30'}`}
              onClick={() => document.getElementById('signal-csv-import')?.click()}
            >
              <Input
                id="signal-csv-import"
                type="file"
                accept=".csv"
                onChange={e => setImportFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              {importFile ? (
                <div className="flex flex-col items-center gap-1">
                  <FileSpreadsheet className="w-6 h-6 text-primary" />
                  <span className="text-sm font-medium">{importFile.name}</span>
                  <span className="text-[10px] text-muted-foreground">{(importFile.size / 1024).toFixed(0)} KB</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <Upload className="w-6 h-6 text-muted-foreground" />
                  <span className="text-sm font-medium">Click to select CSV</span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportModalOpen(false); setImportFile(null); }} disabled={importLoading}>Cancel</Button>
            <Button onClick={handleImport} disabled={!importFile || importLoading}>
              {importLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
              {importLoading ? 'Importing…' : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
