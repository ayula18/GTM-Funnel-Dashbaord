'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { EfficiencyBadge } from '@/components/marketing/efficiency-badge';
import { Megaphone, ArrowRight, DollarSign, MousePointerClick, MessageSquare, CalendarCheck } from 'lucide-react';

// Same mock data — in production this will come from API
const MOCK_CAMPAIGNS = [
  {
    id: 1, name: 'Competitor FOMO', status: 'active' as const,
    spend: 915.78, impressions: 3780, clicks: 14, ctr: 0.37,
    comments: 0, icp_comments: 0, meetings: 1, efficiency_score: 28,
  },
  {
    id: 2, name: 'AI Agents', status: 'active' as const,
    spend: 1043.50, impressions: 10387, clicks: 928, ctr: 8.93,
    comments: 526, icp_comments: 80, meetings: 2, efficiency_score: 82,
  },
  {
    id: 3, name: 'Offer+Demo to Mesh and MCP commentors', status: 'completed' as const,
    spend: 452.27, impressions: 1685, clicks: 9, ctr: 0.53,
    comments: 0, icp_comments: 0, meetings: 0, efficiency_score: 12,
  },
  {
    id: 4, name: 'MCP Server (carry over from April)', status: 'active' as const,
    spend: 451.58, impressions: 3142, clicks: 237, ctr: 7.54,
    comments: 864, icp_comments: 35, meetings: 0, efficiency_score: 45,
  },
  {
    id: 5, name: 'Unleash testimonial', status: 'active' as const,
    spend: 231.85, impressions: 1971, clicks: 87, ctr: 4.41,
    comments: 0, icp_comments: 0, meetings: 0, efficiency_score: 30,
  },
  {
    id: 6, name: 'Mixpanel for your MCP server', status: 'paused' as const,
    spend: 0, impressions: 0, clicks: 0, ctr: 0,
    comments: 0, icp_comments: 0, meetings: 0, efficiency_score: 0,
  },
];

const statusConfig = {
  active: { label: 'Active', bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/30' },
  paused: { label: 'Paused', bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/30' },
  completed: { label: 'Done', bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border' },
};

export default function CampaignsListPage() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
        <p className="text-muted-foreground mt-1">
          All LinkedIn ad campaigns — click any card to see details
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {MOCK_CAMPAIGNS.map((c) => {
          const sc = statusConfig[c.status];
          return (
            <Link
              key={c.id}
              href={`/marketing/campaigns/${c.id}`}
              className="group bg-card border border-border rounded-xl p-5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4 gap-3">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Megaphone className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold truncate group-hover:text-primary transition-colors" title={c.name}>
                      {c.name}
                    </h3>
                    <span className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border mt-1",
                      sc.bg, sc.text, sc.border
                    )}>
                      {sc.label}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 mt-0.5">
                  <EfficiencyBadge score={c.efficiency_score} />
                </div>
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Spend</div>
                    <div className="text-sm font-semibold">${c.spend.toFixed(0)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <MousePointerClick className="w-3.5 h-3.5 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Clicks</div>
                    <div className="text-sm font-semibold">{c.clicks.toLocaleString()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Comments</div>
                    <div className="text-sm font-semibold">
                      {c.comments || '—'}
                      {c.icp_comments > 0 && (
                        <span className="text-primary text-[10px] ml-1">({c.icp_comments} ICP)</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CalendarCheck className="w-3.5 h-3.5 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Meetings</div>
                    <div className="text-sm font-semibold">{c.meetings || '—'}</div>
                  </div>
                </div>
              </div>

              {/* ICP bar */}
              {c.comments > 0 && (
                <div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                    <span>ICP Rate</span>
                    <span className="text-primary font-semibold">
                      {((c.icp_comments / c.comments) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${Math.min((c.icp_comments / c.comments) * 100 * 5, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* CTA */}
              <div className="flex items-center justify-end mt-4 text-[10px] text-muted-foreground group-hover:text-primary transition-colors">
                View Details <ArrowRight className="w-3 h-3 ml-1" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
