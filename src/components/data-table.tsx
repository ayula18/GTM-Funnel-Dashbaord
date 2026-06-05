'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronLeft, ChevronRight, Search, ExternalLink, Edit2,
  ArrowUpDown, ArrowUp, ArrowDown, GitMerge
} from "lucide-react";
import { formatCurrency, formatNumber, cn, errorMessage } from '@/lib/utils';
import type { CompanyRow } from '@/lib/types';
import { EditCompanyDialog } from './edit-company-dialog';
import { CheckboxFilter, RangeFilter, ActiveFilterPills } from './column-filters';
import { AcquiredBadge } from './acquired-badge';
import { toast } from 'sonner';

const DISCARD_REASON_LABELS: Record<string, string> = {
  not_in_apollo: 'Not in Apollo',
  low_employees: 'Low Employees',
  not_icp: 'Not ICP',
  low_funding: 'Low Funding',
  dead_domain: 'Dead Domain',
  scrape_failed: 'Scrape Failed',
  domain_redirect: 'Domain Redirect / Duplicate'
};

export type ViewMode = 'main' | 'raw' | 'apollo' | 'employees' | 'icp' | 'funding' | 'discarded' | 'review';

interface DataTableProps {
  funnelId?: number;
  filters?: Record<string, string>;
  viewMode?: ViewMode;
  showDiscardColumn?: boolean;
  showSelection?: boolean;
  onSelectionChange?: (ids: number[]) => void;
}

