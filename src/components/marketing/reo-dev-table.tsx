'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Target, ExternalLink } from 'lucide-react';

export interface ReoDevCompany {
  id: string;
  name: string;
  industry: string;
  isIcp: boolean;
  pagesVisited: { title: string; url: string }[];
  timeSpent: string;
}

interface ReoDevTableProps {
  companies: ReoDevCompany[];
  className?: string;
}

export function ReoDevTable({ companies, className }: ReoDevTableProps) {
  if (companies.length === 0) {
    return (
      <div className={cn("bg-card border border-border rounded-xl p-8 text-center", className)}>
        <Target className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
        <p className="text-sm font-medium">No Companies Identified</p>
        <p className="text-xs text-muted-foreground mt-1">Reo.dev hasn't identified any companies from this campaign yet.</p>
      </div>
    );
  }

  return (
    <div className={cn("bg-card border border-border rounded-xl overflow-hidden flex flex-col", className)}>
      <div className="p-5 border-b border-border/50 bg-muted/20">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          Reo.dev Identified Visitors
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Companies that visited the website via this campaign (UTM match)
        </p>
      </div>
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase">Company</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase">Industry</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase">ICP Status</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase">Pages Visited</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase">Time Spent</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company, i) => (
              <tr key={company.id || i} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">
                  {company.name}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {company.industry}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={company.isIcp ? 'default' : 'secondary'} className="text-[10px]">
                    {company.isIcp ? 'ICP' : 'Non-ICP'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1 max-w-[200px]">
                    {company.pagesVisited.map((page, idx) => (
                      <a
                        key={idx}
                        href={page.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline truncate text-[10px] flex items-center gap-1"
                        title={page.url}
                      >
                        {page.title}
                        <ExternalLink className="w-2.5 h-2.5 opacity-50 shrink-0" />
                      </a>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                  {company.timeSpent}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
