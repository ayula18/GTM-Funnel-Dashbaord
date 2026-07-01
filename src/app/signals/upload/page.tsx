'use client';

import { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { formatNumber, errorMessage } from '@/lib/utils';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Upload, Radar, CheckCircle, AlertCircle, FileSpreadsheet, ArrowRight,
  Globe, Users, Building2, Target, Loader2, X, Info,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────

interface UploadResult {
  list_id: number;
  list_name: string;
  total_rows: number;
  matched_existing: number;
  new_targets: number;
  already_targeted: number;
  not_found: number;
  errors: string[];
}

// ── Main Component ──────────────────────────────────────────────────────

export default function SignalUploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [listName, setListName] = useState('');
  const [listDescription, setListDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; sampleRows: string[][] } | null>(null);

  // Parse CSV preview
  const handleFileSelect = useCallback(async (f: File | null) => {
    setFile(f);
    setResult(null);
    setPreview(null);

    if (!f) return;

    try {
      const text = await f.text();
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) throw new Error('CSV must have a header row and data');

      // Simple CSV parse for preview
      const parseLine = (line: string) => {
        const fields: string[] = [];
        let current = '';
        let inQuote = false;
        for (const ch of line) {
          if (ch === '"') { inQuote = !inQuote; continue; }
          if (ch === ',' && !inQuote) { fields.push(current.trim()); current = ''; continue; }
          current += ch;
        }
        fields.push(current.trim());
        return fields;
      };

      const headers = parseLine(lines[0]);
      const sampleRows = lines.slice(1, 6).map(l => parseLine(l));
      setPreview({ headers, sampleRows });
    } catch (err) {
      toast.error('Failed to parse CSV', { description: errorMessage(err) });
    }
  }, []);

  // Upload
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !listName.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', listName.trim());
      if (listDescription.trim()) formData.append('description', listDescription.trim());

      const res = await fetch('/api/signals/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setResult(data);
      toast.success('Target list uploaded successfully!');
    } catch (err) {
      toast.error('Upload failed', { description: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  const hasDomainColumn = preview?.headers.some(h =>
    /^(domain|website|company.?domain|url|homepage)$/i.test(h.trim())
  );

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <Target className="w-5 h-5 text-primary" />
          </div>
          Upload Target List
        </h1>
        <p className="text-muted-foreground mt-1">
          Upload your refined ICP list — companies with documentation, straightforward devtools, not in CN/JP/KR
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Upload Form */}
        <div className="lg:col-span-3">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="w-5 h-5 text-primary" />
                Import Target Accounts
              </CardTitle>
              <CardDescription>
                Upload your curated company list. The system matches domains against your enriched companies database.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpload} className="space-y-5">
                {/* List Name */}
                <div className="space-y-2">
                  <Label htmlFor="listName">List Name *</Label>
                  <Input
                    id="listName"
                    placeholder="e.g. Q3 2026 Direct ICP — DevTools"
                    value={listName}
                    onChange={e => setListName(e.target.value)}
                    className="bg-background"
                    required
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="listDesc">Description</Label>
                  <Textarea
                    id="listDesc"
                    placeholder="What's in this list? e.g. Filtered from Q3 TAM — docs-first devtools, excluding CN/JP/KR..."
                    value={listDescription}
                    onChange={e => setListDescription(e.target.value)}
                    rows={2}
                    className="bg-background resize-none"
                  />
                </div>

                {/* File Picker */}
                <div className="space-y-2">
                  <Label>CSV File *</Label>
                  <div
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
                      ${file ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/30'}`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.xlsx"
                      onChange={e => handleFileSelect(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <div className="flex flex-col items-center gap-2">
                      {file ? (
                        <>
                          <FileSpreadsheet className="w-8 h-8 text-primary" />
                          <span className="text-sm font-medium">{file.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {(file.size / 1024).toFixed(0)} KB
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-xs mt-1"
                            onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); }}
                          >
                            <X className="w-3 h-3 mr-1" /> Remove
                          </Button>
                        </>
                      ) : (
                        <>
                          <Upload className="w-8 h-8 text-muted-foreground" />
                          <span className="text-sm font-medium">Click to browse or drag and drop</span>
                          <span className="text-xs text-muted-foreground">
                            CSV with domain column + enrichment data
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* CSV Preview */}
                {preview && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Column Preview</Label>
                      <span className="text-[10px] text-muted-foreground">
                        {preview.sampleRows.length} of {preview.headers.length} columns shown
                      </span>
                    </div>

                    {/* Domain detection */}
                    {hasDomainColumn ? (
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-500">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Domain column detected — will match against existing companies
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[11px] text-amber-500">
                        <AlertCircle className="w-3.5 h-3.5" />
                        No domain column detected — make sure your CSV has a &quot;domain&quot; or &quot;website&quot; column
                      </div>
                    )}

                    {/* Column badges */}
                    <div className="flex flex-wrap gap-1.5">
                      {preview.headers.map((h, i) => {
                        const isDomain = /^(domain|website|company.?domain|url|homepage)$/i.test(h.trim());
                        return (
                          <Badge
                            key={i}
                            variant="outline"
                            className={`text-[9px] ${isDomain ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : ''}`}
                          >
                            {isDomain && <Globe className="w-2.5 h-2.5 mr-1" />}
                            {h}
                          </Badge>
                        );
                      })}
                    </div>

                    {/* Sample data */}
                    <div className="border border-border rounded-lg overflow-hidden overflow-x-auto max-h-[200px]">
                      <table className="w-full text-[10px]">
                        <thead className="bg-muted/30 border-b border-border">
                          <tr>
                            {preview.headers.slice(0, 8).map((h, i) => (
                              <th key={i} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                            {preview.headers.length > 8 && (
                              <th className="px-2 py-1.5 text-muted-foreground">+{preview.headers.length - 8}</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {preview.sampleRows.map((row, ri) => (
                            <tr key={ri}>
                              {row.slice(0, 8).map((cell, ci) => (
                                <td key={ci} className="px-2 py-1.5 whitespace-nowrap truncate max-w-[120px]">
                                  {cell || <span className="text-muted-foreground/40">—</span>}
                                </td>
                              ))}
                              {row.length > 8 && <td className="px-2 py-1.5 text-muted-foreground">…</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Loading state */}
                {loading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Matching domains and importing targets…
                  </div>
                )}

                {/* Submit */}
                <Button type="submit" className="w-full" disabled={!file || !listName.trim() || loading}>
                  {loading ? 'Importing…' : 'Upload & Match Targets'}
                </Button>
              </form>

              {/* Result */}
              {result && (
                <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border space-y-4 text-sm">
                  <div className="flex items-center gap-2 font-medium text-emerald-600">
                    <CheckCircle className="w-4 h-4" />
                    Upload Complete
                  </div>

                  <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                    <div className="text-muted-foreground">Rows Processed:</div>
                    <div className="font-medium text-right">{formatNumber(result.total_rows)}</div>

                    <div className="text-muted-foreground">Matched Existing:</div>
                    <div className="font-medium text-right text-emerald-600">{formatNumber(result.matched_existing)}</div>

                    <div className="text-muted-foreground">New Targets Added:</div>
                    <div className="font-medium text-right text-blue-600">{formatNumber(result.new_targets)}</div>

                    <div className="text-muted-foreground">Already Targeted:</div>
                    <div className="font-medium text-right">{formatNumber(result.already_targeted)}</div>

                    <div className="text-muted-foreground">Not Found in DB:</div>
                    <div className="font-medium text-right text-amber-600">{formatNumber(result.not_found)}</div>
                  </div>

                  {result.errors?.length > 0 && (
                    <div className="pt-3 border-t border-border">
                      <div className="text-amber-600 flex items-center gap-1 text-xs mb-1">
                        <AlertCircle className="w-3 h-3" />
                        {result.errors.length} warnings
                      </div>
                      <div className="text-[10px] text-muted-foreground">{result.errors[0]}</div>
                    </div>
                  )}

                  <Button
                    className="w-full mt-2" variant="outline"
                    onClick={() => router.push('/signals')}
                  >
                    Open Signal Board <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Info Panel */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="w-4 h-4 text-primary" />
                How It Works
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted-foreground">
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-[10px] font-bold">1</div>
                <div>
                  <div className="font-medium text-foreground">Upload your refined list</div>
                  <div className="mt-0.5">CSV with domain column + any enrichment data (employees, funding, country, etc.)</div>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-[10px] font-bold">2</div>
                <div>
                  <div className="font-medium text-foreground">Auto-match to existing companies</div>
                  <div className="mt-0.5">Domains are matched against your companies database. All enrichment data flows through automatically.</div>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-[10px] font-bold">3</div>
                <div>
                  <div className="font-medium text-foreground">Start tracking signals</div>
                  <div className="mt-0.5">Add buying signals (funding rounds, GTM hires, LinkedIn engagement) and prioritize accounts for SDRs.</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                Expected CSV Format
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">Required column:</p>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]">
                <Globe className="w-2.5 h-2.5 mr-1" /> domain (or website)
              </Badge>
              <p className="text-xs text-muted-foreground mt-3">Optional columns (auto-detected):</p>
              <div className="flex flex-wrap gap-1">
                {['company_name', 'employees', 'total_funding', 'annual_revenue', 'country', 'category', 'founded_year', 'linkedin_url', 'description'].map(col => (
                  <Badge key={col} variant="outline" className="text-[9px]">{col}</Badge>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                Any columns present in your CSV that match existing company fields will be used. Missing data is pulled from the existing enrichment database.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