export function DataTable({ funnelId, filters: externalFilters, viewMode = 'main', showDiscardColumn, showSelection, onSelectionChange }: DataTableProps) {
  const [data, setData] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [editingCompany, setEditingCompany] = useState<CompanyRow | null>(null);
  const [expandedText, setExpandedText] = useState<{title: string, content: string} | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState('c.id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filter options (for dropdowns)
  const [filterOptions, setFilterOptions] = useState<Record<string, Array<{value: string; count: number}>>>({});
  
  // Active multi-value filters
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  
  // Range filters
  const [rangeFilters, setRangeFilters] = useState<Record<string, {min: string; max: string}>>({});

  // M&A / subsidiary-only toggle
  const [maOnly, setMaOnly] = useState(false);

  const perPage = 50;

  // Shared scope params (funnel + step/tab + search + active filters) — used
  // for BOTH the table rows AND the facet counts, so the dropdown numbers
  // always match the current view. Excludes pagination/sort.
  const scopeParams = useCallback(() => {
    const p = new URLSearchParams();
    if (funnelId) p.set('funnel_id', String(funnelId));
    if (search) p.set('search', search);

    // External filters (funnel step / tab)
    if (externalFilters) {
      for (const [k, v] of Object.entries(externalFilters)) {
        if (v) p.set(k, v);
      }
    }
    // Column checkbox filters
    for (const [key, values] of Object.entries(columnFilters)) {
      if (values.length > 0) p.set(key, values.join(','));
    }
    // Range filters
    for (const [key, range] of Object.entries(rangeFilters)) {
      if (range.min) p.set(`min_${key}`, range.min);
      if (range.max) p.set(`max_${key}`, range.max);
    }
    if (maOnly) p.set('is_subsidiary', '1');
    return p.toString();
  }, [funnelId, search, externalFilters, columnFilters, rangeFilters, maOnly]);

  // Fetch facet options + counts, scoped exactly like the table.
  useEffect(() => {
    fetch(`/api/filters?${scopeParams()}`)
      .then(res => res.json())
      .then(data => setFilterOptions(data))
      .catch(() => {});
  }, [scopeParams]);

  const buildFilterUrl = useCallback(() => {
    let url = `/api/companies?page=${page}&per_page=${perPage}&sort_by=${sortBy}&sort_order=${sortOrder}`;
    const scope = scopeParams();
    if (scope) url += `&${scope}`;
    return url;
  }, [page, sortBy, sortOrder, scopeParams]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(buildFilterUrl());
      const result = await res.json();
      setData(result.data || []);
      setTotalPages(result.pagination?.totalPages || 1);
      setTotalCount(result.pagination?.total || 0);
    } catch (error) {
      console.error("Failed to fetch table data", error);
    } finally {
      setLoading(false);
    }
  }, [buildFilterUrl]);

  useEffect(() => {
    setPage(1);
  }, [search, externalFilters, columnFilters, rangeFilters, maOnly]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    onSelectionChange?.(Array.from(selectedIds));
  }, [selectedIds, onSelectionChange]);

  const handleSaveEdit = () => {
    setEditingCompany(null);
    fetchData();
  };

  const handleForcePass = async (id: number) => {
    try {
      const res = await fetch(`/api/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual_icp: 'Yes' })
      });
      if (!res.ok) throw new Error('Failed to update');
      toast.success('Company forcefully passed to ICP');
      
      // If we are viewing a specific funnel step, we might want to re-trigger backend computation,
      // but patching manual_icp already clears the discard flags.
      // Refreshing the table will remove it from the discarded view.
      fetchData();
    } catch (err) {
      toast.error('Failed to force pass', { description: errorMessage(err) });
    }
  };

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortOrder('asc');
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === data.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.map(r => r.id)));
    }
  };

  const SortHeader = ({ col, children }: { col: string; children: React.ReactNode }) => (
    <button onClick={() => toggleSort(col)} className="flex items-center gap-1 hover:text-foreground transition-colors">
      {children}
      {sortBy === col ? (
        sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-30" />
      )}
    </button>
  );

  const IcpBadge = ({ decision, manual }: { decision: string | null, manual?: string | null }) => {
    let bgClass = "";
    if (decision === 'Yes') { bgClass = "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"; }
    else if (decision === 'No') { bgClass = "bg-red-500/10 text-red-600 border-red-500/20"; }
    else if (decision === 'Review') { bgClass = "bg-amber-500/10 text-amber-600 border-amber-500/20"; }

    return (
      <div className="flex items-center gap-1">
        {decision ? <Badge className={bgClass}>{decision}</Badge> : <span className="text-muted-foreground">—</span>}
        {!!manual && (
          <span className="text-[9px] font-medium tracking-wider uppercase text-blue-500/70 border border-blue-500/20 bg-blue-500/10 px-1 py-0.5 rounded leading-none">Manual</span>
        )}
      </div>
    );
  };

  // Build active filter display
  const activeFilterDisplay: Record<string, string> = {};
  for (const [k, v] of Object.entries(columnFilters)) {
    if (v.length > 0) activeFilterDisplay[k] = v.join(', ');
  }
  for (const [k, v] of Object.entries(rangeFilters)) {
    if (v.min || v.max) activeFilterDisplay[k] = `${v.min || '∞'} - ${v.max || '∞'}`;
  }

  return (
    <div className="space-y-3">
      {/* Search + Filters Row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search domain or company..."
            className="pl-9 h-9 bg-card border-border"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="h-6 w-px bg-border mx-1" />

        <CheckboxFilter
          label="ICP"
          options={filterOptions.icp_decision || []}
          selected={columnFilters.icp_decision || []}
          onChange={v => setColumnFilters(prev => ({ ...prev, icp_decision: v }))}
        />
        <CheckboxFilter
          label="Classification"
          options={filterOptions.company_classification || []}
          selected={columnFilters.company_classification || []}
          onChange={v => setColumnFilters(prev => ({ ...prev, company_classification: v }))}
        />
        <CheckboxFilter
          label="Category"
          options={filterOptions.category || []}
          selected={columnFilters.category || []}
          onChange={v => setColumnFilters(prev => ({ ...prev, category: v }))}
        />
        <CheckboxFilter
          label="Confidence"
          options={filterOptions.confidence || []}
          selected={columnFilters.confidence || []}
          onChange={v => setColumnFilters(prev => ({ ...prev, confidence: v }))}
        />
        <CheckboxFilter
          label="Company Type"
          options={filterOptions.company_type || []}
          selected={columnFilters.company_type || []}
          onChange={v => setColumnFilters(prev => ({ ...prev, company_type: v }))}
        />
        <CheckboxFilter
          label="Manual Override"
          options={filterOptions.manual_icp || []}
          selected={columnFilters.manual_icp || []}
          onChange={v => setColumnFilters(prev => ({ ...prev, manual_icp: v }))}
        />
        <CheckboxFilter
          label="Country"
          options={filterOptions.company_country || []}
          selected={columnFilters.company_country || []}
          onChange={v => setColumnFilters(prev => ({ ...prev, company_country: v }))}
        />

        <RangeFilter
          label="Employees"
          minValue={rangeFilters.employees?.min || ''}
          maxValue={rangeFilters.employees?.max || ''}
          onChange={(min, max) => setRangeFilters(prev => ({ ...prev, employees: { min, max } }))}
        />
        <RangeFilter
          label="Funding"
          minValue={rangeFilters.funding?.min || ''}
          maxValue={rangeFilters.funding?.max || ''}
          onChange={(min, max) => setRangeFilters(prev => ({ ...prev, funding: { min, max } }))}
          formatAs="currency"
        />
        <RangeFilter
          label="Revenue"
          minValue={rangeFilters.revenue?.min || ''}
          maxValue={rangeFilters.revenue?.max || ''}
          onChange={(min, max) => setRangeFilters(prev => ({ ...prev, revenue: { min, max } }))}
          formatAs="currency"
        />

        <div className="h-6 w-px bg-border mx-1" />

        <Button
          variant={maOnly ? 'default' : 'outline'}
          size="sm"
          className="h-9 gap-1.5 text-xs"
          onClick={() => setMaOnly(v => !v)}
          title="Show only acquired / subsidiary companies (M&A)"
        >
          <GitMerge className="w-3.5 h-3.5" />
          M&A only
        </Button>
      </div>

      {/* Active filter pills */}
      <ActiveFilterPills
        filters={activeFilterDisplay}
        onRemove={key => {
          if (key in columnFilters) {
            setColumnFilters(prev => { const n = {...prev}; delete n[key]; return n; });
          }
          if (key in rangeFilters) {
            setRangeFilters(prev => { const n = {...prev}; delete n[key]; return n; });
          }
        }}
        onClearAll={() => { setColumnFilters({}); setRangeFilters({}); }}
      />

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50 whitespace-nowrap">
              <TableRow className="border-border hover:bg-transparent">
                {showSelection && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={data.length > 0 && selectedIds.size === data.length}
                      onCheckedChange={toggleSelectAll}
                      className="w-3.5 h-3.5"
                    />
                  </TableHead>
                )}
                <TableHead className="w-[180px]"><SortHeader col="c.company_name">Company</SortHeader></TableHead>
                <TableHead><SortHeader col="c.domain">Domain</SortHeader></TableHead>
                {['main', 'apollo', 'employees', 'icp', 'funding'].includes(viewMode) && <TableHead>Apollo?</TableHead>}
                {['main', 'icp', 'funding'].includes(viewMode) && <TableHead>ICP</TableHead>}
                {['main', 'icp'].includes(viewMode) && <TableHead>Classification</TableHead>}
                {['main', 'icp'].includes(viewMode) && <TableHead>Category</TableHead>}
                {['main', 'icp'].includes(viewMode) && <TableHead>Confidence</TableHead>}
                {['main', 'employees'].includes(viewMode) && <TableHead className="text-right"><SortHeader col="c.employee_reo">Emp (Reo)</SortHeader></TableHead>}
                {['main', 'apollo', 'employees'].includes(viewMode) && <TableHead className="text-right"><SortHeader col="c.apollo_employees">Emp (Apollo)</SortHeader></TableHead>}
                {['main', 'apollo', 'funding'].includes(viewMode) && <TableHead className="text-right"><SortHeader col="c.total_funding">Funding (Apollo)</SortHeader></TableHead>}
                {['main', 'apollo', 'funding'].includes(viewMode) && <TableHead className="text-right"><SortHeader col="c.annual_revenue">Revenue (Apollo)</SortHeader></TableHead>}
                {['main', 'funding'].includes(viewMode) && <TableHead className="text-right"><SortHeader col="c.crunchbase_funding">Funding (CB)</SortHeader></TableHead>}
                {['main', 'funding'].includes(viewMode) && <TableHead className="text-right"><SortHeader col="c.revenue_reo">Revenue (Reo)</SortHeader></TableHead>}

                {['main'].includes(viewMode) && <TableHead>LinkedIn (Apollo)</TableHead>}
                {['main', 'icp'].includes(viewMode) && <TableHead className="max-w-[200px]">Reason</TableHead>}
                {['main', 'employees', 'icp', 'funding'].includes(viewMode) && <TableHead className="text-center">NetNew</TableHead>}
                {['main', 'review'].includes(viewMode) && <TableHead className="max-w-[200px]">Notes</TableHead>}
                {showDiscardColumn && <TableHead>Discard Reason</TableHead>}
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array(8).fill(0).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    {showSelection && <TableCell><div className="h-4 w-4 bg-muted animate-pulse rounded" /></TableCell>}
                    {Array(showDiscardColumn ? 16 : 15).fill(0).map((_, j) => (
                      <TableCell key={j}><div className="h-4 w-16 bg-muted animate-pulse rounded" /></TableCell>
                    ))}
                    <TableCell></TableCell>
                  </TableRow>
                ))
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={showDiscardColumn ? 20 : 19} className="h-32 text-center text-muted-foreground">
                    No companies found matching the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row) => (
                  <TableRow key={row.id} className={cn(
                    "border-border hover:bg-muted/30",
                    selectedIds.has(row.id) && "bg-primary/5"
                  )}>
                    {showSelection && (
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(row.id)}
                          onCheckedChange={() => toggleSelect(row.id)}
                          className="w-3.5 h-3.5"
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium max-w-[180px]" title={row.company_name ?? undefined}>
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">
                          {row.company_name || <span className="text-muted-foreground italic">Unknown</span>}
                        </span>
                        <AcquiredBadge subsidiaryOf={row.subsidiary_of} variant="compact" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <a 
                          href={`https://${row.domain}`} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline text-sm"
                        >
                          {row.domain}
                          <ExternalLink className="w-3 h-3 opacity-50" />
                        </a>
                        {row.merged_domains && (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-muted text-muted-foreground whitespace-nowrap" title={row.merged_domains.split(',').join('\n')}>
                            +{row.merged_domains.split(',').length} alias
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    {['main', 'apollo', 'employees', 'icp', 'funding'].includes(viewMode) && (
                      <TableCell>
                        {row.is_in_apollo ? (
                          <span className="text-emerald-600 text-xs font-medium">Yes</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">No</span>
                        )}
                      </TableCell>
                    )}
                    {['main', 'icp', 'funding'].includes(viewMode) && (
                      <TableCell><IcpBadge decision={row.icp_decision} manual={row.manual_icp} /></TableCell>
                    )}
                    {['main', 'icp'].includes(viewMode) && (
                      <TableCell>
                        {row.company_classification ? (
                          <Badge variant="secondary" className="font-normal text-[11px]">{row.company_classification}</Badge>
                        ) : '—'}
                      </TableCell>
                    )}
                    {['main', 'icp'].includes(viewMode) && (
                      <TableCell className="text-xs truncate max-w-[130px]" title={row.category ?? undefined}>
                        {row.category || '—'}
                      </TableCell>
                    )}
                    {['main', 'icp'].includes(viewMode) && (
                      <TableCell>
                        {row.confidence ? (
                          <span className={cn(
                            "text-[11px] font-medium px-1.5 py-0.5 rounded",
                            row.confidence === 'High' ? "text-emerald-600 bg-emerald-500/10" :
                            row.confidence === 'Medium' ? "text-amber-600 bg-amber-500/10" :
                            "text-red-600 bg-red-500/10"
                          )}>
                            {row.confidence}
                          </span>
                        ) : '—'}
                      </TableCell>
                    )}
                    {['main', 'employees'].includes(viewMode) && (
                      <TableCell className="text-right text-sm tabular-nums">
                        {row.employee_reo ? (
                          <span className="font-medium">{formatNumber(row.employee_reo)}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    )}
                    {['main', 'apollo', 'employees'].includes(viewMode) && (
                      <TableCell className="text-right text-sm tabular-nums">
                        {row.apollo_employees ? (
                          <span>{formatNumber(row.apollo_employees)}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    )}
                    {['main', 'apollo', 'funding'].includes(viewMode) && (
                      <TableCell className="text-right text-sm tabular-nums">
                        {row.total_funding ? (
                          <span className="text-emerald-600 font-medium">{formatCurrency(row.total_funding)}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    )}
                    {['main', 'apollo', 'funding'].includes(viewMode) && (
                      <TableCell className="text-right text-sm tabular-nums">
                        {row.annual_revenue ? (
                          <span className="text-violet-600 font-medium">{formatCurrency(row.annual_revenue)}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    )}
                    {['main', 'funding'].includes(viewMode) && (
                      <TableCell className="text-right text-sm tabular-nums">
                        {row.crunchbase_funding ? (
                          <span className="text-blue-600 font-medium">{formatCurrency(row.crunchbase_funding)}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    )}
                    {['main', 'funding'].includes(viewMode) && (
                      <TableCell className="text-right text-sm tabular-nums">
                        {row.revenue_reo ? (
                          <span className="text-violet-600 font-medium">{formatCurrency(row.revenue_reo)}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    )}

                    {['main'].includes(viewMode) && (
                      <TableCell>
                        {row.company_linkedin_url ? (
                          <a href={row.company_linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1 text-xs">
                            View <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                    )}
                    {['main', 'icp'].includes(viewMode) && (
                      <TableCell className="max-w-[200px]">
                        {row.classification_reason ? (
                          <div 
                            className="text-xs truncate text-muted-foreground cursor-pointer hover:text-foreground hover:underline transition-colors"
                            onClick={() => setExpandedText({ title: `Reason: ${row.company_name || row.domain}`, content: row.classification_reason ?? '' })}
                          >
                            {row.classification_reason}
                          </div>
                        ) : '—'}
                      </TableCell>
                    )}
                    {['main', 'employees', 'icp', 'funding'].includes(viewMode) && (
                      <TableCell className="text-center">
                        {row.is_netnew === 1 ? (
                          <span className="text-blue-600 font-semibold text-sm">Yes</span>
                        ) : (
                          <span className="text-red-500 font-semibold text-sm">No</span>
                        )}
                      </TableCell>
                    )}
                    {['main', 'review'].includes(viewMode) && (
                      <TableCell className="max-w-[200px]">
                        {row.observations ? (
                          <div 
                            className="text-xs truncate text-muted-foreground cursor-pointer hover:text-foreground hover:underline transition-colors"
                            onClick={() => setExpandedText({ title: `Notes: ${row.company_name || row.domain}`, content: row.observations ?? '' })}
                          >
                            {row.observations}
                          </div>
                        ) : '—'}
                      </TableCell>
                    )}
                    {showDiscardColumn && (
                      <TableCell>
                        {row.discard_reason ? (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground border-muted">
                            {DISCARD_REASON_LABELS[row.discard_reason] || row.discard_reason}
                          </Badge>
                        ) : '—'}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      {showDiscardColumn && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-xs h-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 mr-1"
                          onClick={() => handleForcePass(row.id)}
                          title="Force Pass to Final Step"
                        >
                          Force Pass
                        </Button>
                      )}
                      <Button 
                        variant="ghost" size="icon" 
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => setEditingCompany(row)}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between pb-20 pt-2">
        <div className="text-xs text-muted-foreground">
          {data.length > 0 ? `${(page - 1) * perPage + 1}–${Math.min(page * perPage, totalCount)}` : '0'} of {formatNumber(totalCount)}
          {selectedIds.size > 0 && (
            <span className="ml-2 text-primary font-medium">({selectedIds.size} selected)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="h-7 text-xs"
          >
            <ChevronLeft className="h-3.5 w-3.5 mr-1" />Prev
          </Button>
          <div className="text-xs font-medium px-2">{page} / {totalPages}</div>
          <Button
            variant="outline" size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading || totalPages === 0}
            className="h-7 text-xs"
          >
            Next<ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>

      {editingCompany && (
        <EditCompanyDialog 
          company={editingCompany}
          open={!!editingCompany}
          onOpenChange={(o) => !o && setEditingCompany(null)}
          onSave={handleSaveEdit}
        />
      )}

      <Dialog open={!!expandedText} onOpenChange={(open) => !open && setExpandedText(null)}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-lg">{expandedText?.title}</DialogTitle>
          </DialogHeader>
          <div className="text-sm whitespace-pre-wrap mt-4 text-muted-foreground leading-relaxed">
            {expandedText?.content}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
