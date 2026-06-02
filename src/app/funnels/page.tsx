'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/utils';
import type { FunnelWithStats } from '@/lib/types';
import Link from 'next/link';
import { Plus } from 'lucide-react';

export default function FunnelsPage() {
  const [funnels, setFunnels] = useState<FunnelWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/funnels')
      .then(res => res.json())
      .then(data => {
        setFunnels(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 flex items-center justify-center">Loading funnels...</div>;
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Funnels</h1>
          <p className="text-muted-foreground mt-1">Manage your ICP classification batches</p>
        </div>
        <Link href="/upload">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            New Funnel
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {funnels.map(funnel => (
          <Link key={funnel.id} href={`/funnels/${funnel.id}`}>
            <Card className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer h-full flex flex-col">
              <CardHeader>
                <CardTitle className="text-lg">{funnel.name}</CardTitle>
                <div className="text-sm text-muted-foreground line-clamp-2">
                  {funnel.description || 'No description provided.'}
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
              <CardFooter className="border-t border-border pt-4 text-xs text-muted-foreground">
                Created {new Date(funnel.created_at).toLocaleDateString()}
              </CardFooter>
            </Card>
          </Link>
        ))}

        {funnels.length === 0 && (
          <div className="col-span-full py-12 text-center border border-dashed border-border rounded-xl">
            <h3 className="text-lg font-medium">No funnels yet</h3>
            <p className="text-muted-foreground mt-1 mb-4">Create your first funnel by uploading an Apollo CSV.</p>
            <Link href="/upload">
              <Button variant="outline">Upload CSV</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
