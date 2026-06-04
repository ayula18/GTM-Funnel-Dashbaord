'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import { FunnelBar } from '@/components/funnel-bar';
import { DataTable } from '@/components/data-table';
import { PipelineProgress } from '@/components/pipeline-progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Play, Download, ListChecks, AlertTriangle, XCircle, Upload, GitMerge, History, FileSpreadsheet, CloudUpload, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber, errorMessage } from '@/lib/utils';
import type { FunnelWithStats, FunnelSteps } from '@/lib/types';

type FunnelDetail = FunnelWithStats & {
  steps?: FunnelSteps;
  classification_status?: string | null;
  classification_completed?: number;
  classification_total?: number;
  classification_current_domain?: string;
};
import { UploadToFunnelDialog } from '@/components/upload-to-funnel-dialog';
import { MergeReviewPanel } from '@/components/merge-review-panel';
import { UploadHistoryPanel } from '@/components/upload-history-panel';

export default function FunnelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const funnelId = parseInt(id);

  const [funnel, setFunnel] = useState<FunnelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [mergeCandidateCount, setMergeCandidateCount] = useState(0);
  const [drivePending, setDrivePending] = useState(false);
  const [driveStatus, setDriveStatus] = useState<{ configured: boolean; ok: boolean; folderName?: string; error?: string } | null>(null);
  
  const [pipelineState, setPipelineState] = useState<{
    status: 'idle' | 'running' | 'stopping' | 'completed' | 'error';
    completed: number;
    total: number;
    currentDomain: string;
    errors: string[];
  }>({
    status: 'idle',
    completed: 0,
    total: 0,
    currentDomain: '',
    errors: []
  });

  // Drive-loop control: stopRef short-circuits the loop; drivingRef prevents
  // two loops running at once (e.g. button click + auto-resume).
  const stopRef = useRef(false);
  const drivingRef = useRef(false);

  const fetchFunnel = useCallback(() => {
    fetch(`/api/funnels/${funnelId}`)
      .then(res => res.json())
      .then(data => {
        setFunnel(data);
        if (data.classification_status && data.classification_status !== 'idle') {
          setPipelineState({
            status: data.classification_status,
            completed: data.classification_completed || 0,
            total: data.classification_total || 0,
            currentDomain: data.classification_current_domain || '',
            errors: []
          });
        }
        setLoading(false);
      });
  }, [funnelId]);

  // Drive the classification loop: repeatedly ask the server to process a
  // time-boxed slice until it reports done. No long-lived background task to
  // orphan on serverless, Stop is instant, and progress comes straight from
  // each response.
  const drive = useCallback(async () => {
    if (drivingRef.current) return;
    drivingRef.current = true;
    stopRef.current = false;
    setPipelineState(prev => ({ ...prev, status: 'running' }));

    try {
      while (!stopRef.current) {
        const res = await fetch('/api/classify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ funnel_id: funnelId }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error('Classification error', { description: data.error });
          setPipelineState(prev => ({ ...prev, status: 'error' }));
          break;
        }
        setPipelineState(prev => ({
          status: data.done ? 'idle' : 'running',
          completed: data.completed ?? prev.completed,
          total: data.total ?? prev.total,
          currentDomain: '',
          errors: [...prev.errors, ...(data.errors || [])].slice(-50),
        }));
        if (data.done) {
          if (!data.stopped) toast.success('Classification complete');
          break;
        }
      }
    } catch (error) {
      toast.error('Pipeline error', { description: errorMessage(error) });
      setPipelineState(prev => ({ ...prev, status: 'error' }));
    } finally {
      drivingRef.current = false;
      fetchFunnel();
    }
  }, [funnelId, fetchFunnel]);

  useEffect(() => {
    fetchFunnel();
    fetch(`/api/companies/duplicates?funnel_id=${funnelId}`)
      .then(res => res.json())
      .then(data => setMergeCandidateCount(data.count || 0))
      .catch(() => {});
  }, [fetchFunnel, funnelId]);

  // Drive connection status for the export indicator.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/export/drive')
      .then(res => res.json())
      .then(data => { if (!cancelled) setDriveStatus(data); })
      .catch(() => { if (!cancelled) setDriveStatus({ configured: false, ok: false }); });
    return () => { cancelled = true; };
  }, []);

  // Auto-resume: if the funnel is already 'running' on load (e.g. the tab was
  // refreshed mid-run), pick the loop back up automatically.
  useEffect(() => {
    if (funnel?.classification_status === 'running' && !drivingRef.current) {
      drive();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnel?.classification_status]);

  // Build filter params based on active step. Uses the canonical funnel_step
  // gate (shared with the funnel-bar counts) so the rows match the step badge.
  const getStepFilters = (): Record<string, string> => {
    if (!activeStep || activeStep === 1) return {};
    return { funnel_step: String(activeStep) };
  };

  // Build filters based on tab
  const getTabFilters = (): Record<string, string> => {
    switch (activeTab) {
      case 'review': return { needs_manual_review: 'true' };
      case 'discarded': return { discard_reason: 'not_in_apollo,low_employees,not_icp,low_funding,dead_domain,scrape_failed' };
      default: return {};
    }
  };

  const combinedFilters = { ...getStepFilters(), ...getTabFilters() };

  const runPipeline = () => {
    setPipelineState(prev => ({ ...prev, errors: [] }));
    toast.info('Classification started');
    drive();
  };

  const resetFailed = async () => {
    try {
      const res = await fetch('/api/classify/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funnel_id: funnelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      if (data.reset === 0) {
        toast.info('No failed companies to reset.');
      } else {
        toast.success(`Reset ${data.reset} failed companies`, {
          description: 'They are now queued for re-classification. Hit "Run Classification" to start.',
        });
        fetchFunnel();
      }
    } catch (error) {
      toast.error('Reset failed', { description: errorMessage(error) });
    }
  };

  const stopPipeline = async () => {
    // Stop the client loop immediately, then tell the server to idle out so a
    // refresh / other viewer also sees it stopped.
    stopRef.current = true;
    setPipelineState(prev => ({ ...prev, status: 'idle' }));
    try {
      await fetch('/api/classify/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funnel_id: funnelId }),
      });
    } catch { /* best-effort — the client loop already stopped */ }
    toast.info('Classification stopped.');
  };

  const handleExport = () => {
    let url = `/api/export?funnel_id=${funnelId}`;
    for (const [k, v] of Object.entries(combinedFilters)) {
      url += `&${k}=${encodeURIComponent(v)}`;
    }
    window.open(url, '_blank');
  };

  const handleExportExcel = () => {
    window.open(`/api/export/xlsx?funnel_id=${funnelId}`, '_blank');
    toast.info('Building Excel workbook — your download will start shortly.');
  };

  const handleSyncToDrive = async () => {
    setDrivePending(true);
    try {
      const res = await fetch('/api/export/drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funnel_id: funnelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Drive sync failed');
      toast.success('Saved to Google Drive', {
        description: data.fileName,
        action: data.link ? { label: 'Open', onClick: () => window.open(data.link, '_blank') } : undefined,
      });
    } catch (error) {
      toast.error('Drive sync failed', { description: errorMessage(error) });
    } finally {
      setDrivePending(false);
    }
  };

  const handlePushToMaster = async () => {
    if (selectedIds.length === 0) {
      toast.error('No companies selected');
      return;
    }
    try {
      const res = await fetch('/api/master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_ids: selectedIds })
      });
      const data = await res.json();
      toast.success(`Pushed ${data.pushed} companies to Master ICP list`);
      fetchFunnel();
    } catch (e) {
      toast.error('Failed', { description: errorMessage(e) });
    }
  };

  if (loading) {
    return <div className="p-8 flex items-center justify-center">Loading funnel...</div>;
  }

  if (!funnel) {
    return <div className="p-8 text-destructive">Funnel not found.</div>;
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{funnel.name}</h1>
          <p className="text-muted-foreground mt-1">
            {funnel.description || 'No description'} • {formatNumber(funnel.total_companies)} companies
            {funnel.unclassified > 0 && (
              <span className="text-amber-600"> • {funnel.unclassified} unclassified</span>
            )}
          </p>
        </div>
        
        <div className="flex gap-2">
          {selectedIds.length > 0 && (
            <Button variant="outline" onClick={handlePushToMaster} className="text-emerald-600 border-emerald-500/50 hover:bg-emerald-500/10">
              <ListChecks className="w-4 h-4 mr-2" />
              Push {selectedIds.length} to Master
            </Button>
          )}
          <Button variant="outline" onClick={() => setIsUploadOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Upload Data
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={handleExportExcel}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Excel
          </Button>
          <div className="flex flex-col items-center">
            <Button variant="outline" onClick={handleSyncToDrive} disabled={drivePending}>
              <CloudUpload className="w-4 h-4 mr-2" />
              {drivePending ? 'Saving…' : 'To Drive'}
            </Button>
            {driveStatus && (
              <span
                className="flex items-center gap-1 text-[10px] mt-1 text-muted-foreground"
                title={
                  driveStatus.ok ? `Connected — folder: ${driveStatus.folderName || 'shared'}`
                  : driveStatus.configured ? (driveStatus.error || 'Configured but folder unreachable')
                  : 'Set GOOGLE_SERVICE_ACCOUNT_B64 + GDRIVE_FOLDER_ID'
                }
              >
                <span className={`w-1.5 h-1.5 rounded-full ${driveStatus.ok ? 'bg-emerald-500' : driveStatus.configured ? 'bg-amber-500' : 'bg-muted-foreground/40'}`} />
                {driveStatus.ok ? 'Drive connected' : driveStatus.configured ? 'Drive error' : 'Drive not set up'}
              </span>
            )}
          </div>
          <Button
            variant="outline"
            onClick={resetFailed}
            disabled={pipelineState.status === 'running'}
            className="text-amber-600 border-amber-500/40 hover:bg-amber-500/10"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Re-run Failed
          </Button>
          <Button 
            onClick={runPipeline}
            disabled={pipelineState.status === 'running' || pipelineState.status === 'stopping' || funnel.unclassified === 0}
            className="bg-primary text-white hover:bg-primary/90"
          >
            <Play className="w-4 h-4 mr-2" />
            Run Classification
          </Button>
        </div>
      </div>

      {/* Funnel Bar */}
      <FunnelBar
        steps={funnel.steps ?? null}
        activeStep={activeStep} 
        onStepClick={setActiveStep} 
        onUploadClick={() => setIsUploadOpen(true)}
      />
      
      {/* Pipeline Progress */}
      {pipelineState.status !== 'idle' && (
        <PipelineProgress {...pipelineState} onStop={stopPipeline} />
      )}

      {/* Tabs: All / Review / Discarded */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setActiveStep(null); }}>
        <TabsList className="bg-muted">
          <TabsTrigger value="all" className="text-xs gap-1.5">
            All Companies
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{formatNumber(funnel.total_companies)}</Badge>
          </TabsTrigger>
          <TabsTrigger value="review" className="text-xs gap-1.5">
            <AlertTriangle className="w-3 h-3" />
            Needs Review
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600">{formatNumber(funnel.icp_review)}</Badge>
          </TabsTrigger>
          <TabsTrigger value="discarded" className="text-xs gap-1.5">
            <XCircle className="w-3 h-3" />
            Discarded
          </TabsTrigger>
          {mergeCandidateCount > 0 && (
            <TabsTrigger value="duplicates" className="text-xs gap-1.5">
              <GitMerge className="w-3 h-3" />
              Duplicates
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600">{mergeCandidateCount}</Badge>
            </TabsTrigger>
          )}
          <TabsTrigger value="uploads" className="text-xs gap-1.5">
            <History className="w-3 h-3" />
            Uploads
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4 space-y-8">
          <div>
            {activeStep !== null && (
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Passed Step {activeStep}
              </h2>
            )}
            <DataTable 
              funnelId={funnelId} 
              filters={combinedFilters}
              viewMode={activeStep === 1 ? 'raw' : activeStep === 2 ? 'apollo' : activeStep === 3 ? 'employees' : activeStep === 4 ? 'icp' : activeStep === 5 ? 'funding' : 'main'}
              showSelection
              onSelectionChange={setSelectedIds}
            />
          </div>

          {activeStep !== null && activeStep > 1 && (
            <div className="pt-4 border-t border-border">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 text-destructive">
                <span className="w-2 h-2 rounded-full bg-destructive" />
                Discarded at Step {activeStep}
              </h2>
              <DataTable 
                funnelId={funnelId} 
                filters={{ discard_step: activeStep.toString() }}
                viewMode={activeStep === 1 ? 'raw' : activeStep === 2 ? 'apollo' : activeStep === 3 ? 'employees' : activeStep === 4 ? 'icp' : activeStep === 5 ? 'funding' : 'main'}
                showDiscardColumn
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="review" className="mt-4">
          <DataTable 
            funnelId={funnelId} 
            filters={combinedFilters}
            viewMode="review"
            showSelection
            onSelectionChange={setSelectedIds}
          />
        </TabsContent>

        <TabsContent value="discarded" className="mt-4">
          <DataTable 
            funnelId={funnelId} 
            filters={combinedFilters}
            viewMode="discarded"
            showDiscardColumn
          />
        </TabsContent>

        <TabsContent value="duplicates" className="mt-4">
          <MergeReviewPanel
            funnelId={funnelId}
            onMergeComplete={() => {
              fetchFunnel();
              // Refresh count
              fetch(`/api/companies/duplicates?funnel_id=${funnelId}`)
                .then(res => res.json())
                .then(data => setMergeCandidateCount(data.count || 0))
                .catch(() => {});
            }}
          />
        </TabsContent>

        <TabsContent value="uploads" className="mt-4">
          <UploadHistoryPanel funnelId={funnelId} onRollback={fetchFunnel} />
        </TabsContent>
      </Tabs>
      
      <UploadToFunnelDialog 
        funnelId={funnelId}
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        onSuccess={fetchFunnel}
      />
    </div>
  );
}
