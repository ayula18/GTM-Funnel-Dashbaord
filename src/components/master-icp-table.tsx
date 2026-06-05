'use client';

import { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ChevronLeft, ChevronRight, Loader2, Database, Trash2 } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { toast } from 'sonner';

export function MasterIcpTable() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 50;

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/master/list?page=${page}&per_page=${perPage}&search=${encodeURIComponent(search)}`);
      const json = await res.json();
      setData(json.data || []);
      setTotal(json.pagination?.total || 0);
    } catch (e) {
      toast.error('Failed to load master list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, search]);

  const clearMasterList = async () => {
    if (!window.confirm('Are you sure you want to delete ALL companies from your Master ICP database? This cannot be undone.')) return;
    
    try {
      const res = await fetch('/api/master', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Master list cleared');
      setPage(1);
      fetchData();
    } catch (e) {
      toast.error('Failed to clear master list');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search domains or names..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 h-9"
          />
        </div>
        <Button variant="destructive" size="sm" onClick={clearMasterList} disabled={total === 0}>
          <Trash2 className="w-4 h-4 mr-2" />
          Clear Database
        </Button>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Domain</TableHead>
              <TableHead>Company Name</TableHead>
              <TableHead>Added At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={3} className="h-48 text-center text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Loading...
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-48 text-center text-muted-foreground">
                  <Database className="w-8 h-8 mx-auto mb-3 opacity-20" />
                  No companies found in your Master ICP database.
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow key={row.domain}>
                  <TableCell className="font-medium text-primary">
                    <a href={`https://${row.domain}`} target="_blank" rel="noreferrer" className="hover:underline">
                      {row.domain}
                    </a>
                  </TableCell>
                  <TableCell>{row.company_name || '—'}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(row.added_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between pb-8">
        <div className="text-xs text-muted-foreground">
          {data.length > 0 ? `${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)}` : '0'} of {formatNumber(total)}
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
          <Button
            variant="outline" size="sm"
            onClick={() => setPage(p => p + 1)}
            disabled={page * perPage >= total || loading}
            className="h-7 text-xs"
          >
            Next<ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
