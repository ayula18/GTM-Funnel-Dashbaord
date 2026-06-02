'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload as UploadIcon, CheckCircle, AlertCircle, FileSpreadsheet, Globe, Layers, Beaker, Database } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/utils';
import { detectSourceFromFile } from '@/lib/csv-detect';
import type { CsvSourceType } from '@/lib/types';

const SOURCE_INFO: Record<string, { label: string; icon: React.ReactNode; color: string; desc: string }> = {
  apollo: { label: 'Apollo Export', icon: <Globe className="w-4 h-4" />, color: 'text-blue-600 bg-blue-50', desc: 'Employee, funding, LinkedIn, country data' },
  reo_db: { label: 'Reo DB Export', icon: <Database className="w-4 h-4" />, color: 'text-purple-600 bg-purple-50', desc: 'Internal employee count data' },
  crunchbase: { label: 'Crunchbase Export', icon: <Layers className="w-4 h-4" />, color: 'text-emerald-600 bg-emerald-50', desc: 'Funding and revenue data' },
  icp_output: { label: 'ICP Classifier Output', icon: <Beaker className="w-4 h-4" />, color: 'text-amber-600 bg-amber-50', desc: 'Pre-classified ICP data' },
  raw_domains: { label: 'Raw Domain List', icon: <FileSpreadsheet className="w-4 h-4" />, color: 'text-slate-600 bg-slate-50', desc: 'Just domains for classification' },
  unknown: { label: 'Auto-detect', icon: <FileSpreadsheet className="w-4 h-4" />, color: 'text-muted-foreground bg-muted', desc: 'Will detect from column headers' },
};

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
  const [result, setResult] = useState<any>(null);

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
    if (!file) return;

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('funnel_id', funnelId.toString());
      formData.append('type', 'companies');
      if (effectiveSource !== 'unknown') formData.append('source_type', effectiveSource);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      
      setResult(data);
      toast.success('Data appended successfully!');
      onSuccess();
    } catch (error: any) {
      toast.error('Upload failed', { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const detectedSource = result?.source_type ? SOURCE_INFO[result.source_type] : null;

  return (
    <Dialog open={open} onOpenChange={(val) => {
      onOpenChange(val);
      if (!val) {
        // Reset when closing
        setTimeout(() => {
          setFile(null);
          setResult(null);
          setDetected(null);
          setSourceOverride('auto');
        }, 300);
      }
    }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Data to Funnel</DialogTitle>
          <DialogDescription>
            Upload raw domains or enriched CSV data. The system will auto-detect the source and merge it into this funnel.
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

            <Button
              type="submit"
              className="w-full"
              disabled={!file || loading}
            >
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

            <Button 
              className="w-full mt-2" variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
