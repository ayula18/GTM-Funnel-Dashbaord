'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Users, DollarSign, Globe, Link2, Tags } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const fetcher = (url: string) => fetch(url).then(res => res.json());

const buckets = [
  { id: 'enterprise', name: 'Enterprise', description: 'DevTool + 500+ Employees', color: 'bg-emerald-900', textColor: 'text-white' },
  { id: 'commercial', name: 'Commercial', description: 'DevTool + 200 - 499 Employees', color: 'bg-emerald-600', textColor: 'text-white' },
  { id: 'smb', name: 'SMB', description: 'DevTool + 50-199 Emp or Sales >= 2', color: 'bg-emerald-400', textColor: 'text-emerald-950' },
  { id: 'startup', name: 'Startup', description: 'DevTool + <50 Emp & Funded or Sales=1', color: 'bg-emerald-200', textColor: 'text-emerald-950' },
  { id: 'immature', name: 'Immature', description: 'DevTool + <50 Emp & No Funding & Sales=0', color: 'bg-yellow-100', textColor: 'text-yellow-900' },
  { id: 'future_icp', name: 'Future ICP', description: 'IT Services & Solutions and API/SDK companies', color: 'bg-rose-200', textColor: 'text-rose-950' },
  { id: 'irrelevant', name: 'Irrelevant', description: 'Not a DevTool company', color: 'bg-rose-300', textColor: 'text-rose-950' },
  { id: 'unclassified', name: 'Unclassified', description: 'Yet to be classified', color: 'bg-slate-100', textColor: 'text-slate-600' }
];

