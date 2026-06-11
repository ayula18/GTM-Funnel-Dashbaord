'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Database } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils';

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
      fetchCustomers();
    } catch (error) {
      toast.error('Upload failed', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-6xl mx-auto w-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Already Customer List</h1>
        <p className="text-muted-foreground mt-1">Upload a list of your existing customers to track them in Comment Intel.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-600" />
                Upload Customers
              </CardTitle>
              <CardDescription>Upload CSV of your existing customers.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpload} className="space-y-5">
                <div className="space-y-2">
                  <Label>CSV (Col A = Domain, Col B = Name)</Label>
                  <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:bg-muted/30 transition-colors">
                    <Input 
                      type="file" accept=".csv"
                      onChange={e => setFile(e.target.files?.[0] || null)}
                      className="hidden" id="customer-upload"
                    />
                    <Label htmlFor="customer-upload" className="cursor-pointer flex flex-col items-center gap-2">
                      <Database className="w-8 h-8 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {file ? file.name : "Click to browse or drag and drop"}
                      </span>
                      <span className="text-xs text-muted-foreground">CSV with domain column</span>
                    </Label>
                  </div>
                </div>

                <Button 
                  type="submit" variant="outline"
                  className="w-full border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10"
                  disabled={!file || loading}
                >
                  {loading ? 'Importing...' : 'Upload Customers'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Existing Customers ({customers.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {fetching ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/30 text-xs uppercase text-muted-foreground border-b border-border">
                      <tr>
                        <th className="px-4 py-3 font-medium">Domain</th>
                        <th className="px-4 py-3 font-medium">Company Name</th>
                        <th className="px-4 py-3 font-medium">Added</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {customers.map(c => (
                        <tr key={c.id} className="hover:bg-muted/10 transition-colors">
                          <td className="px-4 py-2 font-medium">{c.domain}</td>
                          <td className="px-4 py-2 text-muted-foreground">{c.company_name || '—'}</td>
                          <td className="px-4 py-2 text-muted-foreground text-xs">{new Date(c.added_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                      {customers.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                            No customers uploaded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
