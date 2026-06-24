'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Upload as UploadIcon, Database, CheckCircle, AlertCircle,
  FileSpreadsheet, Globe, Layers, Beaker, ArrowRight, History,
  RefreshCw, RotateCcw, AlertTriangle, Play,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { formatNumber, errorMessage, cn } from '@/lib/utils';
import { detectSourceFromFile, parseCsvPreview, autoMapField } from '@/lib/csv-detect';
import { uploadCsvUnified, resumeUploadSession, type UploadProgress } from '@/lib/upload-client';
import { listPendingSessions, type UploadSession } from '@/lib/upload-session';
import type { CsvSourceType, UploadResult } from '@/lib/types';

const SOURCE_INFO: Record<string, { label: string; icon: React.ReactNode; color: string; desc: string }> = {
  apollo:      { label: 'Apollo Export',          icon: <Globe className="w-4 h-4" />,          color: 'text-blue-600 bg-blue-50',    desc: 'Employee, funding, LinkedIn, country data' },
  reo_db:      { label: 'Reo DB Export',           icon: <Database className="w-4 h-4" />,       color: 'text-purple-600 bg-purple-50', desc: 'Internal employee count data' },
  crunchbase:  { label: 'Crunchbase Export',       icon: <Layers className="w-4 h-4" />,         color: 'text-emerald-600 bg-emerald-50', desc: 'Funding and revenue data' },
  icp_output:  { label: 'ICP Classifier Output',  icon: <Beaker className="w-4 h-4" />,         color: 'text-amber-600 bg-amber-50',  desc: 'Pre-classified ICP data' },
  raw_domains: { label: 'Raw Domain List',         icon: <FileSpreadsheet className="w-4 h-4" />, color: 'text-slate-600 bg-slate-50',  desc: 'Just domains for classification' },
  unknown:     { label: 'Auto-detect',             icon: <FileSpreadsheet className="w-4 h-4" />, color: 'text-muted-foreground bg-muted', desc: 'Will detect from column headers' },
};

interface LogRow {
  id: number;
  source_type: string;
  source_file: string | null;
  funnel_name: string | null;
  funnel_id: number | null;
  status: string;
  total_rows: number;
  new_companies: number;
  matched_companies: number;
  chunks_total: number;
  chunks_done: number;
  total_file_rows: number;
  created_at: string;
  duplicates_skipped: number;
}

type UploadStatus = 'complete' | 'partial' | 'failed' | 'rolled_back';

function getUploadStatus(log: LogRow): UploadStatus {
  if (log.status === 'rolled_back') return 'rolled_back';
  if (log.chunks_total > 0) {
    if (log.chunks_done >= log.chunks_total) return 'complete';
    if (log.chunks_done > 0) return 'partial';
    return 'failed';
  }
  // Legacy rows (before chunks tracking) — treat as complete if they have rows
  return log.total_rows > 0 ? 'complete' : 'failed';
}

function StatusBadge({ log }: { log: LogRow }) {
  const status = getUploadStatus(log);

  if (status === 'complete') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 whitespace-nowrap">
        <CheckCircle className="w-3 h-3" /> Complete
      </span>
    );
  }
  if (status === 'partial') {
    return (
      <div className="space-y-1 min-w-[110px]">
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 whitespace-nowrap">
          <AlertTriangle className="w-3 h-3" /> Partial
        </span>
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full transition-all"
              style={{ width: `${Math.round((log.chunks_done / log.chunks_total) * 100)}%` }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground tabular-nums whitespace-nowrap">
            {log.chunks_done}/{log.chunks_total}
          </span>
        </div>
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-600 whitespace-nowrap">
        <AlertCircle className="w-3 h-3" /> Failed
      </span>
    );
  }
  // rolled_back
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-500/10 text-slate-500 whitespace-nowrap">
      <RotateCcw className="w-3 h-3" /> Rolled Back
    </span>
  );
}

