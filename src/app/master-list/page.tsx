'use client';

import { useEffect, useState } from 'react';
import { DataTable } from '@/components/data-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Database, Download, ArrowRight } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import Link from 'next/link';

export default function MasterListPage() {
  const [masterCount, setMasterCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/master')
      .then(r => r.json())
      .then(data => {
        setMasterCount(data.total || 0);
        setLoading(false);
      });
  }, []);

  const handleExport = () => {
    window.open('/api/export?icp_decision=Yes', '_blank');
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Master ICP List</h1>
          <p className="text-muted-foreground mt-1">All qualified ICP companies across all funnels</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Link href="/upload">
            <Button variant="outline">
              Upload Master List
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">Master List Size</span>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-purple-500/10 text-purple-600">
                <Database className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight">
              {loading ? '—' : formatNumber(masterCount)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Known ICP domains for NetNew checks</div>
          </CardContent>
        </Card>
      </div>

      {/* Data Table — showing all ICP=Yes companies globally */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          All ICP Qualified Companies
          <Badge variant="secondary" className="text-xs">Across all funnels</Badge>
        </h2>
        <DataTable 
          filters={{ icp_decision: 'Yes' }}
          showSelection
        />
      </div>
    </div>
  );
}
