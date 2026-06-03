'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload as UploadIcon, CheckCircle, AlertCircle, FileSpreadsheet, Globe, Layers, Beaker, Database, ChevronDown, ChevronRight, ShieldCheck, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber, errorMessage } from '@/lib/utils';
import { detectSourceFromFile, parseCsvPreview, autoMapField } from '@/lib/csv-detect';
import { MAPPABLE_FIELDS, SOURCE_LABEL } from '@/lib/source-policy';
import { uploadCsv, type UploadProgress } from '@/lib/upload-client';
import type { CsvSourceType, UploadResult } from '@/lib/types';

const SOURCE_INFO: Record<string, { label: string; icon: React.ReactNode; color: string; desc: string }> = {
  apollo: { label: 'Apollo Export', icon: <Globe className="w-4 h-4" />, color: 'text-blue-600 bg-blue-50', desc: 'Employee, funding, LinkedIn, country data' },
  reo_db: { label: 'Reo DB Export', icon: <Database className="w-4 h-4" />, color: 'text-purple-600 bg-purple-50', desc: 'Internal employee count data' },
  crunchbase: { label: 'Crunchbase Export', icon: <Layers className="w-4 h-4" />, color: 'text-emerald-600 bg-emerald-50', desc: 'Funding and revenue data' },
  icp_output: { label: 'ICP Classifier Output', icon: <Beaker className="w-4 h-4" />, color: 'text-amber-600 bg-amber-50', desc: 'Pre-classified ICP data' },
  raw_domains: { label: 'Raw Domain List', icon: <FileSpreadsheet className="w-4 h-4" />, color: 'text-slate-600 bg-slate-50', desc: 'Just domains for classification' },
  unknown: { label: 'Auto-detect', icon: <FileSpreadsheet className="w-4 h-4" />, color: 'text-muted-foreground bg-muted', desc: 'Will detect from column headers' },
};

const SKIP = '_skip';

