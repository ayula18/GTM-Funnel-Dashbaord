'use client';

import { useState } from 'react';
import { MarketingKpiCard } from '@/components/marketing/marketing-kpi-card';
import { CampaignFunnel } from '@/components/marketing/campaign-funnel';
import { CampaignTable, CampaignRow } from '@/components/marketing/campaign-table';
import { IcpDonut } from '@/components/marketing/icp-donut';
import { DateFilter } from '@/components/marketing/date-filter';
import { DollarSign, Eye, MousePointerClick, Users, CalendarCheck, TrendingUp, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ── Mock data matching the user's Excel ────────────────────────────────
const MOCK_CAMPAIGNS: CampaignRow[] = [
  {
    id: 1, name: 'Competitor FOMO', status: 'active',
    spend: 915.78, impressions: 3780, clicks: 14, ctr: 0.37, cpm: 242.27, cpc: 65.41,
    comments: 0, icp_comments: 0, icp_rate: 0, landed: 91, rb2b: 0, hotjar_sessions: 0,
    meetings: 1, companies: 'mastechdigital', cost_per_meeting: 915.78, efficiency_score: 28,
  },
  {
    id: 2, name: 'AI Agents', status: 'active',
    spend: 1043.50, impressions: 10387, clicks: 928, ctr: 8.93, cpm: 100.46, cpc: 1.12,
    comments: 526, icp_comments: 80, icp_rate: 15.2, landed: 30, rb2b: 0, hotjar_sessions: 0,
    meetings: 2, companies: 'Unifyapps, Vercel', cost_per_meeting: 521.75, efficiency_score: 82,
  },
  {
    id: 3, name: 'Offer+Demo to Mesh and MCP commentors', status: 'completed',
    spend: 452.27, impressions: 1685, clicks: 9, ctr: 0.53, cpm: 268.41, cpc: 50.25,
    comments: 0, icp_comments: 0, icp_rate: 0, landed: 9, rb2b: 0, hotjar_sessions: 0,
    meetings: 0, companies: '', cost_per_meeting: null, efficiency_score: 12,
  },
  {
    id: 4, name: 'MCP Server (carry over from April)', status: 'active',
    spend: 451.58, impressions: 3142, clicks: 237, ctr: 7.54, cpm: 143.72, cpc: 1.91,
    comments: 864, icp_comments: 35, icp_rate: 4.1, landed: 29, rb2b: 0, hotjar_sessions: 0,
    meetings: 0, companies: '', cost_per_meeting: null, efficiency_score: 45,
  },
  {
    id: 5, name: 'Unleash testimonial', status: 'active',
    spend: 231.85, impressions: 1971, clicks: 87, ctr: 4.41, cpm: 117.63, cpc: 2.66,
    comments: 0, icp_comments: 0, icp_rate: 0, landed: 0, rb2b: 0, hotjar_sessions: 0,
    meetings: 0, companies: '', cost_per_meeting: null, efficiency_score: 30,
  },
  {
    id: 6, name: 'Mixpanel for your MCP server', status: 'paused',
    spend: 0, impressions: 0, clicks: 0, ctr: 0, cpm: 0, cpc: 0,
    comments: 0, icp_comments: 0, icp_rate: 0, landed: 0, rb2b: 0, hotjar_sessions: 0,
    meetings: 0, companies: '', cost_per_meeting: null, efficiency_score: 0,
  },
];

const TOTALS = {
  spend: MOCK_CAMPAIGNS.reduce((s, c) => s + c.spend, 0),
  impressions: MOCK_CAMPAIGNS.reduce((s, c) => s + c.impressions, 0),
  clicks: MOCK_CAMPAIGNS.reduce((s, c) => s + c.clicks, 0),
  meetings: MOCK_CAMPAIGNS.reduce((s, c) => s + c.meetings, 0),
  comments: MOCK_CAMPAIGNS.reduce((s, c) => s + c.comments, 0),
  icp_comments: MOCK_CAMPAIGNS.reduce((s, c) => s + c.icp_comments, 0),
  landed: MOCK_CAMPAIGNS.reduce((s, c) => s + c.landed, 0),
};

export default function MarketingOverviewPage() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('month');
  const [selectedDate, setSelectedDate] = useState('2026-05-01');

  const avgCtr = TOTALS.impressions > 0 ? (TOTALS.clicks / TOTALS.impressions * 100) : 0;
  const costPerMeeting = TOTALS.meetings > 0 ? TOTALS.spend / TOTALS.meetings : 0;
  const icpRate = TOTALS.comments > 0 ? (TOTALS.icp_comments / TOTALS.comments * 100) : 0;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Marketing Overview</h1>
          <p className="text-muted-foreground mt-1">
            LinkedIn campaign performance & ICP engagement analytics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DateFilter
            period={period}
            onPeriodChange={setPeriod}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
          />
          <Button variant="outline" size="sm">
            <Upload className="w-4 h-4 mr-2" />
            Upload CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <MarketingKpiCard
          title="Total Spend"
          value={`$${TOTALS.spend.toFixed(0)}`}
          subtitle="This month"
          trend={{ value: -51.3, label: 'vs last month' }}
          icon={<DollarSign className="w-4 h-4" />}
          sparkData={[6357, 4200, 5100, 3094]}
        />
        <MarketingKpiCard
          title="Impressions"
          value={TOTALS.impressions.toLocaleString()}
          subtitle="Total reach"
          trend={{ value: -22, label: 'vs last month' }}
          icon={<Eye className="w-4 h-4" />}
          sparkData={[28000, 32000, 25000, 20965]}
        />
        <MarketingKpiCard
          title="Clicks"
          value={TOTALS.clicks.toLocaleString()}
          subtitle={`${avgCtr.toFixed(2)}% avg CTR`}
          trend={{ value: 15, label: 'vs last month' }}
          icon={<MousePointerClick className="w-4 h-4" />}
          sparkData={[800, 950, 1100, 1275]}
        />
        <MarketingKpiCard
          title="Meetings"
          value={String(TOTALS.meetings)}
          subtitle="Booked this month"
          trend={{ value: -78.6, label: 'vs last month' }}
          icon={<CalendarCheck className="w-4 h-4" />}
          sparkData={[14, 8, 5, 3]}
        />
        <MarketingKpiCard
          title="Cost / Meeting"
          value={costPerMeeting > 0 ? `$${costPerMeeting.toFixed(0)}` : '—'}
          subtitle="Avg acquisition cost"
          trend={{ value: 127, label: 'vs last month' }}
          icon={<TrendingUp className="w-4 h-4" />}
          sparkData={[454, 580, 720, 1031]}
        />
        <MarketingKpiCard
          title="ICP Engagement"
          value={`${icpRate.toFixed(1)}%`}
          subtitle={`${TOTALS.icp_comments} of ${TOTALS.comments} commenters`}
          icon={<Users className="w-4 h-4" />}
          sparkData={[5, 8, 6, 8.3]}
        />
      </div>

      {/* Funnel */}
      <CampaignFunnel
        steps={[
          { label: 'Impressions', value: TOTALS.impressions, color: '#5f33d6' },
          { label: 'Clicks', value: TOTALS.clicks, color: '#7c5ce7' },
          { label: 'LI Conv', value: Math.floor(TOTALS.clicks * 0.15), color: '#a084f0' },
          { label: 'GA4 (Landed)', value: TOTALS.landed, color: '#4ade80' },
          { label: 'Identified', value: Math.floor(TOTALS.landed * 0.4), color: '#34d399' },
          { label: 'Engaged', value: Math.floor(TOTALS.landed * 0.25), color: '#10b981' },
          { label: 'Meetings', value: TOTALS.meetings, color: '#059669' },
        ]}
      />

      {/* Campaign Table */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Campaign Performance
        </h2>
        <CampaignTable campaigns={MOCK_CAMPAIGNS} />
      </div>

      {/* ICP Summary & Meeting Sources */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* ICP Donut */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              ICP Engagement Split
            </h3>
            <IcpDonut
              icpCount={TOTALS.icp_comments}
              nonIcpCount={TOTALS.comments - TOTALS.icp_comments}
            />
          </div>

          {/* Top Campaigns by ICP */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Top by ICP Rate
            </h3>
            <div className="space-y-3">
              {MOCK_CAMPAIGNS
                .filter(c => c.icp_rate > 0)
                .sort((a, b) => b.icp_rate - a.icp_rate)
                .slice(0, 5)
                .map(c => (
                  <div key={c.id} className="flex items-center justify-between">
                    <span className="text-xs font-medium truncate max-w-[160px]">{c.name}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(c.icp_rate * 5, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-primary font-semibold w-10 text-right">
                        {c.icp_rate.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Meeting Sources */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Meeting Sources
            </h3>
            <div className="space-y-2.5">
              {MOCK_CAMPAIGNS
                .filter(c => c.meetings > 0)
                .map(c => (
                  <div key={c.id} className="flex items-center justify-between text-xs">
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-muted-foreground text-[10px]">{c.companies}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-emerald-500 font-semibold">{c.meetings} mtg</span>
                      <span className="text-muted-foreground">
                        {c.cost_per_meeting ? `$${c.cost_per_meeting.toFixed(0)}` : '—'}/mtg
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
      </div>
    </div>
  );
}