export default function CategorizationPage() {
  const [selectedFunnel, setSelectedFunnel] = useState<string>('all');
  const [netNewFilter, setNetNewFilter] = useState<string>('netnew');
  const [selectedCompany, setSelectedCompany] = useState<any | null>(null);
  
  // Dialog State
  const [salesCountInput, setSalesCountInput] = useState<string>('');
  const [manualBucketInput, setManualBucketInput] = useState<string>('none');
  const [manualReasonInput, setManualReasonInput] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

  const { data: funnelsData } = useSWR('/api/funnels', fetcher);
  
  const apiUrl = `/api/categorization?net_new=${netNewFilter}${selectedFunnel !== 'all' ? `&funnel_id=${selectedFunnel}` : ''}`;
    
  const { data: bucketData, isLoading, mutate } = useSWR(apiUrl, fetcher);

  const totalAccounts = bucketData?.buckets ? Object.values(bucketData.buckets).flat().length : 0;

  const handleCompanyClick = (company: any) => {
    setSelectedCompany(company);
    setSalesCountInput(company.sales_team_count?.toString() || '');
    setManualBucketInput(company.manual_gtm_bucket || 'none');
    setManualReasonInput(company.manual_gtm_reason || '');
  };

  const handleUpdateCompany = async () => {
    if (!selectedCompany) return;
    setIsUpdating(true);
    try {
      const salesVal = salesCountInput.trim() === '' ? null : parseInt(salesCountInput, 10);
      const bucketVal = manualBucketInput === 'none' ? null : manualBucketInput;
      const reasonVal = bucketVal && manualReasonInput.trim() !== '' ? manualReasonInput.trim() : null;

      await fetch(`/api/companies/${selectedCompany.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sales_team_count: salesVal,
          manual_gtm_bucket: bucketVal,
          manual_gtm_reason: reasonVal
        }),
      });
      await mutate(); // Re-fetch to re-bucketize
      setSelectedCompany(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#fafafa]">
      {/* Header */}
      <div className="flex-none bg-white border-b border-border/40 px-8 py-6">
        <div className="flex items-center justify-between max-w-[1600px] mx-auto">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">GTM Categorization</h1>
            <p className="text-sm text-slate-500 mt-1">
              Segment your final qualified accounts into actionable GTM buckets.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Select value={netNewFilter} onValueChange={(val) => setNetNewFilter(val || 'netnew')}>
              <SelectTrigger className="w-[180px] bg-white">
                <SelectValue placeholder="Net New Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="netnew">Only Net-New</SelectItem>
                <SelectItem value="not_netnew">Already in Master List</SelectItem>
                <SelectItem value="all">All Accounts</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedFunnel} onValueChange={(val) => setSelectedFunnel(val || 'all')}>
              <SelectTrigger className="w-[250px] bg-white">
                <SelectValue placeholder="Select Funnel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Funnels (Deduplicated)</SelectItem>
                {funnelsData?.map((f: any) => (
                  <SelectItem key={f.id} value={f.id.toString()}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-200 px-3 py-1 text-sm">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Total Enriched Accounts: {totalAccounts}
            </Badge>
          </div>
        </div>
      </div>

      {/* Board Area */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-8">
        <div className="flex gap-6 h-full min-w-max pb-4">
          {buckets.map((bucketDef) => {
            const companies = bucketData?.buckets?.[bucketDef.id] || [];
            return (
              <div key={bucketDef.id} className="flex flex-col w-[320px] h-full">
                {/* Column Header */}
                <div className={`flex-none rounded-t-xl p-4 ${bucketDef.color} ${bucketDef.textColor} shadow-sm border border-black/5`}>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg">{bucketDef.name}</h3>
                    <span className="text-sm font-semibold opacity-80 bg-black/10 px-2 py-0.5 rounded-full">
                      {companies.length}
                    </span>
                  </div>
                  <p className="text-xs opacity-90 leading-snug">
                    {bucketDef.description}
                  </p>
                </div>
                
                {/* Column Body (Drop Zone) */}
                <div className="flex-1 bg-slate-100/50 rounded-b-xl border border-t-0 border-slate-200 p-3 overflow-y-auto">
                  {isLoading && (
                    <div className="flex justify-center p-8">
                      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                    </div>
                  )}

                  {!isLoading && companies.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-4 border-2 border-dashed border-slate-200 rounded-lg">
                      <p className="text-sm text-slate-400">No accounts yet</p>
                    </div>
                  )}
                  
                  {!isLoading && companies.map((company: any) => (
                    <Card 
                      key={company.id} 
                      className={`mb-3 shadow-sm hover:shadow hover:border-slate-300 transition-all cursor-pointer group ${company.manual_gtm_bucket ? 'border-indigo-200 bg-indigo-50/30' : ''}`}
                      onClick={() => handleCompanyClick(company)}
                    >
                      <CardContent className="p-3">
                        <div className="flex justify-between items-start">
                          <p className="font-semibold text-sm truncate pr-2" title={company.company_name || company.domain}>
                            {company.company_name || company.domain}
                            {company.manual_gtm_bucket && <span className="ml-1 text-[10px] text-indigo-600 bg-indigo-100 px-1 py-0.5 rounded uppercase font-bold">* Manual</span>}
                          </p>
                          <div className="flex items-center gap-1 shrink-0 text-slate-400">
                            {company.website && (
                              <a href={company.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="hover:text-blue-500">
                                <Globe className="w-3.5 h-3.5" />
                              </a>
                            )}
                            {company.company_linkedin_url && (
                              <a href={company.company_linkedin_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="hover:text-blue-600">
                                <Link2 className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate mb-2">
                          {company.domain}
                        </p>
                        
                        <div className="flex flex-wrap gap-2 text-[10px] text-slate-600 mb-2">
                          {company.employees > 0 && (
                            <span className="flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded">
                              <Users className="w-3 h-3" /> {company.employees}
                            </span>
                          )}
                          {company.funding > 0 && (
                            <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-100" title="Funding">
                              <DollarSign className="w-3 h-3" /> 
                              Fund: {formatCurrency(company.funding)}
                            </span>
                          )}
                          {company.revenue > 0 && (
                            <span className="flex items-center gap-1 bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100" title="Revenue">
                              <DollarSign className="w-3 h-3" /> 
                              Rev: {formatCurrency(company.revenue)}
                            </span>
                          )}
                          {company.sales_team_count !== null && company.sales_team_count !== undefined && (
                            <span className="flex items-center gap-1 bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100">
                              Sales: {company.sales_team_count}
                            </span>
                          )}
                        </div>

                        {company.funnel_names && (
                          <div className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                            <Tags className="w-3 h-3 shrink-0" />
                            <span className="truncate" title={company.funnel_names}>{company.funnel_names}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Manual Data Dialog */}
      <Dialog open={!!selectedCompany} onOpenChange={(open) => !open && setSelectedCompany(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Company Data</DialogTitle>
            <DialogDescription>
              {selectedCompany?.company_name || selectedCompany?.domain}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            
            {/* Sales Reps */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="sales" className="text-right text-sm">
                Sales Reps
              </Label>
              <div className="col-span-3">
                <Input
                  id="sales"
                  type="number"
                  min="0"
                  value={salesCountInput}
                  onChange={(e) => setSalesCountInput(e.target.value)}
                  placeholder="Leave blank for unknown"
                />
              </div>
            </div>

            <div className="border-t border-slate-200"></div>

            {/* Manual Bucket Override */}
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="bucket" className="text-right text-sm pt-2">
                Bucket
              </Label>
              <div className="col-span-3 flex flex-col gap-2">
                <Select value={manualBucketInput} onValueChange={(val) => setManualBucketInput(val || 'none')}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Automatic (Computed)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Automatic (Computed)</SelectItem>
                    {buckets.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {manualBucketInput !== 'none' && (
                  <Textarea 
                    placeholder="Reason for overriding bucket... (required)"
                    value={manualReasonInput}
                    onChange={(e) => setManualReasonInput(e.target.value)}
                    className="text-sm"
                    rows={2}
                  />
                )}
              </div>
            </div>

            <p className="text-xs text-muted-foreground ml-[105px]">
              {manualBucketInput === 'none' 
                ? "Updating sales reps will automatically re-evaluate the company's GTM bucket based on the rules." 
                : "Manual overrides will lock this company into the selected bucket regardless of future employee or sales data changes."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedCompany(null)}>Cancel</Button>
            <Button onClick={handleUpdateCompany} disabled={isUpdating || (manualBucketInput !== 'none' && manualReasonInput.trim() === '')}>
              {isUpdating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
