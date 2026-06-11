'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Database, Loader2, Search, ChevronLeft, ChevronRight, ArrowRight, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage, formatNumber } from '@/lib/utils';

interface Customer {
  id: number;
  domain: string;
  company_name: string | null;
  added_at: string;
}

export default function CustomersPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [fetching, setFetching] = useState(true);
  const [open, setOpen] = useState(false);
  
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 50;

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/marketing/customers');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCustomers(data.customers || []);
    } catch (err) {
      toast.error('Failed to load customers', { description: errorMessage(err) });
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/marketing/customers/upload', { method: 'POST', body: formData });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      
      toast.success(`Imported ${data.imported} domains to Customers list`);
      if (data.errors && data.errors.length > 0) {
        toast.error(`There were ${data.errors.length} errors during upload. Check console.`);
        console.error('Upload errors:', data.errors);
      }
      setFile(null);
      setOpen(false);
      fetchCustomers();
    } catch (error) {
      toast.error('Upload failed', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  const filtered = customers.filter(c => 
    c.domain.toLowerCase().includes(search.toLowerCase()) || 
    (c.company_name && c.company_name.toLowerCase().includes(search.toLowerCase()))
  );
  
  const total = filtered.length;
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Already Customer Database</h1>
          <p className="text-muted-foreground mt-1">Your company's pre-existing list of known customers</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                Upload Customers
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Customers</DialogTitle>
                <DialogDescription>
                  Upload a CSV file containing your existing customers. We will automatically detect the Domain and Company Name columns.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleUpload} className="space-y-5 pt-4">
                <div className="space-y-2">
                  <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:bg-muted/30 transition-colors">
                    <Input 
                      type="file" accept=".csv"
                      onChange={e => setFile(e.target.files?.[0] || null)}
                      className="hidden" id="customer-upload"
                    />
                    <Label htmlFor="customer-upload" className="cursor-pointer flex flex-col items-center gap-2">
                      <UploadCloud className="w-8 h-8 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {file ? file.name : "Click to browse or drag and drop"}
                      </span>
                      <span className="text-xs text-muted-foreground">CSV file allowed</span>
                    </Label>
                  </div>
                </div>
                <Button 
                  type="submit"
                  className="w-full"
                  disabled={!file || loading}
                >
                  {loading ? 'Importing...' : 'Upload Customers'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">Customer Database Size</span>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-purple-500/10 text-purple-600">
                <Database className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight">
              {fetching ? '—' : formatNumber(customers.length)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Domains used for engagement filtering</div>
          </CardContent>
        </Card>
      </div>

      {/* Data Table */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          Customer Database
          <Badge variant="secondary" className="text-xs">Excludes non-customers</Badge>
        </h2>
        
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
          </div>

          <div className="border rounded-md bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Sr. No.</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Added At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fetching ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-48 text-center text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-48 text-center text-muted-foreground">
                      <Database className="w-8 h-8 mx-auto mb-3 opacity-20" />
                      No customers found.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((row, index) => {
                    const srNo = (page - 1) * perPage + index + 1;
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="text-muted-foreground font-medium text-xs">
                          {srNo}
                        </TableCell>
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
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between pb-8">
            <div className="text-xs text-muted-foreground">
              {total > 0 ? `${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)}` : '0'} of {formatNumber(total)}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || fetching}
                className="h-7 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />Prev
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={page * perPage >= total || fetching}
                className="h-7 text-xs"
              >
                Next<ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
