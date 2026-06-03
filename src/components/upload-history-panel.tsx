'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Undo2, FileSpreadsheet, ShieldCheck, History } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber, errorMessage } from '@/lib/utils';
import { SOURCE_LABEL } from '@/lib/source-policy';
import type { UploadBatch, CsvSourceType } from '@/lib/types';

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

export function UploadHistoryPanel({ funnelId, onRollback }: UploadHistoryPanelProps) {
  const [batches, setBatches] = useState<UploadBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [rollingBack, setRollingBack] = useState<number | null>(null);

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
        );
      })}
    </div>
  );
}
