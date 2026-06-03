'use client';

import { use } from 'react';
import { MarketingKpiCard } from '@/components/marketing/marketing-kpi-card';
import { CampaignFunnel } from '@/components/marketing/campaign-funnel';
import { IcpDonut } from '@/components/marketing/icp-donut';
import { InlineEditable } from '@/components/marketing/inline-editable';
import { EfficiencyBadge } from '@/components/marketing/efficiency-badge';
import { HotjarInsights } from '@/components/marketing/hotjar-insights';
import { ReoDevTable } from '@/components/marketing/reo-dev-table';
import { Ga4Funnel } from '@/components/marketing/ga4-funnel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, DollarSign, Eye, MousePointerClick, BarChart3, Target, Zap } from 'lucide-react';
import Link from 'next/link';

// Mock lookup — in production from API
const CAMPAIGNS: Record<number, any> = {
  1: {
    id: 1, name: 'Competitor FOMO', status: 'active', objective: 'Website visits',
    adType: 'Single Image', dateRange: 'May 1 – May 31, 2026',
    spend: 915.78, impressions: 3780, clicks: 14, ctr: 0.37, cpm: 242.27, cpc: 65.41,
    comments: 0, icp_comments: 0, landed: 91, rb2b: 0, hotjar_sessions: 0,
    meetings: 1, companies: 'mastechdigital', cost_per_meeting: 915.78, efficiency_score: 28,
    commenters: [],
    webJourney: {
      hotjar: { foldDropoff: 78, rageClicks: 14, uTurns: 8, landingPage: '/lp/competitor-fomo' },
      ga4: [{label: 'LP Visit', count: 91}, {label: 'Scroll 50%', count: 32}, {label: 'Click CTA', count: 8}, {label: 'Submit', count: 1}],
      reoDev: [
        { id: '1', name: 'Mastech Digital', industry: 'IT Services', isIcp: true, pagesVisited: [{title: 'Competitor FOMO', url: '/lp/competitor-fomo'}, {title: 'Pricing', url: '/pricing'}], timeSpent: '4m 12s' }
      ]
    }
  },
  2: {
    id: 2, name: 'AI Agents', status: 'active', objective: 'Engagement',
    adType: 'Single Image', dateRange: 'May 1 – May 31, 2026',
    spend: 1043.50, impressions: 10387, clicks: 928, ctr: 8.93, cpm: 100.46, cpc: 1.12,
    comments: 526, icp_comments: 80, landed: 30, rb2b: 0, hotjar_sessions: 0,
    meetings: 2, companies: 'Unifyapps, Vercel', cost_per_meeting: 521.75, efficiency_score: 82,
    webJourney: {
      hotjar: { foldDropoff: 42, rageClicks: 3, uTurns: 1, landingPage: '/lp/ai-agents' },
      ga4: [{label: 'LP Visit', count: 30}, {label: 'Scroll 50%', count: 24}, {label: 'Click CTA', count: 15}, {label: 'Submit', count: 2}],
      reoDev: [
        { id: '1', name: 'Unifyapps', industry: 'Software', isIcp: true, pagesVisited: [{title: 'AI Agents', url: '/lp/ai-agents'}, {title: 'Book Demo', url: '/demo'}], timeSpent: '6m 45s' },
        { id: '2', name: 'Vercel', industry: 'Software', isIcp: true, pagesVisited: [{title: 'AI Agents', url: '/lp/ai-agents'}], timeSpent: '2m 10s' }
      ]
    },
    commenters: [
      { name: 'Arjun Mehta', headline: 'VP Engineering @ Unifyapps', company: 'Unifyapps', icp: true },
      { name: 'Sarah Chen', headline: 'Staff SRE @ Vercel', company: 'Vercel', icp: true },
      { name: 'Mike Johnson', headline: 'Marketing Manager @ Acme', company: 'Acme Corp', icp: false },
    ],
  },
  3: {
    id: 3, name: 'Offer+Demo to Mesh and MCP commentors', status: 'completed', objective: 'Conversions',
    adType: 'Single Image', dateRange: 'May 5 – May 20, 2026',
    spend: 452.27, impressions: 1685, clicks: 9, ctr: 0.53, cpm: 268.41, cpc: 50.25,
    comments: 0, icp_comments: 0, landed: 9, rb2b: 0, hotjar_sessions: 0,
    meetings: 0, companies: '', cost_per_meeting: null, efficiency_score: 12,
    commenters: [],
  },
  4: {
    id: 4, name: 'MCP Server (carry over from April)', status: 'active', objective: 'Engagement',
    adType: 'Video', dateRange: 'Apr 15 – May 31, 2026',
    spend: 451.58, impressions: 3142, clicks: 237, ctr: 7.54, cpm: 143.72, cpc: 1.91,
    comments: 864, icp_comments: 35, landed: 29, rb2b: 0, hotjar_sessions: 0,
    meetings: 0, companies: '', cost_per_meeting: null, efficiency_score: 45,
    commenters: [
      { name: 'Dev Patel', headline: 'Platform Engineer @ Razorpay', company: 'Razorpay', icp: true },
      { name: 'Lisa Wong', headline: 'Recruiter @ Google', company: 'Google', icp: false },
    ],
  },
  5: {
    id: 5, name: 'Unleash testimonial', status: 'active', objective: 'Website visits',
    adType: 'Single Image', dateRange: 'May 10 – May 31, 2026',
    spend: 231.85, impressions: 1971, clicks: 87, ctr: 4.41, cpm: 117.63, cpc: 2.66,
    comments: 0, icp_comments: 0, landed: 0, rb2b: 0, hotjar_sessions: 0,
    meetings: 0, companies: '', cost_per_meeting: null, efficiency_score: 30,
    commenters: [],
  },
  6: {
    id: 6, name: 'Mixpanel for your MCP server', status: 'paused', objective: 'Engagement',
    adType: 'Single Image', dateRange: 'May 20 – May 31, 2026',
    spend: 0, impressions: 0, clicks: 0, ctr: 0, cpm: 0, cpc: 0,
    comments: 0, icp_comments: 0, landed: 0, rb2b: 0, hotjar_sessions: 0,
    meetings: 0, companies: '', cost_per_meeting: null, efficiency_score: 0,
    commenters: [],
  },
};

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  active: { label: 'Active', variant: 'default' },
  paused: { label: 'Paused', variant: 'secondary' },
  completed: { label: 'Done', variant: 'outline' },
};

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const campaign = CAMPAIGNS[parseInt(id)];

  if (!campaign) {
    return <div className="p-8 text-destructive">Campaign not found.</div>;
  }

  const sc = statusConfig[campaign.status] || statusConfig.active;
  const icpRate = campaign.comments > 0
    ? ((campaign.icp_comments / campaign.comments) * 100)
    : 0;
  const costPerIcp = campaign.icp_comments > 0
    ? campaign.spend / campaign.icp_comments
    : null;

  return (
    <div className="p-8 space-y-6">
      {/* Back + Header */}
      <div>
        <Link
          href="/marketing/campaigns"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3 h-3" /> Back to Campaigns
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold tracking-tight">{campaign.name}</h1>
              <Badge variant={sc.variant}>{sc.label}</Badge>
              <EfficiencyBadge score={campaign.efficiency_score} />
            </div>
            <p className="text-sm text-muted-foreground">
              {campaign.objective} • {campaign.adType} • {campaign.dateRange}
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <MarketingKpiCard title="Spend" value={`$${campaign.spend.toFixed(2)}`} icon={<DollarSign className="w-4 h-4" />} />
        <MarketingKpiCard title="Impressions" value={campaign.impressions.toLocaleString()} icon={<Eye className="w-4 h-4" />} />
        <MarketingKpiCard title="Clicks" value={campaign.clicks.toLocaleString()} icon={<MousePointerClick className="w-4 h-4" />} />
        <MarketingKpiCard title="CTR" value={`${campaign.ctr.toFixed(2)}%`} icon={<BarChart3 className="w-4 h-4" />} />
        <MarketingKpiCard title="CPC" value={`$${campaign.cpc.toFixed(2)}`} icon={<Target className="w-4 h-4" />} />
        <MarketingKpiCard title="CPM" value={`$${campaign.cpm.toFixed(2)}`} icon={<Zap className="w-4 h-4" />} />
      </div>

      {/* Funnel */}
      <CampaignFunnel
        steps={[
          { label: 'Impressions', value: campaign.impressions, color: '#5f33d6' },
          { label: 'Clicks', value: campaign.clicks, color: '#7c5ce7' },
          { label: 'LI Conv', value: Math.floor(campaign.clicks * 0.15), color: '#a084f0' },
          { label: 'GA4 (Landed)', value: campaign.landed, color: '#4ade80' },
          { label: 'Identified', value: Math.floor(campaign.landed * 0.4), color: '#34d399' },
          { label: 'Engaged', value: Math.floor(campaign.landed * 0.25), color: '#10b981' },
          { label: 'Meetings', value: campaign.meetings, color: '#059669' },
        ]}
      />

      {/* Bottom section: Engagement + Conversion */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Engagement */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Engagement & ICP Breakdown
          </h3>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-bold">{campaign.comments || '—'}</div>
              <div className="text-[10px] text-muted-foreground uppercase">Comments</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-primary">{campaign.icp_comments || '—'}</div>
              <div className="text-[10px] text-muted-foreground uppercase">ICP Comments</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{icpRate > 0 ? `${icpRate.toFixed(1)}%` : '—'}</div>
              <div className="text-[10px] text-muted-foreground uppercase">ICP Rate</div>
            </div>
          </div>

          {campaign.comments > 0 && (
            <IcpDonut
              icpCount={campaign.icp_comments}
              nonIcpCount={campaign.comments - campaign.icp_comments}
              size={100}
            />
          )}

          {costPerIcp && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-primary">${costPerIcp.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground uppercase">Cost per ICP Engagement</div>
            </div>
          )}

          {/* Commenters table */}
          {campaign.commenters.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Sample Enriched Commenters
              </div>
              <div className="space-y-2">
                {campaign.commenters.map((c: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-muted/30 rounded-lg px-3 py-2">
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-[10px] text-muted-foreground">{c.headline}</div>
                    </div>
                    <Badge variant={c.icp ? 'default' : 'secondary'} className="text-[10px]">
                      {c.icp ? 'ICP' : 'Non-ICP'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Conversion / Manual data */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Conversion & Tracking
          </h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-xs text-muted-foreground">Landed (LinkedIn)</span>
              <InlineEditable
                value={campaign.landed}
                onSave={(v) => console.log('save landed:', v)}
                type="number"
              />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-xs text-muted-foreground">RB2B Visitors</span>
              <InlineEditable
                value={campaign.rb2b}
                onSave={(v) => console.log('save rb2b:', v)}
                type="number"
              />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-xs text-muted-foreground">Hotjar Sessions</span>
              <InlineEditable
                value={campaign.hotjar_sessions}
                onSave={(v) => console.log('save hotjar:', v)}
                type="number"
              />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-xs text-muted-foreground"># Meetings</span>
              <InlineEditable
                value={campaign.meetings}
                onSave={(v) => console.log('save meetings:', v)}
                type="number"
              />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-xs text-muted-foreground">Company (source)</span>
              <InlineEditable
                value={campaign.companies}
                onSave={(v) => console.log('save companies:', v)}
                type="text"
                placeholder="Add company..."
              />
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-xs text-muted-foreground">Cost / Meeting</span>
              <span className="text-sm font-semibold">
                {campaign.cost_per_meeting ? `$${campaign.cost_per_meeting.toFixed(0)}` : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Web Journey Section */}
      {campaign.webJourney && (
        <div className="pt-6 border-t border-border mt-8">
          <h2 className="text-xl font-bold tracking-tight mb-6">Post-Click Web Journey</h2>
          
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6 mb-6">
            <ReoDevTable companies={campaign.webJourney.reoDev} />
            
            <div className="space-y-6">
              <HotjarInsights {...campaign.webJourney.hotjar} />
              <Ga4Funnel steps={campaign.webJourney.ga4} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