export default function UploadPage() {
  const router = useRouter();

  // ── New funnel upload state ─────────────────────────────────────────────────
  const [funnelName, setFunnelName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [detected, setDetected] = useState<CsvSourceType | null>(null);
  const [sourceOverride, setSourceOverride] = useState<CsvSourceType | 'auto'>('auto');
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [masterLoading, setMasterLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  // ── Upload history state ────────────────────────────────────────────────────
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [fetchingLogs, setFetchingLogs] = useState(true);

  // ── Resume modal state ──────────────────────────────────────────────────────
  const [resumeSession, setResumeSession] = useState<UploadSession | null>(null);
  const [resumeLog, setResumeLog] = useState<LogRow | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeProgress, setResumeProgress] = useState<UploadProgress | null>(null);
  const [resumingRowId, setResumingRowId] = useState<number | null>(null);
  const resumeFileRef = useRef<HTMLInputElement>(null);

  // ── Pending sessions from localStorage ────────────────────────────────────
  const [pendingSessions, setPendingSessions] = useState<UploadSession[]>([]);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/upload/logs');
      const data = await res.json();
      if (res.ok) setLogs(data.logs || []);
    } catch (e) {
      console.error('Failed to fetch logs', e);
    } finally {
      setFetchingLogs(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // Load any pending localStorage sessions
    setPendingSessions(listPendingSessions());
  }, []);

  const handleFileSelect = async (f: File | null) => {
    setFile(f);
    setResult(null);
    setDetected(null);
    setSourceOverride('auto');
    if (f) {
      try { setDetected(await detectSourceFromFile(f)); }
      catch { setDetected('unknown'); }
    }
  };

  const effectiveSource: CsvSourceType =
    sourceOverride !== 'auto' ? sourceOverride : (detected ?? 'unknown');

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !funnelName) return;

    setLoading(true);
    setResult(null);
    setProgress(null);

    try {
      const { headers } = await parseCsvPreview(file);
      const columnMapping: Record<string, string> = {};
      let domainHeader = '';
      let websiteHeader: string | undefined;

      for (const h of headers) {
        const field = autoMapField(h);
        if (field) {
          columnMapping[h] = field;
          if (field === 'domain' && !domainHeader) domainHeader = h;
          if (field === 'website' && !websiteHeader) websiteHeader = h;
        }
      }

      if (!domainHeader && websiteHeader) {
        domainHeader = websiteHeader;
        columnMapping[websiteHeader] = 'domain';
        websiteHeader = undefined;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('funnel_name', funnelName);
      formData.append('type', 'companies');
      if (effectiveSource !== 'unknown') formData.append('source_type', effectiveSource);

      const data = await uploadCsvUnified({
        file,
        formData,
        sourceType:    effectiveSource,
        columnMapping,
        domainHeader,
        websiteHeader,
        funnelId:      0,
        funnelName,
        onProgress:    setProgress,
      });

      setResult(data);
      toast.success('Funnel created successfully!');
      fetchLogs();
      // Refresh pending sessions (completed session should have been cleared)
      setPendingSessions(listPendingSessions());
    } catch (error) {
      toast.error('Upload failed', { description: errorMessage(error) });
      // Refresh pending sessions — a new one may have been created
      setPendingSessions(listPendingSessions());
    } finally {
      setLoading(false);
    }
  };

  const handleMasterUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterFile) return;
    setMasterLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', masterFile);
      formData.append('type', 'master_icp');
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      toast.success(`Imported ${data.imported} domains to Master ICP list`);
      setMasterFile(null);
    } catch (error) {
      toast.error('Upload failed', { description: errorMessage(error) });
    } finally {
      setMasterLoading(false);
    }
  };

  // ── Resume logic ────────────────────────────────────────────────────────────

  const openResumeModal = (log: LogRow) => {
    // Find the localStorage session for this batch
    const sessions = listPendingSessions();
    const session = sessions.find(s => s.batchId === log.id) ?? null;
    setResumeSession(session);
    setResumeLog(log);
    setResumeFile(null);
    setResumeProgress(null);
  };

  const handleResumeFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setResumeFile(e.target.files?.[0] ?? null);
  };

  const handleResume = async () => {
    if (!resumeLog || !resumeFile) return;

    setResumeLoading(true);
    setResumeProgress(null);
    setResumingRowId(resumeLog.id);

    try {
      // If we have a localStorage session, use it; otherwise build a minimal one
      // and let the server reconstruct the rest.
      let session = resumeSession;
      if (!session) {
        // Build a minimal session from the log row — server will fill in seenDomains
        session = {
          batchId:       resumeLog.id,
          funnelId:      resumeLog.funnel_id ?? 0,
          funnelName:    resumeLog.funnel_name ?? '',
          fileName:      resumeLog.source_file ?? resumeFile.name,
          fileSize:      resumeFile.size,
          sourceType:    resumeLog.source_type as CsvSourceType,
          columnMapping: {},
          domainHeader:  '',
          totalRows:     resumeLog.total_file_rows,
          chunksTotal:   resumeLog.chunks_total,
          chunksDone:    resumeLog.chunks_done,
          prevTotals:    {},
          startedAt:     resumeLog.created_at,
          updatedAt:     new Date().toISOString(),
        };
      }

      const data = await resumeUploadSession(session, resumeFile, (p) => {
        setResumeProgress(p);
      });

      toast.success(`Upload resumed and completed! ${formatNumber(data.new_companies ?? 0)} new, ${formatNumber(data.matched_companies ?? 0)} matched.`);
      setResumeSession(null);
      setResumeLog(null);
      fetchLogs();
      setPendingSessions(listPendingSessions());
    } catch (error) {
      toast.error('Resume failed', { description: errorMessage(error) });
    } finally {
      setResumeLoading(false);
      setResumingRowId(null);
    }
  };

  const detectedSource = result?.source_type ? SOURCE_INFO[result.source_type] : null;

  // Merge pending localStorage sessions that aren't yet in DB logs into the top of the list
  const localOnlyPending = pendingSessions.filter(s => !logs.some(l => l.id === s.batchId));

  return (
    <div className="p-8 space-y-8 max-w-6xl mx-auto w-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upload Data</h1>
        <p className="text-muted-foreground mt-1">Import companies from Apollo, Reo DB, Crunchbase, or raw domain lists.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* New Funnel Upload */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UploadIcon className="w-5 h-5 text-primary" />
              Import Companies
            </CardTitle>
            <CardDescription>Upload any CSV — the system auto-detects the source type.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="funnelName">Funnel Name</Label>
                <Input
                  id="funnelName"
                  placeholder="e.g. Q3 DevOps Campaign"
                  value={funnelName}
                  onChange={e => setFunnelName(e.target.value)}
                  className="bg-background border-border"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>CSV File</Label>
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:bg-muted/30 transition-colors">
                  <Input
                    type="file" accept=".csv,.xlsx"
                    onChange={e => handleFileSelect(e.target.files?.[0] || null)}
                    className="hidden" id="csv-upload"
                  />
                  <Label htmlFor="csv-upload" className="cursor-pointer flex flex-col items-center gap-2">
                    <UploadIcon className="w-8 h-8 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {file ? file.name : 'Click to browse or drag and drop'}
                    </span>
                    <span className="text-xs text-muted-foreground">Apollo, Reo DB, Crunchbase, or raw domains CSV</span>
                  </Label>
                </div>
              </div>

              {file && detected && (
                <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Detected source:</span>
                      <Badge variant="outline" className={`${SOURCE_INFO[detected]?.color}`}>
                        {SOURCE_INFO[detected]?.icon}
                        <span className="ml-1">{SOURCE_INFO[detected]?.label}</span>
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Import as</Label>
                    <Select value={sourceOverride} onValueChange={v => setSourceOverride(v as CsvSourceType | 'auto')}>
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto-detect ({SOURCE_INFO[detected]?.label})</SelectItem>
                        <SelectItem value="apollo">Apollo Export</SelectItem>
                        <SelectItem value="reo_db">Reo DB Export</SelectItem>
                        <SelectItem value="crunchbase">Crunchbase Export</SelectItem>
                        <SelectItem value="icp_output">ICP Classifier Output</SelectItem>
                        <SelectItem value="raw_domains">Raw Domain List</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">{SOURCE_INFO[effectiveSource]?.desc}</p>
                </div>
              )}

              {loading && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {progress?.phase === 'resuming'   ? `Resuming from ${progress.resumeFromPct}%…`
                       : progress?.finalizing           ? 'Finalizing…'
                       : progress                       ? 'Importing rows…'
                       :                                  'Reading & parsing file…'}
                    </span>
                    <span className="tabular-nums">
                      {progress && progress.total > 0
                        ? `${progress.pct}% · ${formatNumber(progress.processed)}/${formatNumber(progress.total)}`
                        : ''}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full bg-primary transition-all duration-300 ${progress ? '' : 'animate-pulse'}`}
                      style={{ width: `${progress ? Math.max(progress.pct, 3) : 8}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">
                    Safe to keep this tab open — upload auto-resumes if interrupted.
                  </p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={!file || !funnelName || loading}
              >
                {loading ? 'Uploading & Processing...' : 'Confirm & Create Funnel'}
              </Button>
            </form>

            {result && (
              <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium text-emerald-600">
                    <CheckCircle className="w-4 h-4" />
                    Upload Complete
                  </div>
                  {detectedSource && (
                    <Badge variant="outline" className={`text-xs ${detectedSource.color}`}>
                      {detectedSource.icon}
                      <span className="ml-1">{detectedSource.label}</span>
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                  <div className="text-muted-foreground">Rows Processed:</div>
                  <div className="font-medium text-right">{formatNumber(result.total_rows)}</div>

                  <div className="text-muted-foreground">New Companies:</div>
                  <div className="font-medium text-right text-emerald-600">{formatNumber(result.new_companies)}</div>

                  <div className="text-muted-foreground">Matched/Updated:</div>
                  <div className="font-medium text-right text-blue-600">{formatNumber(result.matched_companies)}</div>

                  <div className="text-muted-foreground">Duplicates Skipped:</div>
                  <div className="font-medium text-right">{formatNumber(result.duplicates_skipped)}</div>
                </div>

                {Object.keys(result.fields_updated || {}).length > 0 && (
                  <div className="pt-3 border-t border-border">
                    <div className="text-xs font-medium text-muted-foreground mb-2">Fields Updated:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(result.fields_updated).map(([field, count]) => (
                        <Badge key={field} variant="secondary" className="text-[10px]">
                          {field}: {formatNumber(count as number)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {result.errors?.length > 0 && (
                  <div className="pt-3 border-t border-border">
                    <div className="text-amber-600 flex items-center gap-1 text-xs mb-1">
                      <AlertCircle className="w-3 h-3" />
                      {result.errors.length} warnings
                    </div>
                    <div className="text-[10px] text-muted-foreground">{result.errors[0]}</div>
                  </div>
                )}

                {result.funnel_id && (
                  <Button
                    className="w-full mt-2" variant="outline"
                    onClick={() => router.push(`/funnels/${result.funnel_id}`)}
                  >
                    Open Funnel <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Master List Upload */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-600" />
              Update Master ICP List
            </CardTitle>
            <CardDescription>Upload domains of existing ICPs for NetNew calculation.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleMasterUpload} className="space-y-5">
              <div className="space-y-2">
                <Label>Master List CSV (Column A = Domain)</Label>
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:bg-muted/30 transition-colors">
                  <Input
                    type="file" accept=".csv"
                    onChange={e => setMasterFile(e.target.files?.[0] || null)}
                    className="hidden" id="master-upload"
                  />
                  <Label htmlFor="master-upload" className="cursor-pointer flex flex-col items-center gap-2">
                    <Database className="w-8 h-8 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {masterFile ? masterFile.name : 'Click to browse or drag and drop'}
                    </span>
                    <span className="text-xs text-muted-foreground">CSV with domain column</span>
                  </Label>
                </div>
              </div>

              <Button
                type="submit" variant="outline"
                className="w-full border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10"
                disabled={!masterFile || masterLoading}
              >
                {masterLoading ? 'Importing...' : 'Update Master List'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Upload History */}
      <div className="mt-12">
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <History className="w-5 h-5 text-primary" />
                  Upload History
                </CardTitle>
                <CardDescription className="mt-1">
                  Full audit trail of all uploads. Partial uploads can be resumed.
                </CardDescription>
              </div>
              <Button
                variant="outline" size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => { setFetchingLogs(true); fetchLogs(); }}
                disabled={fetchingLogs}
              >
                <RefreshCw className={cn('w-3 h-3', fetchingLogs && 'animate-spin')} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {fetchingLogs ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Loading history...</div>
            ) : (logs.length === 0 && localOnlyPending.length === 0) ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No uploads yet.</div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/30 text-xs uppercase text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-4 py-3 font-medium whitespace-nowrap">Date</th>
                      <th className="px-4 py-3 font-medium">Source / File</th>
                      <th className="px-4 py-3 font-medium">Funnel</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium text-right">Rows</th>
                      <th className="px-4 py-3 font-medium text-right text-emerald-600">New</th>
                      <th className="px-4 py-3 font-medium text-right text-blue-600">Matched</th>
                      <th className="px-4 py-3 font-medium text-right text-amber-600">Dups</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {/* Local-only pending sessions (very early failures not in DB yet) */}
                    {localOnlyPending.map(session => (
                      <tr key={`local-${session.batchId}`} className="hover:bg-muted/10 transition-colors bg-amber-500/5">
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(session.startedAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={cn('text-[9px] shrink-0', SOURCE_INFO[session.sourceType]?.color)}>
                              {SOURCE_INFO[session.sourceType]?.label}
                            </Badge>
                            <span className="truncate max-w-[200px] text-xs font-medium" title={session.fileName}>
                              {session.fileName}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs font-medium truncate max-w-[150px]">
                          {session.funnelName || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
                            <AlertTriangle className="w-3 h-3" /> Pending
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">—</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">—</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">—</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">—</td>
                        <td className="px-4 py-3">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] gap-1 border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                            onClick={() => {
                              setResumeSession(session);
                              setResumeLog(null);
                              setResumeFile(null);
                            }}
                          >
                            <Play className="w-3 h-3" /> Resume
                          </Button>
                        </td>
                      </tr>
                    ))}

                    {logs.map(log => {
                      const sInfo = log.source_type ? SOURCE_INFO[log.source_type] : null;
                      const status = getUploadStatus(log);
                      const isResumable = status === 'partial' || status === 'failed';
                      const isResumingThis = resumingRowId === log.id;

                      return (
                        <tr key={log.id} className={cn(
                          'hover:bg-muted/10 transition-colors',
                          isResumingThis && 'bg-amber-500/5',
                        )}>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {sInfo && (
                                <Badge variant="outline" className={cn('text-[9px] shrink-0', sInfo.color)}>
                                  {sInfo.label}
                                </Badge>
                              )}
                              <span className="truncate max-w-[200px] text-xs font-medium" title={log.source_file ?? undefined}>
                                {log.source_file || 'Manual Upload'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs font-medium truncate max-w-[150px]">
                            {log.funnel_name ? (
                              log.funnel_id ? (
                                <button
                                  className="hover:underline text-primary"
                                  onClick={() => router.push(`/funnels/${log.funnel_id}`)}
                                >
                                  {log.funnel_name}
                                </button>
                              ) : log.funnel_name
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            {isResumingThis && resumeProgress ? (
                              <div className="space-y-1 min-w-[110px]">
                                <span className="text-[10px] text-amber-600 font-semibold">Resuming…</span>
                                <div className="flex items-center gap-1.5">
                                  <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-amber-400 rounded-full transition-all"
                                      style={{ width: `${resumeProgress.pct}%` }}
                                    />
                                  </div>
                                  <span className="text-[9px] text-muted-foreground tabular-nums">{resumeProgress.pct}%</span>
                                </div>
                              </div>
                            ) : (
                              <StatusBadge log={log} />
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {formatNumber(log.total_file_rows || log.total_rows || 0)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-emerald-600 font-medium">
                            {formatNumber(log.new_companies || 0)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-blue-600 font-medium">
                            {formatNumber(log.matched_companies || 0)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-amber-600">
                            {formatNumber(log.duplicates_skipped || 0)}
                          </td>
                          <td className="px-4 py-3">
                            {isResumable && !isResumingThis && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] gap-1 border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                                onClick={() => openResumeModal(log)}
                              >
                                <Play className="w-3 h-3" /> Resume
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Resume Modal */}
      <Dialog
        open={!!(resumeSession || resumeLog)}
        onOpenChange={(open) => {
          if (!open && !resumeLoading) {
            setResumeSession(null);
            setResumeLog(null);
            setResumeFile(null);
            setResumeProgress(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[460px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="w-4 h-4 text-amber-500" />
              Resume Upload
            </DialogTitle>
            <DialogDescription>
              This upload was interrupted. Re-select the same CSV file to continue from where it stopped — no data will be duplicated.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Expected file info */}
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Expected file:</span>
                <span className="font-medium font-mono truncate max-w-[220px]" title={resumeSession?.fileName ?? resumeLog?.source_file ?? undefined}>
                  {resumeSession?.fileName ?? resumeLog?.source_file ?? 'Unknown'}
                </span>
              </div>
              {resumeSession && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">File size:</span>
                  <span className="font-medium">{(resumeSession.fileSize / 1024).toFixed(0)} KB</span>
                </div>
              )}
              {resumeLog && resumeLog.chunks_total > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Progress:</span>
                  <span className="font-medium text-amber-600">
                    {resumeLog.chunks_done} / {resumeLog.chunks_total} chunks ({Math.round((resumeLog.chunks_done / resumeLog.chunks_total) * 100)}%)
                  </span>
                </div>
              )}
              {resumeLog?.funnel_name && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Funnel:</span>
                  <span className="font-medium">{resumeLog.funnel_name}</span>
                </div>
              )}
            </div>

            {/* File picker */}
            <div className="space-y-2">
              <Label>Re-select the CSV file</Label>
              <div
                className={cn(
                  'border-2 border-dashed rounded-xl p-5 text-center transition-colors cursor-pointer',
                  resumeFile ? 'border-amber-500/50 bg-amber-500/5' : 'border-border hover:bg-muted/30',
                )}
                onClick={() => resumeFileRef.current?.click()}
              >
                <Input
                  ref={resumeFileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleResumeFileSelect}
                />
                <UploadIcon className={cn('w-6 h-6 mx-auto mb-1.5', resumeFile ? 'text-amber-500' : 'text-muted-foreground')} />
                <p className="text-xs font-medium">
                  {resumeFile ? resumeFile.name : 'Click to select the original CSV'}
                </p>
                {resumeFile && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {(resumeFile.size / 1024).toFixed(0)} KB
                  </p>
                )}
              </div>
            </div>

            {/* Progress bar during resume */}
            {resumeLoading && resumeProgress && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {resumeProgress.phase === 'resuming'
                      ? `Resuming from ${resumeProgress.resumeFromPct}%…`
                      : resumeProgress.finalizing ? 'Finalizing…' : 'Uploading…'}
                  </span>
                  <span className="tabular-nums">{resumeProgress.pct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all duration-300"
                    style={{ width: `${Math.max(resumeProgress.pct, 3)}%` }}
                  />
                </div>
              </div>
            )}

            <Button
              className="w-full gap-2"
              onClick={handleResume}
              disabled={!resumeFile || resumeLoading}
            >
              {resumeLoading ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Resuming…</>
              ) : (
                <><Play className="w-4 h-4" /> Continue Upload</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
