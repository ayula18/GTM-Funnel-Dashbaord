'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { FunnelBar } from '@/components/funnel-bar';
import { DataTable } from '@/components/data-table';
import { PipelineProgress } from '@/components/pipeline-progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Play, Download, ListChecks, AlertTriangle, XCircle, Upload, GitMerge } from 'lucide-react';
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

  useEffect(() => {
    fetchFunnel();
    fetch(`/api/companies/duplicates?funnel_id=${funnelId}`)
      .then(res => res.json())
      .then(data => setMergeCandidateCount(data.count || 0))
      .catch(() => {});
  }, [fetchFunnel, funnelId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (pipelineState.status === 'running' || pipelineState.status === 'stopping') {
      interval = setInterval(() => {
        fetch(`/api/funnels/${funnelId}?t=${Date.now()}`)
          .then(res => res.json())
          .then(data => {
            if (data.classification_status) {
              setPipelineState({
                status: data.classification_status,
                completed: data.classification_completed || 0,
                total: data.classification_total || 0,
                currentDomain: data.classification_current_domain || '',
                errors: []
              });
              if (data.classification_status === 'idle' || data.classification_status === 'completed') {
                clearInterval(interval);
                fetchFunnel();
              }
            }
          });
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [pipelineState.status, funnelId, fetchFunnel]);

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

  const runPipeline = async () => {
    try {
      const res = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funnel_id: funnelId })
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error('Failed to start pipeline', { description: err.error });
        return;
      }

      setPipelineState(prev => ({ ...prev, status: 'running', errors: [] }));
      toast.info('Classification pipeline started in background');
    } catch (error) {
      toast.error('Pipeline error', { description: errorMessage(error) });
      setPipelineState(prev => ({ ...prev, status: 'error' }));
    }
  };

  const stopPipeline = async () => {
    try {
      // Set to idle immediately so UI responds instantly
      setPipelineState(prev => ({ ...prev, status: 'idle' }));
      await fetch('/api/classify/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funnel_id: funnelId })
      });
      toast.info('Classification stopped.');
      fetchFunnel();
    } catch {
      toast.error('Failed to stop pipeline');
    }
  };

  const handleExport = () => {
    let url = `/api/export?funnel_id=${funnelId}`;
    for (const [k, v] of Object.entries(combinedFilters)) {
      url += `&${k}=${encodeURIComponent(v)}`;
    }
    window.open(url, '_blank');
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
