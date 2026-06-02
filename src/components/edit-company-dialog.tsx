'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES } from '@/lib/types';
import { toast } from 'sonner';

interface EditCompanyDialogProps {
  company: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}

export function EditCompanyDialog({ company, open, onOpenChange, onSave }: EditCompanyDialogProps) {
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [name, setName] = useState(company.company_name || '');
  const [icpDecision, setIcpDecision] = useState(company.icp_decision || '');
  const [manualIcp, setManualIcp] = useState(company.manual_icp || '');
  const [category, setCategory] = useState(company.category || '');
  const [classification, setClassification] = useState(company.company_classification || '');
  const [confidence, setConfidence] = useState(company.confidence || '');
  const [notes, setNotes] = useState(company.observations || '');
  const [mergeDomain, setMergeDomain] = useState('');
  const [merging, setMerging] = useState(false);
  const [mergedCompanies, setMergedCompanies] = useState<any[]>([]);
  const [unmergingId, setUnmergingId] = useState<number | null>(null);

  // Fetch full company details when opened (to get merged companies)
  useEffect(() => {
    if (open && company?.id) {
      fetch(`/api/companies/${company.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.merged_companies) {
            setMergedCompanies(data.merged_companies);
          }
        })
        .catch(console.error);
    } else {
      setMergedCompanies([]);
    }
  }, [open, company?.id]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const payload = {
        company_name: name,
        icp_decision: icpDecision || null,
        manual_icp: manualIcp || null,
        category: category || null,
        company_classification: classification || null,
        confidence: confidence || null,
        observations: notes,
        needs_manual_review: 0 // clear review flag on manual edit
      };

      const res = await fetch(`/api/companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Failed to save');
      
      toast.success('Company updated');
      onSave();
    } catch (error: any) {
      toast.error('Error updating company', { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleMerge = async () => {
    if (!mergeDomain.trim()) return;
    setMerging(true);
    try {
      // 1. Resolve domain to company ID
      const res1 = await fetch(`/api/companies?search=${encodeURIComponent(mergeDomain)}&per_page=1`);
      const data1 = await res1.json();
      if (!data1.data || data1.data.length === 0) {
        throw new Error('Target domain not found in database. Make sure it exists first.');
      }
      
      const targetId = data1.data[0].id;
      if (targetId === company.id) throw new Error('Cannot merge into itself');

      // 2. Call merge API
      const res2 = await fetch('/api/companies/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryId: targetId,
          secondaryId: company.id
        })
      });

      if (!res2.ok) {
        const err = await res2.json();
        throw new Error(err.error || 'Failed to merge');
      }

      toast.success(`Successfully merged into ${data1.data[0].domain}`);
      onSave();
    } catch (error: any) {
      toast.error('Merge failed', { description: error.message });
    } finally {
      setMerging(false);
    }
  };

  const handleUnmerge = async (secondaryId: number, domain: string) => {
    setUnmergingId(secondaryId);
    try {
      const res = await fetch('/api/companies/unmerge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: secondaryId })
      });

      if (!res.ok) throw new Error('Failed to unmerge');

      toast.success(`Successfully unmerged ${domain}`);
      setMergedCompanies(prev => prev.filter(c => c.id !== secondaryId));
      onSave();
    } catch (error: any) {
      toast.error('Unmerge failed', { description: error.message });
    } finally {
      setUnmergingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-card border-border">
        <DialogHeader>
          <DialogTitle>Edit Company: {company.domain}</DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">Company Name</Label>
            <Input 
              id="name" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              className="col-span-3 bg-card border-border" 
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">ICP Decision</Label>
            <div className="col-span-3">
              <Select value={icpDecision} onValueChange={setIcpDecision}>
                <SelectTrigger className="bg-card border-border">
                  <SelectValue placeholder="Select decision" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="Yes">Yes</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                  <SelectItem value="Review">Review</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Manual ICP</Label>
            <div className="col-span-3">
              <Select value={manualIcp} onValueChange={setManualIcp}>
                <SelectTrigger className="bg-card border-border">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="Yes">Yes</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                  <SelectItem value="Review">Review</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Category</Label>
            <div className="col-span-3">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-card border-border">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border max-h-[200px]">
                  {CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                  <SelectItem value="Not a Devtool">Not a Devtool</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Classification</Label>
            <div className="col-span-3">
              <Select value={classification} onValueChange={setClassification}>
                <SelectTrigger className="bg-card border-border">
                  <SelectValue placeholder="Select classification" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="DevTool">DevTool</SelectItem>
                  <SelectItem value="IT Services & Solutions">IT Services & Solutions</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Confidence</Label>
            <div className="col-span-3">
              <Select value={confidence} onValueChange={setConfidence}>
                <SelectTrigger className="bg-card border-border">
                  <SelectValue placeholder="Select confidence" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="notes" className="text-right pt-2">Notes / Obs.</Label>
            <Textarea 
              id="notes" 
              value={notes} 
              onChange={e => setNotes(e.target.value)} 
              className="col-span-3 bg-card border-border h-24" 
            />
          </div>
        </div>

        {/* Unmerge Section */}
        {mergedCompanies.length > 0 && (
          <div className="mt-2 pt-4 border-t border-border">
            <Label className="text-xs text-muted-foreground mb-3 block">Merged Domains (Aliases)</Label>
            <div className="space-y-2">
              {mergedCompanies.map(mc => (
                <div key={mc.id} className="flex items-center justify-between bg-muted/30 p-2 rounded-md border border-border">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{mc.company_name || 'Unknown'}</span>
                    <span className="text-xs text-muted-foreground">{mc.domain}</span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 text-xs"
                    disabled={unmergingId === mc.id || loading}
                    onClick={() => handleUnmerge(mc.id, mc.domain)}
                  >
                    {unmergingId === mc.id ? 'Unmerging...' : 'Unmerge'}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Merge Section */}
        <div className="mt-4 pt-4 border-t border-border">
          <Label className="text-xs text-muted-foreground mb-2 block">Danger Zone: Merge Company</Label>
          <div className="flex gap-2">
            <Input 
              placeholder="Target domain (e.g. explodingsgradients.com)" 
              value={mergeDomain} 
              onChange={e => setMergeDomain(e.target.value)} 
              className="bg-card border-border text-xs h-8"
            />
            <Button 
              variant="destructive" 
              size="sm" 
              className="h-8 text-xs" 
              onClick={handleMerge}
              disabled={merging || !mergeDomain.trim()}
            >
              {merging ? 'Merging...' : 'Merge Into'}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            This will fold all data from {company.domain} into the target domain. It will disappear from funnels but can be unmerged later.
          </p>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading || merging} className="border-border bg-transparent">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || merging} className="bg-primary hover:bg-primary/90 text-foreground">
            {loading ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
