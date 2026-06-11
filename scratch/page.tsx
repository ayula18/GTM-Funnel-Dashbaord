'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatNumber, errorMessage } from '@/lib/utils';
import type { FunnelWithStats } from '@/lib/types';
import Link from 'next/link';
import { Plus, Trash2, Edit2, ChevronRight, Calendar } from 'lucide-react';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const FUNNEL_COLORS = [
  { id: 'default', label: 'Default', tailwind: 'border-border hover:border-primary/50', footerBg: 'bg-muted/30 text-muted-foreground', dot: 'bg-gray-400' },
  { id: 'blue', label: 'Blue', tailwind: 'border-blue-200 hover:border-blue-400 dark:border-blue-800 dark:hover:border-blue-600', footerBg: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300', dot: 'bg-blue-500' },
  { id: 'emerald', label: 'Emerald', tailwind: 'border-emerald-200 hover:border-emerald-400 dark:border-emerald-800 dark:hover:border-emerald-600', footerBg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', dot: 'bg-emerald-500' },
  { id: 'amber', label: 'Amber', tailwind: 'border-amber-200 hover:border-amber-400 dark:border-amber-800 dark:hover:border-amber-600', footerBg: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300', dot: 'bg-amber-500' },
  { id: 'rose', label: 'Rose', tailwind: 'border-rose-200 hover:border-rose-400 dark:border-rose-800 dark:hover:border-rose-600', footerBg: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300', dot: 'bg-rose-500' },
  { id: 'purple', label: 'Purple', tailwind: 'border-purple-200 hover:border-purple-400 dark:border-purple-800 dark:hover:border-purple-600', footerBg: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300', dot: 'bg-purple-500' },
];

function getColorConfig(colorId?: string | null) {
  return FUNNEL_COLORS.find(c => c.id === colorId) || FUNNEL_COLORS[0];
}

export default function FunnelsPage() {
  const router = useRouter();
  const [funnels, setFunnels] = useState<FunnelWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Edit state
  const [colorFilter, setColorFilter] = useState<string>('all');
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
    e.stopPropagation();
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
    e.stopPropagation();
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
    if (colorFilter === 'all') return true;
    const c = f.color || 'default';
    return c === colorFilter;
  });

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Funnels</h1>
          <p className="text-muted-foreground mt-1">Manage your ICP classification batches</p>
        </div>
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <Select value={colorFilter} onValueChange={(val) => val && setColorFilter(val)}>
            <SelectTrigger className="w-full sm:w-[200px] bg-background">
              <SelectValue placeholder="Filter by Color" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Colors</SelectItem>
              {FUNNEL_COLORS.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${c.dot}`} />
                    {c.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Link href="/upload">
            <Button className="gap-2 shrink-0">
              <Plus className="w-4 h-4" />
              New Funnel
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredFunnels.map(funnel => {
          const colorConfig = getColorConfig(funnel.color);
          return (
            <Card 
              key={funnel.id}
              onClick={() => router.push(`/funnels/${funnel.id}`)}
              className={`bg-card border transition-all duration-200 hover:shadow-md cursor-pointer h-full flex flex-col group relative overflow-hidden ${colorConfig.tailwind}`}
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
                <div className="space-y-1.5 pr-4 flex-1">
                  <CardTitle className="text-lg font-semibold leading-tight flex items-start gap-2.5">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${colorConfig.dot}`} />
                    <span className="line-clamp-2">{funnel.name}</span>
                  </CardTitle>
                  <div className="text-sm text-muted-foreground line-clamp-2 pl-5">
                    {funnel.description || 'No description provided.'}
                  </div>
                </div>
                
                {/* Actions: Always visible but subtle, full opacity on hover */}
                <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
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

              <CardContent className="flex-1 pb-4">
                <div className="space-y-5">
                  <div className="flex items-center justify-between border-b border-border/50 pb-4">
                    <span className="text-sm font-medium text-muted-foreground">Total Companies</span>
                    <span className="text-2xl font-bold tracking-tight">{formatNumber(funnel.total_companies)}</span>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                      {formatNumber(funnel.icp_yes)} Yes
                    </Badge>
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                      {formatNumber(funnel.icp_review)} Review
                    </Badge>
                    <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800">
                      {formatNumber(funnel.icp_no)} No
                    </Badge>
                  </div>
                </div>
              </CardContent>

              <CardFooter className={`border-t border-border/50 py-3 px-6 flex items-center justify-between ${colorConfig.footerBg}`}>
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Calendar className="w-3.5 h-3.5 opacity-70" />
                  <span>Created {new Date(funnel.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center text-xs font-medium opacity-70 group-hover:opacity-100 transition-opacity">
                  View <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                </div>
              </CardFooter>
            </Card>
          );
        })}

        {filteredFunnels.length === 0 && (
          <div className="col-span-full py-16 text-center border-2 border-dashed border-border rounded-xl bg-muted/20">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">No funnels found</h3>
            <p className="text-muted-foreground mt-1 mb-6 max-w-sm mx-auto">
              No funnels match your current filter, or you haven't created any yet.
            </p>
            {colorFilter !== 'all' ? (
              <Button variant="outline" onClick={() => setColorFilter('all')}>Clear Filter</Button>
            ) : (
              <Link href="/upload">
                <Button>Upload CSV</Button>
              </Link>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!editingFunnel} onOpenChange={(open) => !open && setEditingFunnel(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Funnel Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Name</Label>
              <Input 
                value={editForm.name} 
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))} 
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Description</Label>
              <Textarea 
                value={editForm.description} 
                onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))} 
                rows={3}
                className="resize-none"
                placeholder="Add some notes about this batch..."
              />
            </div>
            <div className="space-y-3">
              <Label className="text-sm font-medium">Color Tag</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {FUNNEL_COLORS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setEditForm(prev => ({ ...prev, color: c.id }))}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-all duration-200 ${
                      editForm.color === c.id 
                        ? 'border-primary ring-1 ring-primary bg-primary/5 font-medium shadow-sm' 
                        : 'border-border hover:bg-muted/50 hover:border-primary/30'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full shadow-sm ${c.dot}`} />
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
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
