'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatNumber, errorMessage } from '@/lib/utils';
import type { FunnelWithStats } from '@/lib/types';
import Link from 'next/link';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const FUNNEL_TAGS = [
  { id: 'default', label: 'No Tag', tailwind: 'border-border hover:border-primary/50', footerBg: 'bg-transparent', badge: '' },
  { id: 'green', label: 'Completed Funnel', tailwind: 'border-emerald-700 hover:border-emerald-800 dark:border-emerald-500', footerBg: 'bg-emerald-100/80 dark:bg-emerald-950/40', badge: 'bg-emerald-300 text-emerald-900 border-transparent dark:bg-emerald-800 dark:text-emerald-100' },
  { id: 'amber', label: 'On going Funnel', tailwind: 'border-amber-500 hover:border-amber-600 dark:border-amber-500', footerBg: 'bg-amber-100/80 dark:bg-amber-950/40', badge: 'bg-amber-300 text-amber-900 border-transparent dark:bg-amber-800 dark:text-amber-100' },
  { id: 'red', label: 'Test/Discarded Funnel', tailwind: 'border-rose-500 hover:border-rose-600 dark:border-rose-500', footerBg: 'bg-rose-100/80 dark:bg-rose-950/40', badge: 'bg-rose-300 text-rose-900 border-transparent dark:bg-rose-800 dark:text-rose-100' },
  { id: 'purple', label: 'Non GTM Funnel', tailwind: 'border-purple-500 hover:border-purple-600 dark:border-purple-500', footerBg: 'bg-purple-100/80 dark:bg-purple-950/40', badge: 'bg-purple-300 text-purple-900 border-transparent dark:bg-purple-800 dark:text-purple-100' },
  { id: 'blue', label: 'Other', tailwind: 'border-blue-500 hover:border-blue-600 dark:border-blue-500', footerBg: 'bg-blue-100/80 dark:bg-blue-950/40', badge: 'bg-blue-300 text-blue-900 border-transparent dark:bg-blue-800 dark:text-blue-100' },
];

function getTagConfig(colorId?: string | null) {
  return FUNNEL_TAGS.find(t => t.id === colorId) || FUNNEL_TAGS[0];
}

export default function FunnelsPage() {
  const [funnels, setFunnels] = useState<FunnelWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Edit state
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [editingFunnel, setEditingFunnel] = useState<FunnelWithStats | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', color: 'default' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch('/api/funnels')
      .then(res => res.json())
      .then(data => {
        setFunnels(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleDelete = async (e: React.MouseEvent, funnelId: number, funnelName: string) => {
    e.preventDefault();
    if (!window.confirm(`Are you sure you want to permanently delete the funnel "${funnelName}"? This will erase all its upload history and data from the database. This action cannot be undone.`)) {
      return;
    }
    
    try {
      const res = await fetch(`/api/funnels/${funnelId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete funnel');
      }
      setFunnels(prev => prev.filter(f => f.id !== funnelId));
      toast.success('Funnel deleted successfully');
    } catch (error) {
      toast.error('Error deleting funnel', { description: errorMessage(error) });
    }
  };

  const openEditModal = (e: React.MouseEvent, funnel: FunnelWithStats) => {
    e.preventDefault(); // Prevent navigating to funnel
    setEditingFunnel(funnel);
    setEditForm({
      name: funnel.name,
      description: funnel.description || '',
      color: funnel.color || 'default',
    });
  };

  const saveEdit = async () => {
    if (!editingFunnel) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/funnels/${editingFunnel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update funnel');
      }
      
      // Update local state
      setFunnels(prev => prev.map(f => 
        f.id === editingFunnel.id 
          ? { ...f, name: editForm.name, description: editForm.description, color: editForm.color } 
          : f
      ));
      toast.success('Funnel updated successfully');
      setEditingFunnel(null);
    } catch (error) {
      toast.error('Error updating funnel', { description: errorMessage(error) });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 flex items-center justify-center">Loading funnels...</div>;
  }

  const filteredFunnels = funnels.filter(f => {
    if (tagFilter === 'all') return true;
    const c = f.color || 'default';
    return c === tagFilter;
  });

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Funnels</h1>
          <p className="text-muted-foreground mt-1">Manage your ICP classification batches</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={tagFilter} onValueChange={(val) => val && setTagFilter(val)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Filter by Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tags</SelectItem>
              {FUNNEL_TAGS.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Link href="/upload">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              New Funnel
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredFunnels.map(funnel => {
          const tagConfig = getTagConfig(funnel.color);
          return (
            <Link key={funnel.id} href={`/funnels/${funnel.id}`}>
              <Card className={`bg-card border transition-colors cursor-pointer h-full flex flex-col group ${tagConfig.tailwind}`}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
                  <div className="space-y-1 pr-4 flex-1">
                    <CardTitle className="text-lg leading-tight flex items-center justify-between gap-2">
                      <span className="line-clamp-2">{funnel.name}</span>
                    </CardTitle>
                    <div className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      {funnel.description || 'No description provided.'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-muted-foreground hover:text-primary hover:bg-primary/10 shrink-0 h-8 w-8 z-10"
                      onClick={(e) => openEditModal(e, funnel)}
                    >
                      <Edit2 className="w-4 h-4" />
                      <span className="sr-only">Edit Funnel</span>
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 h-8 w-8 z-10"
                      onClick={(e) => handleDelete(e, funnel.id, funnel.name)}
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="sr-only">Delete Funnel</span>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="space-y-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-muted-foreground">Total Companies</span>
                      <span className="text-xl font-bold">{formatNumber(funnel.total_companies)}</span>
                    </div>
                    
                    <div className="flex gap-2">
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                        {formatNumber(funnel.icp_yes)} Yes
                      </Badge>
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                        {formatNumber(funnel.icp_review)} Review
                      </Badge>
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                        {formatNumber(funnel.icp_no)} No
                      </Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className={`border-t border-border/50 px-6 py-4 flex items-center justify-between text-xs text-muted-foreground transition-colors ${tagConfig.footerBg}`}>
                  <span className="font-medium text-muted-foreground/80">Created {new Date(funnel.created_at).toLocaleDateString()}</span>
                  {tagConfig.id !== 'default' && (
                    <Badge variant="outline" className={`text-[10.5px] uppercase font-bold tracking-wider rounded px-2 py-0.5 border ${tagConfig.badge}`}>
                      {tagConfig.label}
                    </Badge>
                  )}
                </CardFooter>
              </Card>
            </Link>
          );
        })}

        {filteredFunnels.length === 0 && (
          <div className="col-span-full py-12 text-center border border-dashed border-border rounded-xl">
            <h3 className="text-lg font-medium">No funnels found</h3>
            <p className="text-muted-foreground mt-1 mb-4">No funnels match your current filter, or you haven't created any yet.</p>
            {tagFilter !== 'all' ? (
              <Button variant="outline" onClick={() => setTagFilter('all')}>Clear Filter</Button>
            ) : (
              <Link href="/upload">
                <Button variant="outline">Upload CSV</Button>
              </Link>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!editingFunnel} onOpenChange={(open) => !open && setEditingFunnel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Funnel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input 
                value={editForm.name} 
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))} 
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea 
                value={editForm.description} 
                onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))} 
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Tag / Status</Label>
              <Select value={editForm.color} onValueChange={(val) => setEditForm(prev => ({ ...prev, color: val || 'default' }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a tag" />
                </SelectTrigger>
                <SelectContent>
                  {FUNNEL_TAGS.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingFunnel(null)} disabled={isSaving}>Cancel</Button>
            <Button onClick={saveEdit} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
