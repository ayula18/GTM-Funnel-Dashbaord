'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Undo2, FileSpreadsheet, ShieldCheck, History, Search, ChevronDown, ChevronUp, Activity, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber, errorMessage } from '@/lib/utils';
import { SOURCE_LABEL } from '@/lib/source-policy';
import type { UploadBatch, CsvSourceType } from '@/lib/types';
import { cn } from '@/lib/utils';

interface UploadHistoryPanelProps {
  funnelId: number;
  onRollback: () => void;
}

const SOURCE_COLOR: Record<string, string> = {
  apollo: 'text-blue-600 bg-blue-500/10',
  reo_db: 'text-purple-600 bg-purple-500/10',
  crunchbase: 'text-emerald-600 bg-emerald-500/10',
  icp_output: 'text-amber-600 bg-amber-500/10',
  raw_domains: 'text-slate-600 bg-slate-500/10',
  unknown: 'text-muted-foreground bg-muted',
};

const METHOD_LABEL: Record<string, { label: string; color: string }> = {
  exact_domain:    { label: 'Exact Domain',     color: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/30' },
  alias_lookup:    { label: 'Alias Lookup',     color: 'text-blue-600 bg-blue-500/10 border-blue-500/30' },
  new_insert:      { label: 'New Insert',       color: 'text-slate-500 bg-slate-500/10 border-slate-500/30' },
  merge_candidate: { label: 'Merge Candidate',  color: 'text-amber-600 bg-amber-500/10 border-amber-500/30' },
};

interface MatchDecision {
  id: number;
  input_domain: string;
  matched_domain: string | null;
  company_id: number;
  match_method: string;
  match_detail: string | null;
  confidence: string;
  created_at: string;
  company_name: string | null;
}

interface MatchSummary {
  method: string;
  count: number;
}

function MatchLogSection({ batchId }: { batchId: number }) {
  const [decisions, setDecisions] = useState<MatchDecision[]>([]);
  const [summary, setSummary] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [methodFilter, setMethodFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [decRes, sumRes] = await Promise.all([
        fetch(`/api/uploads/match-log?batch_id=${batchId}&method=${methodFilter}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
        fetch(`/api/uploads/match-log?batch_id=${batchId}&view=summary`),
      ]);
      const decData = await decRes.json();
      const sumData = await sumRes.json();
      setDecisions(decData.decisions || []);
      setSummary(sumData.summary || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [batchId, methodFilter, search]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="p-4 text-center text-xs text-muted-foreground">Loading match log…</div>;
  }

  const total = summary.reduce((s, m) => s + Number(m.count), 0);
  const nonTrivial = summary.filter(s => s.method !== 'exact_domain' && s.method !== 'new_insert');

  return (
    <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
      {/* Summary pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Match Log</span>
        <button
          onClick={() => setMethodFilter('all')}
          className={cn("px-2 py-0.5 rounded text-[10px] transition-colors",
            methodFilter === 'all' ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
          )}
        >
          All ({total})
        </button>
        {summary.map(s => {
          const info = METHOD_LABEL[s.method] || { label: s.method, color: 'text-muted-foreground bg-muted border-border' };
          return (
            <button
              key={s.method}
              onClick={() => setMethodFilter(s.method === methodFilter ? 'all' : s.method)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] border transition-colors",
                s.method === methodFilter ? info.color + ' font-medium' : "text-muted-foreground border-transparent hover:text-foreground"
              )}
            >
              {info.label} ({Number(s.count)})
            </button>
          );
        })}
      </div>

      {/* Warning for non-trivial matches */}
      {nonTrivial.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 text-[10px] text-amber-700 flex items-center gap-2">
          <Activity className="w-3 h-3 shrink-0" />
          <span>
            <strong>{nonTrivial.reduce((s, m) => s + Number(m.count), 0)}</strong> non-trivial matches detected
            ({nonTrivial.map(m => `${Number(m.count)} ${METHOD_LABEL[m.method]?.label || m.method}`).join(', ')}).
            Review these to ensure correct matching.
          </span>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search domains..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-muted/30 border border-border rounded-md text-[10px] pl-7 pr-3 py-1.5 w-56 outline-none focus:border-primary/50"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden max-h-[320px] overflow-y-auto">
        <table className="w-full text-[10px]">
          <thead className="bg-muted/30 sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase">Input Domain</th>
              <th className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase">Matched To</th>
              <th className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase">Company</th>
              <th className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase">Method</th>
              <th className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase">Detail</th>
            </tr>
          </thead>
          <tbody>
            {decisions.map(d => {
              const info = METHOD_LABEL[d.match_method] || { label: d.match_method, color: 'text-muted-foreground bg-muted border-border' };
              const isNonTrivial = d.match_method !== 'exact_domain' && d.match_method !== 'new_insert';
              return (
                <tr key={d.id} className={cn(
                  "border-b border-border/30 hover:bg-muted/10 transition-colors",
                  isNonTrivial && "bg-amber-500/[0.02]"
                )}>
                  <td className="px-3 py-2 font-mono">{d.input_domain}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">
                    {d.matched_domain || <span className="italic text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {d.company_name || <span className="italic text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={cn("text-[9px]", info.color)}>
                      {info.label}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">
                    {d.match_detail || '—'}
                  </td>
                </tr>
              );
            })}
            {decisions.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                {methodFilter !== 'all' ? 'No matches with this method.' : 'No match log available for this upload.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function UploadHistoryPanel({ funnelId, onRollback }: UploadHistoryPanelProps) {
  const [batches, setBatches] = useState<UploadBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [rollingBack, setRollingBack] = useState<number | null>(null);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/uploads?funnel_id=${funnelId}`)
      .then(res => res.json())
      .then(data => setBatches(data.batches || []))
      .catch(() => setBatches([]))
      .finally(() => setLoading(false));
  }, [funnelId]);

  // Fetch without a synchronous setState in the effect body (state is only set
  // inside async callbacks).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/uploads?funnel_id=${funnelId}`)
      .then(res => res.json())
      .then(data => { if (!cancelled) setBatches(data.batches || []); })
      .catch(() => { if (!cancelled) setBatches([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [funnelId]);

  const handleRollback = async (batch: UploadBatch) => {
    const label = batch.source_file || SOURCE_LABEL[batch.source_type];
    if (!window.confirm(`Roll back this upload (${label})?\n\nCompanies created by it will be deleted, and fields it changed will be reverted to their previous values (unless a later upload has since changed them).`)) {
      return;
    }
    setRollingBack(batch.id);
    try {
      const res = await fetch(`/api/uploads/${batch.id}/rollback`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rollback failed');
      toast.success('Upload rolled back', {
        description: `${formatNumber(data.deleted_companies)} companies removed · ${formatNumber(data.reverted_fields)} fields reverted${data.kept_fields ? ` · ${formatNumber(data.kept_fields)} kept (changed by a later upload)` : ''}`,
      });
      load();
      onRollback();
    } catch (error) {
      toast.error('Rollback failed', { description: errorMessage(error) });
    } finally {
      setRollingBack(null);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading upload history…</div>;
  }

  if (batches.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
        <History className="w-6 h-6 mx-auto mb-2 opacity-50" />
        No uploads yet. Imported CSVs will appear here and can be rolled back.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {batches.map(batch => {
        const fields = batch.fields_updated ? Object.entries(batch.fields_updated) : [];
        const skipped = batch.skipped_fields ? Object.entries(batch.skipped_fields) : [];
        const isRolledBack = batch.status === 'rolled_back';
        const isLogExpanded = expandedLog === batch.id;
        return (
          <div
            key={batch.id}
            className={`rounded-lg border border-border p-4 ${isRolledBack ? 'opacity-60 bg-muted/20' : 'bg-card'}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`text-xs ${SOURCE_COLOR[batch.source_type] || ''}`}>
                    {SOURCE_LABEL[batch.source_type as CsvSourceType] || batch.source_type}
                  </Badge>
                  {batch.is_manual_mapping === 1 && (
                    <Badge variant="outline" className="text-[10px]">manual mapping</Badge>
                  )}
                  {isRolledBack && (
                    <Badge variant="outline" className="text-[10px] text-destructive border-destructive/40">rolled back</Badge>
                  )}
                  <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                    <FileSpreadsheet className="w-3 h-3 shrink-0" />
                    <span className="truncate">{batch.source_file || '—'}</span>
                  </span>
                </div>

                <div className="text-xs text-muted-foreground">
                  {new Date(batch.created_at).toLocaleString()} ·{' '}
                  {formatNumber(batch.total_rows)} rows ·{' '}
                  <span className="text-emerald-600">{formatNumber(batch.new_companies)} new</span> ·{' '}
                  <span className="text-blue-600">{formatNumber(batch.matched_companies)} updated</span>
                </div>

                {fields.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {fields.map(([f, c]) => (
                      <Badge key={f} variant="secondary" className="text-[10px]">{f}: {formatNumber(c as number)}</Badge>
                    ))}
                  </div>
                )}

                {skipped.length > 0 && (
                  <div className="flex flex-wrap gap-1 items-center pt-0.5">
                    <ShieldCheck className="w-3 h-3 text-amber-600" />
                    {skipped.map(([f, c]) => (
                      <Badge key={f} variant="outline" className="text-[10px] text-amber-700 border-amber-300">{f}: {formatNumber(c as number)}</Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[10px] h-7"
                  onClick={() => setExpandedLog(isLogExpanded ? null : batch.id)}
                >
                  <Activity className="w-3 h-3 mr-1" />
                  {isLogExpanded ? 'Hide' : 'Match Log'}
                  {isLogExpanded ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                </Button>
                {!isRolledBack && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/40 hover:bg-destructive/10 shrink-0"
                    disabled={rollingBack === batch.id}
                    onClick={() => handleRollback(batch)}
                  >
                    <Undo2 className="w-3.5 h-3.5 mr-1.5" />
                    {rollingBack === batch.id ? 'Rolling back…' : 'Undo'}
                  </Button>
                )}
              </div>
            </div>

            {/* Expandable Match Log */}
            {isLogExpanded && <MatchLogSection batchId={batch.id} />}
          </div>
        );
      })}
    </div>
  );
}
