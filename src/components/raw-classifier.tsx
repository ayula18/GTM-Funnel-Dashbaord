'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Loader2, UploadCloud, FileSpreadsheet, Download, AlertTriangle, X,
} from 'lucide-react';

interface BucketSummary { id: string; label: string; qualified: boolean; count: number }
interface RawResult {
  fileBase64: string;
  fileName: string;
  total: number;
  qualified: number;
  needs_review: number;
  detected: Record<string, string>;   // field → original header
  summary: BucketSummary[];
}

// The bucket inputs we surface to the user, with friendly names.
const INPUT_LABELS: Record<string, string> = {
  company_classification: 'Classification',
  category: 'Category',
  sub_category: 'Sub Category',
  apollo_employees: 'Employees (Apollo)',
  employee_reo: 'Employees (Reo)',
  sales_team_count: 'Sales Team',
  total_funding: 'Funding (Apollo)',
  crunchbase_funding: 'Funding (Crunchbase)',
  annual_revenue: 'Revenue (Apollo)',
  revenue_reo: 'Revenue (Reo)',
};

function downloadBase64(b64: string, fileName: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function RawClassifier() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RawResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | null) => {
    setFile(f);
    setResult(null);
    setError(null);
  };

  const classify = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/categorization/raw-classify', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Classification failed');
      setResult(json as RawResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Classification failed');
    } finally {
      setLoading(false);
    }
  };

  const hasClassification = result && 'company_classification' in result.detected;

  return (
    <div className="max-w-[900px] mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Raw Classifier</h2>
        <p className="text-sm text-slate-500 mt-1">
          Upload a CSV with company info (classification, employees, sales team, funding, revenue).
          Every row is bucketed by the same GTM rules and returned as an Excel sheet with a
          <span className="font-medium"> GTM Bucket</span> column appended. Nothing is saved to the dashboard.
        </p>
      </div>

      {/* Dropzone */}
      <Card
        className={`border-2 border-dashed transition-colors ${dragOver ? 'border-indigo-400 bg-indigo-50/40' : 'border-slate-200 bg-white'}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) pick(f);
        }}
      >
        <CardContent className="p-8 flex flex-col items-center justify-center text-center">
          <UploadCloud className="w-10 h-10 text-slate-400 mb-3" />
          {file ? (
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span className="font-medium">{file.name}</span>
              <button onClick={() => pick(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Drag a CSV here, or{' '}
              <button onClick={() => inputRef.current?.click()} className="text-indigo-600 font-medium hover:underline">
                browse
              </button>
            </p>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={classify} disabled={!file || loading} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
          {loading ? 'Classifying…' : 'Classify'}
        </Button>
        {result && (
          <Button
            variant="outline"
            className="gap-2 text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
            onClick={() => downloadBase64(result.fileBase64, result.fileName)}
          >
            <Download className="w-4 h-4" />
            Download Excel
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-5">
          {/* Headline stats */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Rows classified" value={result.total} />
            <StatCard label="Qualified" value={result.qualified} accent="emerald" />
            <StatCard label="Flagged for review" value={result.needs_review} accent={result.needs_review > 0 ? 'amber' : undefined} />
          </div>

          {/* Detected columns + warning */}
          <Card className="bg-white">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Columns detected for bucketing</p>
              {Object.keys(result.detected).length === 0 ? (
                <p className="text-sm text-slate-500">None detected.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(result.detected).map(([field, header]) => (
                    <span key={field} className="text-[11px] bg-slate-100 text-slate-700 rounded px-2 py-1">
                      <span className="font-medium">{INPUT_LABELS[field] || field}</span>
                      <span className="text-slate-400"> ← “{header}”</span>
                    </span>
                  ))}
                </div>
              )}
              {!hasClassification && (
                <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  No <span className="font-medium">Classification</span> column was detected, so rows can’t be marked DevTool — most will fall to “Irrelevant”. Add a column like “Company Classification” (DevTool / IT Services &amp; Solutions / Not Relevant).
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bucket distribution */}
          <Card className="bg-white">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Bucket distribution</p>
              <div className="space-y-1.5">
                {result.summary.map(b => {
                  const pct = result.total > 0 ? Math.round((b.count / result.total) * 100) : 0;
                  return (
                    <div key={b.id} className="flex items-center gap-3 text-sm">
                      <span className="w-28 shrink-0 text-slate-700">{b.label}</span>
                      <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden">
                        <div
                          className={`h-full ${b.qualified ? 'bg-emerald-500' : 'bg-slate-300'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-10 text-right tabular-nums text-slate-600">{b.count}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: 'emerald' | 'amber' }) {
  const color =
    accent === 'emerald' ? 'text-emerald-600' : accent === 'amber' ? 'text-amber-600' : 'text-slate-900';
  return (
    <Card className="bg-white">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