interface UploadToFunnelDialogProps {
  funnelId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function UploadToFunnelDialog({ funnelId, open, onOpenChange, onSuccess }: UploadToFunnelDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [detected, setDetected] = useState<CsvSourceType | null>(null);
  const [sourceOverride, setSourceOverride] = useState<CsvSourceType | 'auto'>('auto');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  // Column mapping
  const [headers, setHeaders] = useState<string[]>([]);
  const [sample, setSample] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [matchColumn, setMatchColumn] = useState<string>('');  // CSV column used as the domain key
  const [mappingEdited, setMappingEdited] = useState(false);
  const [showMapping, setShowMapping] = useState(false);

  const resetAll = () => {
    setFile(null);
    setResult(null);
    setProgress(null);
    setDetected(null);
    setSourceOverride('auto');
    setHeaders([]);
    setSample([]);
    setMapping({});
    setMatchColumn('');
    setMappingEdited(false);
    setShowMapping(false);
  };

  const handleFileSelect = async (f: File | null) => {
    resetAll();
    setFile(f);
    if (!f) return;
    try {
      setDetected(await detectSourceFromFile(f));
    } catch {
      setDetected('unknown');
    }
    try {
      const { headers: hs, sample: sm } = await parseCsvPreview(f);
      setHeaders(hs);
      setSample(sm);
      const initial: Record<string, string> = {};
      for (const h of hs) initial[h] = autoMapField(h) ?? SKIP;
      setMapping(initial);
      // Default the matching column to the auto-detected domain/website column.
      const domainHeader =
        hs.find(h => autoMapField(h) === 'domain') ??
        hs.find(h => /domain|website|url/i.test(h)) ??
        '';
      setMatchColumn(domainHeader);
    } catch { /* preview is best-effort */ }
  };

  const setFieldFor = (header: string, field: string) => {
    setMapping(prev => ({ ...prev, [header]: field }));
    setMappingEdited(true);
  };

  const setMatch = (header: string) => {
    setMatchColumn(header);
    setMappingEdited(true);
  };

  const effectiveSource: CsvSourceType =
    sourceOverride !== 'auto' ? sourceOverride : (detected ?? 'unknown');

  // The fields this source is allowed to write — the ONLY options offered in the
  // mapping editor, so a manual mapping can never clobber a column another source
  // owns. (Domain is excluded; it's chosen separately as the matching column.)
  const availableFields = MAPPABLE_FIELDS.filter(
    f => f.value !== 'domain' && (f.owner === null || f.owner === effectiveSource),
  );

  // Headers eligible for import mapping (everything except the matching column).
  const importHeaders = headers.filter(h => h !== matchColumn);
  const mappedCount = importHeaders.filter(h => mapping[h] && mapping[h] !== SKIP).length;

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    if (headers.length > 0 && !matchColumn) {
      toast.error('Pick a matching column (the column that holds the domain).');
      return;
    }

    setLoading(true);
    setResult(null);
    setProgress(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('funnel_id', funnelId.toString());
      formData.append('type', 'companies');
      if (effectiveSource !== 'unknown') formData.append('source_type', effectiveSource);

      // Send a manual mapping when the user touched anything. The matching column
      // is the domain key; every other column uses its chosen field (or skip).
      if (mappingEdited && headers.length > 0) {
        const send: Record<string, string> = {};
        for (const h of headers) {
          if (h === matchColumn) { send[h] = 'domain'; continue; }
          const f = mapping[h] ?? SKIP;
          send[h] = f === 'domain' ? SKIP : f;   // only the match column is the domain key
        }
        formData.append('column_mapping', JSON.stringify(send));
      }

      const data = await uploadCsv(formData, setProgress);

      setResult(data);
      toast.success('Data appended successfully!');
      onSuccess();
    } catch (error) {
      toast.error('Upload failed', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  const detectedSource = result?.source_type ? SOURCE_INFO[result.source_type] : null;
  const skippedEntries = result ? Object.entries(result.skipped_fields || {}) : [];

  return (
    <Dialog open={open} onOpenChange={(val) => {
      onOpenChange(val);
      if (!val) setTimeout(resetAll, 300);
    }}>
      <DialogContent className="sm:max-w-[520px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Data to Funnel</DialogTitle>
          <DialogDescription>
            Upload raw domains or enriched CSV data. The source is auto-detected and each source only writes its own columns.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <form onSubmit={handleUpload} className="space-y-5 pt-4">
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:bg-muted/30 transition-colors">
              <Input
                type="file" accept=".csv,.xlsx"
                onChange={e => handleFileSelect(e.target.files?.[0] || null)}
                className="hidden" id="funnel-csv-upload"
              />
              <Label htmlFor="funnel-csv-upload" className="cursor-pointer flex flex-col items-center gap-2">
                <UploadIcon className="w-8 h-8 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {file ? file.name : "Click to browse or drag and drop"}
                </span>
                <span className="text-xs text-muted-foreground">Apollo, Reo DB, Crunchbase, or raw domains CSV</span>
              </Label>
            </div>

            {/* Detected source — confirm or override before importing */}
            {file && detected && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Detected source:</span>
                  <Badge variant="outline" className={`${SOURCE_INFO[detected]?.color}`}>
                    {SOURCE_INFO[detected]?.icon}
                    <span className="ml-1">{SOURCE_INFO[detected]?.label}</span>
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Import as</Label>
                  <Select value={sourceOverride} onValueChange={v => setSourceOverride((v ?? 'auto') as CsvSourceType | 'auto')}>
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
                <p className="text-[11px] text-muted-foreground leading-snug flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  Only {SOURCE_LABEL[effectiveSource]}-owned columns will be written. Identity fields (name, country…) fill only when empty.
                </p>
              </div>
            )}

            {/* Matching column — the domain key used to find existing rows (xlookup) */}
            {file && headers.length > 0 && (
              <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <KeyRound className="w-3 h-3" />
                  Match companies on (domain column)
                </Label>
                <Select value={matchColumn} onValueChange={v => setMatch(v ?? '')}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select the column that holds the domain" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {headers.map((h, i) => (
                      <SelectItem key={i} value={h || `__col_${i}`}>
                        {h || `Column ${i + 1}`}{sample[i] ? ` — e.g. ${sample[i]}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Used only to find the matching company — this column is never overwritten. Uncertain matches are sent to the Duplicates tab for your approval, never auto-merged.
                </p>
              </div>
            )}

            {/* Manual column mapping — collapsed by default */}
            {file && importHeaders.length > 0 && (
              <div className="rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setShowMapping(s => !s)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/30"
                >
                  <span className="flex items-center gap-2">
                    {showMapping ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Edit column mapping
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {mappedCount} of {importHeaders.length} mapped{mappingEdited ? ' · custom' : ''}
                  </span>
                </button>

                {showMapping && (
                  <div className="border-t border-border p-3 space-y-2 max-h-72 overflow-y-auto">
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Only columns {SOURCE_LABEL[effectiveSource]} is allowed to write are shown — a mapping can never overwrite another source&apos;s data.
                    </p>
                    {importHeaders.map((h) => {
                      const i = headers.indexOf(h);
                      return (
                        <div key={i} className="grid grid-cols-2 gap-2 items-center">
                          <div className="min-w-0">
                            <div className="text-xs font-medium truncate" title={h}>{h || `Column ${i + 1}`}</div>
                            {sample[i] && (
                              <div className="text-[10px] text-muted-foreground truncate" title={sample[i]}>e.g. {sample[i]}</div>
                            )}
                          </div>
                          <Select value={mapping[h] ?? SKIP} onValueChange={v => setFieldFor(h, v ?? SKIP)}>
                            <SelectTrigger className="h-8 text-xs bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                              <SelectItem value={SKIP}>— Don&apos;t import —</SelectItem>
                              {availableFields.map(f => (
                                <SelectItem key={f.value} value={f.value}>
                                  {f.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {loading && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {progress?.finalizing ? 'Finalizing…'
                      : progress ? 'Importing rows…'
                      : 'Reading & parsing file…'}
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
              </div>
            )}

            <Button type="submit" className="w-full" disabled={!file || loading}>
              {loading ? 'Uploading & Processing...' : 'Confirm & Upload Data'}
            </Button>
          </form>
        ) : (
          <div className="mt-4 p-4 rounded-lg bg-muted/50 border border-border space-y-4 text-sm">
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

            {skippedEntries.length > 0 && (
              <div className="pt-3 border-t border-border">
                <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-amber-600" />
                  Skipped (owned by another source):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {skippedEntries.map(([field, count]) => (
                    <Badge key={field} variant="outline" className="text-[10px] text-amber-700 border-amber-300">
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
                <div className="text-[10px] text-muted-foreground overflow-y-auto max-h-24">
                  {result.errors.map((err: string, i: number) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              </div>
            )}

            <Button className="w-full mt-2" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
