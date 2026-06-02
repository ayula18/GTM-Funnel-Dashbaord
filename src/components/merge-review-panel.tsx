'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle, Check, X, ExternalLink, RefreshCw, GitMerge,
  Building2, Globe, Users, DollarSign, Link2, ChevronDown, ChevronUp
} from 'lucide-react';
import { formatCurrency, formatNumber, cn } from '@/lib/utils';
import { toast } from 'sonner';

interface MergeCandidate {
  id: number;
  company_id_1: number;
  company_id_2: number;
  match_type: string;
  match_detail: string;
  confidence: string;
  status: string;
  domain_1: string;
  name_1: string | null;
  linkedin_1: string | null;
  employees_1: number | null;
  funding_1: number | null;
  icp_1: string | null;
  classification_1: string | null;
  category_1: string | null;
  country_1: string | null;
  website_1: string | null;
  domain_2: string;
  name_2: string | null;
  linkedin_2: string | null;
  employees_2: number | null;
  funding_2: number | null;
  icp_2: string | null;
  classification_2: string | null;
  category_2: string | null;
  country_2: string | null;
  website_2: string | null;
}

interface MergeReviewPanelProps {
  funnelId: number;
  onMergeComplete?: () => void;
}

export function MergeReviewPanel({ funnelId, onMergeComplete }: MergeReviewPanelProps) {
  const [candidates, setCandidates] = useState<MergeCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/companies/duplicates?funnel_id=${funnelId}`);
      const data = await res.json();
      setCandidates(data.candidates || []);
    } catch {
      toast.error('Failed to load merge candidates');
    } finally {
      setLoading(false);
    }
  }, [funnelId]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  const handleResolve = async (id: number, action: 'approve' | 'reject') => {
    setResolving(id);
    try {
      const res = await fetch('/api/companies/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) throw new Error('Failed to resolve');
      
      toast.success(action === 'approve' ? 'Companies merged!' : 'Marked as different companies');
      setCandidates(prev => prev.filter(c => c.id !== id));
      onMergeComplete?.();
    } catch {
      toast.error('Failed to resolve merge candidate');
    } finally {
      setResolving(null);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/companies/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan', funnel_id: funnelId }),
      });
      const data = await res.json();
      toast.success(`Scan complete: ${data.duplicates_found} potential duplicates found`);
      fetchCandidates();
    } catch {
      toast.error('Failed to scan for duplicates');
    } finally {
      setScanning(false);
    }
  };

  const confidenceColor = (c: string) => {
    if (c === 'high') return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    if (c === 'medium') return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
    return 'bg-red-500/10 text-red-600 border-red-500/20';
  };

  const matchTypeLabel = (type: string) => {
    switch (type) {
      case 'root_name': return 'Same root domain';
      case 'core_root': return 'Marketing prefix variant';
      case 'linkedin_url': return 'Same LinkedIn';
      case 'company_name': return 'Same company name';
      default: return type;
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array(2).fill(0).map((_, i) => (
          <div key={i} className="h-28 bg-muted/30 animate-pulse rounded-lg border border-border" />
        ))}
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <Check className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <p className="text-sm font-medium">No duplicate candidates</p>
            <p className="text-xs text-muted-foreground mt-1">All companies have been resolved.</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleScan} disabled={scanning} className="mt-2">
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", scanning && "animate-spin")} />
            {scanning ? 'Scanning...' : 'Re-scan for duplicates'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium">
            {candidates.length} potential duplicate{candidates.length > 1 ? 's' : ''} found
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={handleScan} disabled={scanning}>
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", scanning && "animate-spin")} />
          Re-scan
        </Button>
      </div>

      {/* Candidate Cards */}
      {candidates.map((c) => (
        <div key={c.id} className="rounded-lg border border-border bg-card overflow-hidden transition-all">
          {/* Summary Row */}
          <div 
            className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
            onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
          >
            <GitMerge className="h-4 w-4 text-amber-500 shrink-0" />
            
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {/* Company 1 */}
              <span className="text-sm font-medium truncate">
                {c.name_1 || c.domain_1}
              </span>
              <span className="text-xs text-muted-foreground font-mono">{c.domain_1}</span>
              
              <span className="text-muted-foreground text-xs">↔</span>
              
              {/* Company 2 */}
              <span className="text-sm font-medium truncate">
                {c.name_2 || c.domain_2}
              </span>
              <span className="text-xs text-muted-foreground font-mono">{c.domain_2}</span>
            </div>
            
            <Badge className={cn("shrink-0 text-[10px]", confidenceColor(c.confidence))}>
              {c.confidence}
            </Badge>
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {matchTypeLabel(c.match_type)}
            </Badge>
            
            {expandedId === c.id ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </div>

          {/* Expanded Detail */}
          {expandedId === c.id && (
            <div className="border-t border-border px-4 py-4 bg-muted/5">
              <div className="grid grid-cols-2 gap-4">
                {/* Company 1 Card */}
                <CompanyCard
                  domain={c.domain_1}
                  name={c.name_1}
                  linkedin={c.linkedin_1}
                  employees={c.employees_1}
                  funding={c.funding_1}
                  icp={c.icp_1}
                  classification={c.classification_1}
                  category={c.category_1}
                  country={c.country_1}
                  website={c.website_1}
                  label="Company A (will be kept)"
                  highlight
                />
                {/* Company 2 Card */}
                <CompanyCard
                  domain={c.domain_2}
                  name={c.name_2}
                  linkedin={c.linkedin_2}
                  employees={c.employees_2}
                  funding={c.funding_2}
                  icp={c.icp_2}
                  classification={c.classification_2}
                  category={c.category_2}
                  country={c.country_2}
                  website={c.website_2}
                  label="Company B (will be merged in)"
                />
              </div>

              {/* Match Reason */}
              <div className="mt-3 px-3 py-2 bg-muted/30 rounded-md">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Why flagged: </span>
                  {c.match_detail}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-4 justify-end">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-red-500 hover:text-red-600 hover:border-red-500/30 hover:bg-red-500/5"
                  disabled={resolving === c.id}
                  onClick={() => handleResolve(c.id, 'reject')}
                >
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Different companies
                </Button>
                <Button 
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={resolving === c.id}
                  onClick={() => handleResolve(c.id, 'approve')}
                >
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                  {resolving === c.id ? 'Merging...' : 'Yes, merge them'}
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CompanyCard({ 
  domain, name, linkedin, employees, funding, icp, classification, category, country, website, label, highlight 
}: {
  domain: string;
  name: string | null;
  linkedin: string | null;
  employees: number | null;
  funding: number | null;
  icp: string | null;
  classification: string | null;
  category: string | null;
  country: string | null;
  website: string | null;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-md border p-3 space-y-2",
      highlight ? "border-primary/30 bg-primary/5" : "border-border bg-card"
    )}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      
      <div className="flex items-center gap-2">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm font-semibold truncate">{name || 'Unknown'}</span>
      </div>
      
      <div className="flex items-center gap-2">
        <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <a href={`https://${domain}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
          {domain} <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {employees != null && (
          <div className="flex items-center gap-1.5">
            <Users className="h-3 w-3 text-muted-foreground" />
            <span>{formatNumber(employees)} employees</span>
          </div>
        )}
        {funding != null && (
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <span>{formatCurrency(funding)}</span>
          </div>
        )}
        {country && (
          <div className="text-muted-foreground">{country}</div>
        )}
        {linkedin && (
          <div>
            <a href={linkedin} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1">
              <Link2 className="h-3 w-3" /> LinkedIn
            </a>
          </div>
        )}
      </div>

      {/* ICP + Classification badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {icp && (
          <Badge className={cn(
            "text-[10px]",
            icp === 'Yes' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
            icp === 'No' ? 'bg-red-500/10 text-red-600 border-red-500/20' :
            'bg-amber-500/10 text-amber-600 border-amber-500/20'
          )}>
            ICP: {icp}
          </Badge>
        )}
        {classification && (
          <Badge variant="secondary" className="text-[10px]">{classification}</Badge>
        )}
        {category && (
          <Badge variant="outline" className="text-[10px]">{category}</Badge>
        )}
      </div>
    </div>
  );
}
