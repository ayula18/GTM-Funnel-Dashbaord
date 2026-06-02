'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Upload as UploadIcon, Database, CheckCircle, AlertCircle, 
  FileSpreadsheet, Globe, Layers, Beaker, ArrowRight
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
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

export default function UploadPage() {
  const router = useRouter();
  const [funnelName, setFunnelName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [detected, setDetected] = useState<CsvSourceType | null>(null);
  const [sourceOverride, setSourceOverride] = useState<CsvSourceType | 'auto'>('auto');
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [masterLoading, setMasterLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Detect the source type in the browser the moment a file is chosen, so the
  // user can confirm or override BEFORE anything is committed.
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

  // The source type we'll actually import as: explicit override wins, else the
  // detected type, else let the server auto-detect.
  const effectiveSource: CsvSourceType =
    sourceOverride !== 'auto' ? sourceOverride : (detected ?? 'unknown');

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !funnelName) return;

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('funnel_name', funnelName);
      formData.append('type', 'companies');
      if (effectiveSource !== 'unknown') formData.append('source_type', effectiveSource);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      
      setResult(data);
      toast.success('Funnel created successfully!');
    } catch (error: any) {
      toast.error('Upload failed', { description: error.message });
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
    } catch (error: any) {
      toast.error('Upload failed', { description: error.message });
    } finally {
      setMasterLoading(false);
    }
  };

  const detectedSource = result?.source_type ? SOURCE_INFO[result.source_type] : null;

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
            <CardDescription>Upload any CSV — the system auto-detects the source type (Apollo, Reo DB, Crunchbase, etc.).</CardDescription>
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
                      {file ? file.name : "Click to browse or drag and drop"}
                    </span>
                    <span className="text-xs text-muted-foreground">Apollo, Reo DB, Crunchbase, or raw domains CSV</span>
                  </Label>
                </div>
              </div>

              {/* Detected source — confirm or override before importing */}
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

              <Button
                type="submit"
                className="w-full"
                disabled={!file || !funnelName || loading}
              >
                {loading ? 'Uploading & Processing...' : 'Confirm & Create Funnel'}
              </Button>
            </form>

            {/* Upload Result */}
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
                      {masterFile ? masterFile.name : "Click to browse or drag and drop"}
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
    </div>
  );
}
