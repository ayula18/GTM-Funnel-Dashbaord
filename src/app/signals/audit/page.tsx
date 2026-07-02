'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Shield, Play, AlertTriangle, CheckCircle2, Trash2, 
  Loader2, Search, ChevronLeft, ChevronRight 
} from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Funnel {
  id: number;
  name: string;
  source: string;
  icp_yes_count?: number;
  audited_count?: number;
  false_positives_count?: number;
}

interface Company {
  id: number;
  domain: string;
  company_name: string;
  category: string;
  classification_reason: string;
  audit_is_false_positive?: boolean;
  audit_flag_reason?: string;
  audit_confidence?: number;
  audit_reasoning?: string;
  audit_dev_signals?: string;
  audit_dev_signal_score?: number;
}

interface AuditResult {
  id: number;
  is_false_positive: boolean;
  flag_reason: string;
  confidence?: number;
  reasoning?: string;
  dev_signals?: string;
  dev_signal_score?: number;
}

export default function ICPAuditorPage() {
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [selectedFunnel, setSelectedFunnel] = useState<number | null>(null);
  
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [auditResults, setAuditResults] = useState<Record<number, AuditResult>>({});
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState({ current: 0, total: 0 });
  
  const [selectedToReject, setSelectedToReject] = useState<Set<number>>(new Set());
  const [isRejecting, setIsRejecting] = useState(false);
  const [pendingAutoRun, setPendingAutoRun] = useState(false);
  const stopAuditRef = useRef(false);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // all, flagged, verified, unscanned
  const [page, setPage] = useState(1);
  const perPage = 50;

  useEffect(() => {
    fetch('/api/signals/audit/funnel-stats')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setFunnels(data);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedFunnel) {
      setCompanies([]);
      setAuditResults({});
      setSelectedToReject(new Set());
      return;
    }

    setIsLoading(true);
    fetch(`/api/signals/audit/companies?funnelId=${selectedFunnel}`)
      .then(res => res.json())
      .then(data => {
        if (data.companies) {
          setCompanies(data.companies);
          
          // Pre-populate audit results from database
          const initialAuditResults: Record<number, AuditResult> = {};
          data.companies.forEach((c: Company) => {
            if (c.audit_is_false_positive !== null && c.audit_is_false_positive !== undefined) {
              initialAuditResults[c.id] = {
                id: c.id,
                is_false_positive: c.audit_is_false_positive,
                flag_reason: c.audit_flag_reason || '',
                confidence: c.audit_confidence,
                reasoning: c.audit_reasoning,
                dev_signals: c.audit_dev_signals,
                dev_signal_score: c.audit_dev_signal_score,
              };
            }
          });
          setAuditResults(initialAuditResults);
          
          setSelectedToReject(new Set());
          setPage(1);
          setSearchQuery('');
          setCategoryFilter('all');
          setStatusFilter('all');
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [selectedFunnel]);

  // Derived Data: Categories
  const uniqueCategories = useMemo(() => {
    const cats = new Set(companies.map(c => c.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [companies]);

  // Derived Data: Filtered Companies
  const filteredCompanies = useMemo(() => {
    let result = companies;

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => 
        (c.company_name?.toLowerCase().includes(q) || c.domain?.toLowerCase().includes(q))
      );
    }

    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter(c => c.category === categoryFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(c => {
        const res = auditResults[c.id];
        if (statusFilter === 'unscanned') return !res;
        if (statusFilter === 'flagged') return res?.is_false_positive;
        if (statusFilter === 'verified') return res && !res.is_false_positive;
        return true;
      });
    }

    return result;
  }, [companies, searchQuery, categoryFilter, statusFilter, auditResults]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, categoryFilter, statusFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredCompanies.length / perPage);
  const paginatedCompanies = useMemo(() => {
    const start = (page - 1) * perPage;
    return filteredCompanies.slice(start, start + perPage);
  }, [filteredCompanies, page, perPage]);

  const runAuditor = async () => {
    if (filteredCompanies.length === 0 || isAuditing) return;
    
    setIsAuditing(true);
    
    const CHUNK_SIZE = 20;
    const newResults: Record<number, AuditResult> = { ...auditResults };
    
    // Only audit companies in the *current filtered view* that haven't been audited yet
    const toAudit = filteredCompanies.filter(c => !newResults[c.id]);
    setAuditProgress({ current: 0, total: toAudit.length });

    try {
      stopAuditRef.current = false;
      for (let i = 0; i < toAudit.length; i += CHUNK_SIZE) {
        if (stopAuditRef.current) {
          console.log('Audit stopped by user');
          break;
        }

        const chunk = toAudit.slice(i, i + CHUNK_SIZE);
        
        const res = await fetch('/api/signals/audit/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companies: chunk }),
        });
        
        if (res.ok) {
          const data = await res.json();
          const results = data.results || [];
          
          results.forEach((r: AuditResult) => {
            newResults[r.id] = r;
            if (r.is_false_positive) {
              setSelectedToReject(prev => {
                const next = new Set(prev);
                next.add(r.id);
                return next;
              });
            }
          });
          
          setAuditResults({ ...newResults });
          setAuditProgress(prev => ({ ...prev, current: prev.current + chunk.length }));
        }
      }
    } catch (error) {
      console.error('Audit failed:', error);
    } finally {
      setIsAuditing(false);
    }
  };

  // Auto-run logic when clicking 'Run' from the empty state card
  useEffect(() => {
    if (pendingAutoRun && !isLoading && filteredCompanies.length > 0) {
      runAuditor();
      setPendingAutoRun(false);
    }
  }, [pendingAutoRun, isLoading, filteredCompanies.length]); // Intentionally omitting runAuditor to avoid loops

  const toggleRejectSelection = (id: number) => {
    setSelectedToReject(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedToReject.size === filteredCompanies.length) {
      setSelectedToReject(new Set());
    } else {
      setSelectedToReject(new Set(filteredCompanies.map(c => c.id)));
    }
  };

  const bulkReject = async () => {
    if (selectedToReject.size === 0 || isRejecting) return;
    
    setIsRejecting(true);
    try {
      const res = await fetch('/api/signals/audit/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyIds: Array.from(selectedToReject) }),
      });
      
      if (res.ok) {
        setCompanies(prev => prev.filter(c => !selectedToReject.has(c.id)));
        setSelectedToReject(new Set());
      }
    } catch (error) {
      console.error('Reject failed:', error);
    } finally {
      setIsRejecting(false);
    }
  };

  const flaggedCount = Object.values(auditResults).filter(r => r.is_false_positive).length;
  const unscannedInView = filteredCompanies.filter(c => !auditResults[c.id]).length;

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-8 py-6 border-b border-border bg-card">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ICP Auditor</h1>
            <p className="text-sm text-muted-foreground mt-1">
              AI-powered secondary filter to catch "sneaky" false positives.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Select value={selectedFunnel?.toString() || ''} onValueChange={(val) => setSelectedFunnel(Number(val))}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select a Funnel..." />
            </SelectTrigger>
            <SelectContent>
              {funnels.map(f => (
                <SelectItem key={f.id} value={f.id.toString()}>{f.name} ({f.source})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {isAuditing ? (
            <Button
              onClick={() => { stopAuditRef.current = true; }}
              variant="destructive"
              className="gap-2"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              Stop Auditing ({auditProgress.current}/{auditProgress.total})
            </Button>
          ) : (
            <Button
              onClick={runAuditor}
              disabled={!selectedFunnel || unscannedInView === 0}
              className="gap-2"
            >
              <Play className="w-4 h-4" />
              Run AI on Filtered View ({unscannedInView})
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-8 relative flex flex-col gap-6">
        {!selectedFunnel ? (
          <div className="h-full max-w-6xl mx-auto w-full flex flex-col space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Select a Funnel</h2>
                <p className="text-sm text-muted-foreground mt-1">Choose a funnel to audit its ICP=Yes companies.</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {funnels.map(f => {
                const total = f.icp_yes_count || 0;
                const audited = f.audited_count || 0;
                const progress = total > 0 ? (audited / total) * 100 : 0;
                const isComplete = total > 0 && audited === total;
                
                return (
                  <div 
                    key={f.id}
                    onClick={() => setSelectedFunnel(f.id)}
                    className="group relative flex flex-col p-5 bg-card border border-border rounded-xl shadow-sm hover:shadow-md hover:border-primary/50 transition-all cursor-pointer overflow-hidden"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-foreground line-clamp-1">{f.name}</h3>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground uppercase tracking-wider">
                            {f.source}
                          </span>
                        </div>
                      </div>
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border",
                        isComplete ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-primary/5 text-primary border-primary/10"
                      )}>
                        {isComplete ? <CheckCircle2 className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                      </div>
                    </div>
                    
                    <div className="mt-auto space-y-4">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex flex-col">
                          <span className="text-2xl font-bold text-foreground">{formatNumber(total)}</span>
                          <span className="text-xs text-muted-foreground font-medium">ICP=Yes</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-lg font-semibold text-foreground">{formatNumber(audited)}</span>
                          <span className="text-xs text-muted-foreground font-medium">Audited</span>
                        </div>
                        <div className="flex flex-col items-end text-destructive">
                          <span className="text-lg font-bold">{formatNumber(f.false_positives_count || 0)}</span>
                          <span className="text-xs font-medium">Flagged</span>
                        </div>
                      </div>
                      
                      <div className="space-y-1.5">
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div 
                            className={cn("h-full rounded-full transition-all duration-500", isComplete ? "bg-emerald-500" : "bg-primary")}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                      
                      <Button 
                        variant={isComplete ? "outline" : "default"} 
                        className={cn("w-full h-8 text-xs gap-1.5 transition-all opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0", isComplete && "hover:bg-emerald-500/10 hover:text-emerald-500 hover:border-emerald-500/20")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFunnel(f.id);
                          if (!isComplete && total > 0) {
                            setPendingAutoRun(true);
                          }
                        }}
                      >
                        {isComplete ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            View Results
                          </>
                        ) : total === 0 ? (
                          <>
                            <Search className="w-3.5 h-3.5" />
                            View Empty Funnel
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            Run AI Auditor
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
              
              {funnels.length === 0 && (
                <div className="col-span-full py-12 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-xl">
                  <Shield className="w-8 h-8 text-muted-foreground/40 mb-3" />
                  <p>No funnels found.</p>
                </div>
              )}
            </div>
          </div>
        ) : isLoading ? (
          <div className="h-full flex items-center justify-center text-primary">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : (
          <>
            {/* Stats & Filters */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {companies.length} Total Companies Classified as "Yes"
                </h2>
                {flaggedCount > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
                    <AlertTriangle className="w-4 h-4" />
                    {flaggedCount} Total False Positives Flagged
                  </div>
                )}
              </div>

              {/* Filter Bar */}
              <div className="flex items-center gap-2 flex-wrap bg-card border border-border p-3 rounded-xl shadow-sm">
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search domain or company..."
                    className="pl-9 h-9 bg-background border-border text-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="h-6 w-px bg-border mx-1" />

                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[200px] h-9 text-xs">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {uniqueCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[160px] h-9 text-xs">
                    <SelectValue placeholder="Audit Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="unscanned">Unscanned</SelectItem>
                    <SelectItem value="flagged">Flagged</SelectItem>
                    <SelectItem value="verified">Verified ICP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Table */}
            <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm flex-1 flex flex-col">
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-6 py-4 font-medium text-muted-foreground w-10">
                        <Checkbox
                          checked={filteredCompanies.length > 0 && selectedToReject.size === filteredCompanies.length}
                          onCheckedChange={toggleSelectAll}
                          className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                        />
                      </th>
                      <th className="px-6 py-4 font-medium text-muted-foreground w-56">Company</th>
                      <th className="px-6 py-4 font-medium text-muted-foreground w-40">Category</th>
                      <th className="px-6 py-4 font-medium text-muted-foreground w-16">Dev Signals</th>
                      <th className="px-6 py-4 font-medium text-muted-foreground">Classification Reason</th>
                      <th className="px-6 py-4 font-medium text-muted-foreground w-64">Audit Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedCompanies.map(company => {
                      const result = auditResults[company.id];
                      const isFlagged = result?.is_false_positive;
                      const isSelected = selectedToReject.has(company.id);

                      return (
                        <tr 
                          key={company.id} 
                          className={cn(
                            "transition-colors group",
                            isFlagged ? "bg-destructive/5 hover:bg-destructive/10" : "hover:bg-muted/30",
                            isSelected && !isFlagged ? "bg-muted/50" : ""
                          )}
                        >
                          <td className="px-6 py-4">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleRejectSelection(company.id)}
                              className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                              disabled={!result}
                            />
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-foreground">{company.company_name}</div>
                            <div className="text-xs text-muted-foreground mt-1">{company.domain}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-muted text-foreground border border-border">
                              {company.category}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {result ? (
                              <div className="flex items-center gap-1">
                                <span className={cn(
                                  "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold",
                                  (result.dev_signal_score || 0) >= 3 ? "bg-emerald-500/15 text-emerald-500" :
                                  (result.dev_signal_score || 0) > 0 ? "bg-amber-500/15 text-amber-500" :
                                  "bg-muted text-muted-foreground"
                                )}>
                                  {result.dev_signal_score || 0}/10
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-xs text-muted-foreground line-clamp-2 group-hover:line-clamp-none transition-all">
                              {company.classification_reason}
                            </p>
                            {result?.dev_signals && (
                              <p className="text-[10px] text-emerald-500/80 mt-1 line-clamp-1 group-hover:line-clamp-none">
                                🛡️ {result.dev_signals}
                              </p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {!result ? (
                              <span className="text-xs text-muted-foreground">Unscanned</span>
                            ) : isFlagged ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-destructive font-medium text-xs">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  False Positive
                                  <span className="text-[10px] font-normal opacity-70">({result.confidence}/10)</span>
                                </div>
                                <p className="text-[11px] text-destructive/80">{result.flag_reason}</p>
                                {result.reasoning && (
                                  <p className="text-[10px] text-muted-foreground line-clamp-2 group-hover:line-clamp-none">{result.reasoning}</p>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-emerald-500 font-medium text-xs">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Verified ICP
                                </div>
                                {result.reasoning && (
                                  <p className="text-[10px] text-muted-foreground line-clamp-1 group-hover:line-clamp-none">{result.reasoning}</p>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredCompanies.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                          No companies found matching the current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-card">
                <div className="text-xs text-muted-foreground">
                  {filteredCompanies.length > 0 ? `${(page - 1) * perPage + 1}–${Math.min(page * perPage, filteredCompanies.length)}` : '0'} of {formatNumber(filteredCompanies.length)}
                  {selectedToReject.size > 0 && (
                    <span className="ml-2 text-primary font-medium">({selectedToReject.size} selected for rejection)</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1 || isLoading}
                    className="h-7 text-xs"
                  >
                    <ChevronLeft className="h-3.5 w-3.5 mr-1" />Prev
                  </Button>
                  <div className="text-xs font-medium px-2">{page} / {Math.max(1, totalPages)}</div>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || isLoading}
                    className="h-7 text-xs"
                  >
                    Next<ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
            {/* Spacer for floating action bar */}
            <div className="h-24 shrink-0"></div>
          </>
        )}

        {/* Floating Action Bar */}
        <div className={cn(
          "absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-4 bg-card border border-border rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all duration-300 ease-out z-50",
          selectedToReject.size > 0 ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0 pointer-events-none"
        )}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-destructive/10 text-destructive flex items-center justify-center font-bold text-sm">
              {selectedToReject.size}
            </div>
            <span className="text-sm font-medium text-foreground">
              Selected for rejection
            </span>
          </div>
          
          <div className="w-px h-8 bg-border mx-2" />
          
          <Button
            onClick={bulkReject}
            disabled={isRejecting}
            variant="destructive"
            className="gap-2"
          >
            {isRejecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            Bulk Reject (Set ICP = No)
          </Button>
        </div>
      </div>
    </div>
  );
}
