'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PipelineProgress } from '@/components/pipeline-progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CONSOLE_SCRIPT } from '@/lib/linkedin-scraper';
import { toast } from 'sonner';
import {
  Code2,
  MessageSquareText,
  Users,
  Download,
  Copy,
  Search,
  ChevronDown,
  ChevronUp,
  Upload,
  ExternalLink,
  UserCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  Link2,
  Trash2,
  Play,
  RefreshCw,
  Briefcase,
  ArrowUpDown,
  BarChart3,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ── Types ──────────────────────────────────────────────────────────────

interface Post {
  id: number;
  campaign_tag: string;
  post_url: string;
  post_title: string | null;
  last_scraped: string | null;
  comment_count: number;
  profile_count: number;
}

interface Profile {
  id: number;
  slug: string;
  name: string;
  headline: string | null;
  profile_url: string;
  parsed_company: string | null;
  parsed_designation: string | null;
  enriched_company_name: string | null;
  enriched_company_domain: string | null;
  enriched_company_linkedin: string | null;
  icp_status: string | null;
  comment_count: number;
  campaigns: string | null;
}

interface CommentRow {
  id: number;
  comment_text: string | null;
  is_reply: boolean;
  scraped_at: string;
  profile_name: string;
  profile_slug: string;
  profile_headline: string | null;
  profile_url: string;
  post_title: string | null;
  post_url: string;
  icp_status: string | null;
  enriched_company_name: string | null;
  is_customer: boolean;
}

interface Stats {
  total_comments: number;
  unique_profiles: number;
  icp_profiles: number;
  non_icp_profiles: number;
  pending_profiles: number;
  enriched_profiles: number;
  icp_rate: number;
}

// ── Helpers ────────────────────────────────────────────────────────────

function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const IcpBadge = ({ status }: { status: string | null }) => {
  const s = (status || '').toLowerCase().trim();
  if (s === 'yes' || s === 'true') return (
    <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]">
      <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> ICP
    </Badge>
  );
  if (s === 'no' || s === 'false') return (
    <Badge className="bg-red-500/10 text-red-400 border-red-500/30 text-[10px]">
      <XCircle className="w-2.5 h-2.5 mr-1" /> Non-ICP
    </Badge>
  );
  return (
    <Badge variant="secondary" className="text-[10px]">
      <AlertCircle className="w-2.5 h-2.5 mr-1" /> Pending
    </Badge>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────

export default function CommentIntelPage() {
  // Campaign selection
  const [campaignTags, setCampaignTags] = useState<string[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');
  const [newCampaignName, setNewCampaignName] = useState('');
  const [showNewCampaign, setShowNewCampaign] = useState(false);

  // Posts
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPostUrl, setNewPostUrl] = useState('');
  const [newPostTitle, setNewPostTitle] = useState('');
  const [showAddPost, setShowAddPost] = useState(false);
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editingPostTitle, setEditingPostTitle] = useState('');

  // Scraping
  const [scrapePostId, setScrapePostId] = useState<number | null>(null);
  const [html, setHtml] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [copied, setCopied] = useState('');

  // Data
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentTotal, setCommentTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);

  // Filters
  const [profileTab, setProfileTab] = useState<'all' | 'pending' | 'enriched' | 'icp' | 'non-icp'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('posts');
  const [filterCustomer, setFilterCustomer] = useState<string>('all');
  const [filterIcp, setFilterIcp] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPost, setFilterPost] = useState<string>('all');

  // Enrichment
  const [isEnriching, setIsEnriching] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [activeFunnelId, setActiveFunnelId] = useState<number | null>(null);

  const [pipelineState, setPipelineState] = useState<{
    status: 'idle' | 'running' | 'stopping' | 'completed' | 'error';
    completed: number;
    total: number;
    currentDomain: string;
    errors: string[];
  }>({
    status: 'idle',
    completed: 0,
    total: 0,
    currentDomain: '',
    errors: []
  });

  const stopRef = useRef(false);
  const drivingRef = useRef(false);

  // ── Data fetching ──────────────────────────────────────────────────

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch('/api/comments/posts');
      const data = await res.json();
      setCampaignTags(data.campaigns || []);
    } catch { /* ignore */ }
  }, []);

  const fetchPosts = useCallback(async () => {
    if (!selectedCampaign) return;
    try {
      const res = await fetch(`/api/comments/posts?campaign=${encodeURIComponent(selectedCampaign)}`);
      const data = await res.json();
      setPosts(data.posts || []);
    } catch { /* ignore */ }
  }, [selectedCampaign]);

  const fetchProfiles = useCallback(async () => {
    if (!selectedCampaign) return;
    try {
      const params = new URLSearchParams({
        campaign: selectedCampaign,
        status: profileTab,
      });
      if (searchQuery) params.set('search', searchQuery);
      const res = await fetch(`/api/comments/profiles?${params}`);
      const data = await res.json();
      setProfiles(data.profiles || []);
    } catch { /* ignore */ }
  }, [selectedCampaign, profileTab, searchQuery]);

  const fetchComments = useCallback(async () => {
    if (!selectedCampaign) return;
    try {
      const params = new URLSearchParams({
        campaign: selectedCampaign,
        view: 'comments',
        limit: '100',
      });
      if (searchQuery) params.set('search', searchQuery);
      if (filterCustomer !== 'all') params.set('is_customer', filterCustomer === 'yes' ? 'true' : 'false');
      if (filterIcp !== 'all') params.set('icp_status', filterIcp);
      if (filterType !== 'all') params.set('is_reply', filterType === 'reply' ? 'true' : 'false');
      if (filterPost !== 'all') params.set('post_id', filterPost);
      
      const res = await fetch(`/api/comments/profiles?${params}`);
      const data = await res.json();
      setComments(data.comments || []);
      setCommentTotal(data.total || 0);
    } catch { /* ignore */ }
  }, [selectedCampaign, searchQuery, filterCustomer, filterIcp, filterType, filterPost]);

  const fetchStats = useCallback(async () => {
    if (!selectedCampaign) return;
    try {
      const res = await fetch(`/api/comments/profiles?campaign=${encodeURIComponent(selectedCampaign)}&view=stats`);
      const data = await res.json();
      setStats(data.stats || null);
    } catch { /* ignore */ }
  }, [selectedCampaign]);

  const refreshAll = useCallback(() => {
    fetchPosts();
    fetchProfiles();
    fetchComments();
    fetchStats();
  }, [fetchPosts, fetchProfiles, fetchComments, fetchStats]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);
  useEffect(() => { if (selectedCampaign) refreshAll(); }, [selectedCampaign, refreshAll]);
  useEffect(() => { fetchProfiles(); }, [profileTab, fetchProfiles]);
  useEffect(() => { fetchComments(); }, [filterCustomer, filterIcp, filterType, filterPost, fetchComments]);

  // ── Handlers ───────────────────────────────────────────────────────

  const handleCreateCampaign = () => {
    if (!newCampaignName.trim()) return;
    setSelectedCampaign(newCampaignName.trim());
    setCampaignTags(prev => [...new Set([...prev, newCampaignName.trim()])]);
    setNewCampaignName('');
    setShowNewCampaign(false);
  };

  const handleAddPost = async () => {
    if (!newPostUrl.trim() || !selectedCampaign) return;
    try {
      const res = await fetch('/api/comments/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_tag: selectedCampaign,
          post_url: newPostUrl.trim(),
          post_title: newPostTitle.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success('Post added');
      setNewPostUrl('');
      setNewPostTitle('');
      setShowAddPost(false);
      fetchPosts();
    } catch (e) {
      toast.error('Failed to add post', { description: (e as Error).message });
    }
  };

  const handleDeletePost = async (postId: number) => {
    try {
      await fetch(`/api/comments/posts?id=${postId}`, { method: 'DELETE' });
      toast.success('Post deleted');
      fetchPosts();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleEditPostSubmit = async (postId: number) => {
    try {
      const res = await fetch('/api/comments/posts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: postId, post_title: editingPostTitle.trim() || null }),
      });
      if (!res.ok) throw new Error('Failed to update title');
      toast.success('Title updated');
      setEditingPostId(null);
      fetchPosts();
    } catch {
      toast.error('Failed to update title');
    }
  };

  const handleScrape = async () => {
    if (!scrapePostId || !html.trim()) return;
    setIsScraping(true);
    try {
      const res = await fetch('/api/comments/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: scrapePostId, html }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const r = data.result;
      toast.success(`Extracted ${r.totalExtracted} comments`, {
        description: `${r.newProfiles} new profiles, ${r.newComments} new comments, ${r.duplicateComments} duplicates skipped`,
      });
      setHtml('');
      setScrapePostId(null);
      refreshAll();
    } catch (e) {
      toast.error('Scrape failed', { description: (e as Error).message });
    } finally {
      setIsScraping(false);
    }
  };

  const handleEnrichUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsEnriching(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/comments/enrich', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(`Enrichment complete`, {
        description: `${data.matched} matched, ${data.updated} updated out of ${data.total_rows} rows`,
      });
      refreshAll();
    } catch (err) {
      toast.error('Enrichment failed', { description: (err as Error).message });
    } finally {
      setIsEnriching(false);
      e.target.value = '';
    }
  };

  const drive = useCallback(async (funnelId: number) => {
    if (drivingRef.current) return;
    drivingRef.current = true;
    stopRef.current = false;
    setPipelineState(prev => ({ ...prev, status: 'running' }));

    try {
      while (!stopRef.current) {
        const res = await fetch('/api/classify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ funnel_id: funnelId }),
        });
        const data = await res.json();
        
        if (!res.ok) {
          toast.error('Classification error', { description: data.error });
          setPipelineState(prev => ({ ...prev, status: 'error' }));
          break;
        }
        
        setPipelineState(prev => ({
          status: data.done ? 'idle' : 'running',
          completed: data.completed ?? prev.completed,
          total: data.total ?? prev.total,
          currentDomain: '',
          errors: [...prev.errors, ...(data.errors || [])].slice(-50),
        }));
        
        if (data.done) {
          if (!data.stopped) {
            toast.success('Classification complete', { description: 'Syncing results back to profiles...' });
            // Sync the ICP results back to the profiles
            try {
              await fetch('/api/comments/classify/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ campaign_tag: selectedCampaign }),
              });
              toast.success('Sync complete');
              refreshAll();
            } catch (syncErr) {
              toast.error('Sync failed', { description: (syncErr as Error).message });
            }
          }
          break;
        }
      }
    } catch (error) {
      toast.error('Pipeline error', { description: (error as Error).message });
      setPipelineState(prev => ({ ...prev, status: 'error' }));
    } finally {
      drivingRef.current = false;
      setIsClassifying(false);
      if (!stopRef.current) {
        setPipelineState(prev => ({ ...prev, status: 'idle' }));
      }
    }
  }, [selectedCampaign, refreshAll]);

  const stopPipeline = async () => {
    stopRef.current = true;
    setPipelineState(prev => ({ ...prev, status: 'idle' }));
    if (activeFunnelId) {
      try {
        await fetch('/api/classify/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ funnel_id: activeFunnelId }),
        });
      } catch { /* best-effort */ }
    }
    toast.info('Classification stopped.');
  };

  const handleRunIcp = async () => {
    if (!selectedCampaign) return;
    setIsClassifying(true);
    setPipelineState(prev => ({ ...prev, errors: [] }));
    try {
      const res = await fetch('/api/comments/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_tag: selectedCampaign }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(data.message || 'Classification started');
      
      if (data.funnel_id) {
        if (data.unclassified_to_process > 0) {
          setActiveFunnelId(data.funnel_id);
          setPipelineState(prev => ({ 
            ...prev, 
            status: 'running',
            total: data.unclassified_to_process,
            completed: 0 
          }));
          // Start the client-driven loop
          drive(data.funnel_id);
        } else {
          toast.info('Companies already classified', { description: 'Syncing results to profiles...' });
          try {
            await fetch('/api/comments/classify/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ campaign_tag: selectedCampaign }),
            });
            toast.success('Sync complete');
            refreshAll();
          } catch (syncErr) {
            toast.error('Sync failed', { description: (syncErr as Error).message });
          }
          setIsClassifying(false);
        }
      } else {
        setIsClassifying(false);
      }
    } catch (err) {
      toast.error('Classification failed', { description: (err as Error).message });
      setIsClassifying(false);
    }
  };

  const handleExportProfiles = () => {
    const header = 'Name,Slug,Profile URL,Headline,Parsed Company,Comment Count';
    const esc = (s: string) => '"' + (s || '').replace(/"/g, '""') + '"';
    const rows = profiles.map(p =>
      [esc(p.name), esc(p.slug), esc(p.profile_url), esc(p.headline || ''), esc(p.parsed_company || ''), String(p.comment_count)].join(',')
    );
    downloadFile('\uFEFF' + [header, ...rows].join('\n'), `comment_intel_${selectedCampaign}_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const doCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Comment Intelligence</h1>
          <p className="text-muted-foreground mt-1">
            Scrape LinkedIn comments → Enrich in Clay → Classify ICP → Campaign analytics
          </p>
        </div>
      </div>

      {/* Campaign Selector */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Campaign</span>
            <select
              value={selectedCampaign}
              onChange={e => setSelectedCampaign(e.target.value)}
              className="bg-muted/30 border border-border rounded-lg text-sm px-3 py-1.5 min-w-[200px] outline-none focus:border-primary/50"
            >
              <option value="">Select a campaign...</option>
              {campaignTags.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {!showNewCampaign ? (
            <Button variant="outline" size="sm" onClick={() => setShowNewCampaign(true)}>
              <Plus className="w-3 h-3 mr-1.5" /> New Campaign
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Campaign name..."
                value={newCampaignName}
                onChange={e => setNewCampaignName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateCampaign()}
                className="bg-muted/30 border border-border rounded-lg text-sm px-3 py-1.5 w-48 outline-none focus:border-primary/50"
                autoFocus
              />
              <Button size="sm" onClick={handleCreateCampaign} disabled={!newCampaignName.trim()}>Create</Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowNewCampaign(false); setNewCampaignName(''); }}>Cancel</Button>
            </div>
          )}

          {selectedCampaign && (
            <Button variant="outline" size="sm" onClick={refreshAll}>
              <RefreshCw className="w-3 h-3 mr-1.5" /> Refresh
            </Button>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      {stats && selectedCampaign && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Comments</div>
            <div className="text-2xl font-bold mt-1">{stats.total_comments}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Unique Profiles</div>
            <div className="text-2xl font-bold mt-1 text-primary">{stats.unique_profiles}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Enriched</div>
            <div className="text-2xl font-bold mt-1">{stats.enriched_profiles}</div>
            <div className="text-[10px] text-muted-foreground">{stats.pending_profiles} pending</div>
          </div>
          <div className="bg-card border border-emerald-500/30 rounded-xl p-4">
            <div className="text-[10px] text-emerald-500 font-medium uppercase tracking-wider">ICP</div>
            <div className="text-2xl font-bold mt-1 text-emerald-500">{stats.icp_profiles}</div>
          </div>
          <div className="bg-card border border-red-500/30 rounded-xl p-4">
            <div className="text-[10px] text-red-400 font-medium uppercase tracking-wider">Non-ICP</div>
            <div className="text-2xl font-bold mt-1 text-red-400">{stats.non_icp_profiles}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">ICP Rate</div>
            <div className="text-2xl font-bold mt-1">{stats.icp_rate > 0 ? `${stats.icp_rate.toFixed(1)}%` : '—'}</div>
          </div>
        </div>
      )}

      {/* No campaign selected state */}
      {!selectedCampaign && (
        <div className="bg-card border border-border rounded-xl p-16 text-center">
          <MessageSquareText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold">Select or create a campaign</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Each campaign can have multiple LinkedIn posts. Scrape comments from each post, enrich the profiles in Clay, and run ICP classification.
          </p>
        </div>
      )}

      {/* Pipeline Progress */}
      {pipelineState.status !== 'idle' && (
        <PipelineProgress {...pipelineState} onStop={stopPipeline} />
      )}

      {/* Main Tabs (shown when campaign is selected) */}
      {selectedCampaign && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="posts" className="text-xs gap-1.5">
              <Link2 className="w-3 h-3" />
              Posts ({posts.length})
            </TabsTrigger>
            <TabsTrigger value="comments" className="text-xs gap-1.5">
              <MessageSquareText className="w-3 h-3" />
              Comments ({stats?.total_comments || 0})
            </TabsTrigger>
            <TabsTrigger value="profiles" className="text-xs gap-1.5">
              <Users className="w-3 h-3" />
              Profiles ({stats?.unique_profiles || 0})
            </TabsTrigger>
            <TabsTrigger value="summary" className="text-xs gap-1.5">
              <BarChart3 className="w-3 h-3" />
              ICP Summary
            </TabsTrigger>
          </TabsList>

          {/* ═══════════ POSTS TAB ═══════════ */}
          <TabsContent value="posts" className="mt-6 space-y-4">
            {/* Add post form */}
            <div className="flex items-center gap-2">
              {!showAddPost ? (
                <Button variant="outline" size="sm" onClick={() => setShowAddPost(true)}>
                  <Plus className="w-3 h-3 mr-1.5" /> Add LinkedIn Post
                </Button>
              ) : (
                <div className="flex items-center gap-2 flex-wrap bg-card border border-border rounded-xl p-4 w-full">
                  <input
                    type="text"
                    placeholder="LinkedIn post URL"
                    value={newPostUrl}
                    onChange={e => setNewPostUrl(e.target.value)}
                    className="bg-muted/30 border border-border rounded-lg text-xs px-3 py-2 flex-1 min-w-[300px] outline-none focus:border-primary/50 font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Label (e.g. AI Agents post #3)"
                    value={newPostTitle}
                    onChange={e => setNewPostTitle(e.target.value)}
                    className="bg-muted/30 border border-border rounded-lg text-xs px-3 py-2 w-56 outline-none focus:border-primary/50"
                  />
                  <Button size="sm" onClick={handleAddPost} disabled={!newPostUrl.trim()}>Add Post</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowAddPost(false); setNewPostUrl(''); setNewPostTitle(''); }}>Cancel</Button>
                </div>
              )}
            </div>

            {/* Console script accordion */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setShowScript(!showScript)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium">Console Script — Auto-load all comments</span>
                </div>
                {showScript ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
              </button>
              {showScript && (
                <div className="px-5 pb-4 border-t border-border/50 pt-3 space-y-3">
                  <div className="text-xs text-muted-foreground space-y-1">
                    <ol className="list-decimal list-inside space-y-0.5">
                      <li>Open LinkedIn post → <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">F12</kbd> → Console</li>
                      <li>Paste script → Enter. Wait for &quot;DONE&quot;</li>
                      <li>Right-click comments container → <span className="text-foreground font-medium">Copy outerHTML</span></li>
                    </ol>
                  </div>
                  <div className="relative">
                    <pre className="bg-muted/50 border border-border rounded-lg p-3 text-[10px] text-muted-foreground font-mono overflow-auto max-h-32 leading-relaxed">{CONSOLE_SCRIPT}</pre>
                    <Button variant="outline" size="sm" className="absolute top-2 right-2 h-6 text-[10px]" onClick={() => doCopy(CONSOLE_SCRIPT, 'script')}>
                      {copied === 'script' ? <><CheckCircle2 className="w-3 h-3 mr-1 text-emerald-500" /> Copied</> : <><Copy className="w-3 h-3 mr-1" /> Copy</>}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Posts list */}
            {posts.length === 0 ? (
              <div className="bg-card border border-dashed border-border rounded-xl p-10 text-center">
                <Link2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No posts added yet. Add a LinkedIn post URL above to start scraping comments.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {posts.map(post => (
                  <div key={post.id} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {editingPostId === post.id ? (
                            <div className="flex items-center gap-2 flex-1 max-w-sm">
                              <input
                                type="text"
                                value={editingPostTitle}
                                onChange={e => setEditingPostTitle(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleEditPostSubmit(post.id);
                                  if (e.key === 'Escape') setEditingPostId(null);
                                }}
                                className="bg-muted/30 border border-border rounded-md text-sm px-2 py-1 outline-none focus:border-primary/50 w-full"
                                autoFocus
                              />
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-emerald-500 shrink-0" onClick={() => handleEditPostSubmit(post.id)}>
                                <Check className="w-3 h-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground shrink-0" onClick={() => setEditingPostId(null)}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <span className="text-sm font-medium truncate flex items-center gap-2">
                                {post.post_title || 'Untitled Post'}
                                <button
                                  onClick={() => { setEditingPostId(post.id); setEditingPostTitle(post.post_title || ''); }}
                                  className="text-muted-foreground/50 hover:text-foreground transition-colors"
                                  title="Edit Post Title"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              </span>
                            </>
                          )}
                          {post.last_scraped && (
                            <Badge variant="secondary" className="text-[9px] shrink-0">
                              Last scraped: {new Date(post.last_scraped).toLocaleDateString()}
                            </Badge>
                          )}
                        </div>
                        <a href={post.post_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline font-mono truncate block max-w-lg">
                          {post.post_url}
                        </a>
                        <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                          <span>{post.comment_count} comments</span>
                          <span>{post.profile_count} unique profiles</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant={scrapePostId === post.id ? 'default' : 'outline'}
                          className="h-7 text-[10px]"
                          onClick={() => setScrapePostId(scrapePostId === post.id ? null : post.id)}
                        >
                          <Play className="w-3 h-3 mr-1" />
                          {scrapePostId === post.id ? 'Scraping...' : 'Scrape'}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-[10px] text-red-400" onClick={() => handleDeletePost(post.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Inline scrape textarea */}
                    {scrapePostId === post.id && (
                      <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
                        <textarea
                          value={html}
                          onChange={e => setHtml(e.target.value)}
                          placeholder="Paste LinkedIn comments outerHTML here..."
                          className="w-full h-36 bg-muted/30 border border-border rounded-lg text-xs font-mono p-3 resize-y outline-none focus:border-primary/50"
                        />
                        <div className="flex items-center gap-3">
                          <Button onClick={handleScrape} disabled={!html.trim() || isScraping} size="sm">
                            {isScraping ? 'Processing...' : 'Extract & Save'}
                          </Button>
                          {html.length > 0 && <span className="text-[10px] text-muted-foreground">{(html.length / 1024).toFixed(0)} KB</span>}
                          <Button size="sm" variant="ghost" onClick={() => { setScrapePostId(null); setHtml(''); }}>Cancel</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ═══════════ COMMENTS TAB ═══════════ */}
          <TabsContent value="comments" className="mt-6 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-col lg:flex-row lg:items-center">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search comments..."
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); }}
                    onKeyDown={e => e.key === 'Enter' && fetchComments()}
                    className="bg-muted/30 border border-border rounded-lg text-xs pl-9 pr-3 py-2 w-64 outline-none focus:border-primary/50"
                  />
                </div>
                
                <Select value={filterCustomer} onValueChange={(val) => setFilterCustomer(val || 'all')}>
                  <SelectTrigger className="w-36 h-9 text-xs bg-muted/30">
                    <SelectValue placeholder="Is Customer?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem className="text-xs" value="all">Is Customer? (All)</SelectItem>
                    <SelectItem className="text-xs" value="yes">Yes</SelectItem>
                    <SelectItem className="text-xs" value="no">No</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterIcp} onValueChange={(val) => setFilterIcp(val || 'all')}>
                  <SelectTrigger className="w-28 h-9 text-xs bg-muted/30">
                    <SelectValue placeholder="ICP" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem className="text-xs" value="all">ICP (All)</SelectItem>
                    <SelectItem className="text-xs" value="Yes">Yes</SelectItem>
                    <SelectItem className="text-xs" value="No">No</SelectItem>
                    <SelectItem className="text-xs" value="Pending">Pending</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterType} onValueChange={(val) => setFilterType(val || 'all')}>
                  <SelectTrigger className="w-32 h-9 text-xs bg-muted/30">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem className="text-xs" value="all">Type (All)</SelectItem>
                    <SelectItem className="text-xs" value="comment">Comment</SelectItem>
                    <SelectItem className="text-xs" value="reply">Reply</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterPost} onValueChange={(val) => setFilterPost(val || 'all')}>
                  <SelectTrigger className="w-48 h-9 text-xs bg-muted/30 truncate">
                    <SelectValue placeholder="Post" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem className="text-xs" value="all">Post (All)</SelectItem>
                    {posts.map(p => (
                      <SelectItem className="text-xs" key={p.id} value={p.id.toString()}>{p.post_title || 'Untitled Post'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-xs text-muted-foreground">{commentTotal} total comments</span>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-8 text-xs"
                  onClick={() => {
                    if (selectedCampaign) {
                      window.open(`/api/comments/export?campaign=${encodeURIComponent(selectedCampaign)}`, '_blank');
                    }
                  }}
                >
                  <Download className="w-3.5 h-3.5 mr-2" />
                  Export CSV
                </Button>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase w-8">#</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase w-36">Name</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase">Comment</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase w-32">Company</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase w-20">Customer?</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase w-20">ICP</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase w-28">Post</th>
                      <th className="text-center px-4 py-3 font-semibold text-muted-foreground uppercase w-16">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comments.map((c, i) => (
                      <tr key={c.id} className={cn("border-b border-border/30 hover:bg-muted/10", c.is_reply && "bg-muted/5")}>
                        <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-2.5">
                          <a href={c.profile_url} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-primary transition-colors">{c.profile_name}</a>
                          <div className="text-[10px] text-muted-foreground truncate max-w-[130px]">{c.profile_headline || ''}</div>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground leading-relaxed max-w-md">{c.comment_text || '—'}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-[10px]">{c.enriched_company_name || '—'}</td>
                        <td className="px-4 py-2.5">
                          {c.is_customer ? (
                            <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 bg-emerald-500/10 text-[9px]">Yes</Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/50">No</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5"><IcpBadge status={c.icp_status} /></td>
                        <td className="px-4 py-2.5 text-[10px] text-muted-foreground truncate max-w-[100px]">{c.post_title || 'Untitled'}</td>
                        <td className="px-4 py-2.5 text-center">
                          {c.is_reply ? <Badge variant="secondary" className="text-[9px]">Reply</Badge> : <Badge className="bg-primary/10 text-primary border-primary/30 text-[9px]">Comment</Badge>}
                        </td>
                      </tr>
                    ))}
                    {comments.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No comments yet. Scrape a LinkedIn post first.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* ═══════════ PROFILES TAB ═══════════ */}
          <TabsContent value="profiles" className="mt-6 space-y-4">
            {/* Controls */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search profiles..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && fetchProfiles()}
                    className="bg-muted/30 border border-border rounded-lg text-xs pl-9 pr-3 py-2 w-72 outline-none focus:border-primary/50"
                  />
                </div>
                <div className="flex items-center gap-1">
                  {(['all', 'pending', 'enriched', 'icp', 'non-icp'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setProfileTab(f)}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-[10px] font-medium transition-colors",
                        profileTab === f ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                      )}
                    >
                      {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : f === 'enriched' ? 'Enriched' : f === 'icp' ? 'ICP' : 'Non-ICP'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={handleExportProfiles}>
                  <Download className="w-3 h-3 mr-1" /> Export for Clay
                </Button>
                <div className="relative">
                  <input type="file" accept=".csv" onChange={handleEnrichUpload} className="absolute inset-0 opacity-0 cursor-pointer w-full" disabled={isEnriching} />
                  <Button variant="outline" size="sm" className="h-7 text-[10px]" disabled={isEnriching}>
                    <Upload className="w-3 h-3 mr-1" /> {isEnriching ? 'Uploading...' : 'Upload Enriched'}
                  </Button>
                </div>
                <Button
                  size="sm"
                  className="h-7 text-[10px] bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleRunIcp}
                  disabled={isClassifying || !stats || stats.enriched_profiles === 0}
                >
                  <Play className="w-3 h-3 mr-1" /> {isClassifying ? 'Running...' : 'Run ICP Pipeline'}
                </Button>
              </div>
            </div>

            {/* Profiles table */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase w-8">#</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase">Person</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase">Company</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase w-36">Domain</th>
                      <th className="text-center px-4 py-3 font-semibold text-muted-foreground uppercase w-20">ICP</th>
                      <th className="text-center px-4 py-3 font-semibold text-muted-foreground uppercase w-20">Comments</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase w-28">Profile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((p, i) => (
                      <tr key={p.id} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                        <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-[10px] text-muted-foreground truncate max-w-[250px]">
                            {p.parsed_designation && <span className="text-primary/70">{p.parsed_designation}</span>}
                            {p.parsed_designation && p.headline && ' · '}
                            {p.headline || ''}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          {p.enriched_company_name ? (
                            <span className="font-medium text-foreground flex items-center gap-1">
                              <Briefcase className="w-3 h-3 text-muted-foreground shrink-0" />
                              {p.enriched_company_name}
                            </span>
                          ) : p.parsed_company ? (
                            <span className="text-muted-foreground flex items-center gap-1 italic text-[10px]">
                              <Briefcase className="w-3 h-3 opacity-30 shrink-0" />
                              {p.parsed_company} <span className="text-[9px]">(parsed)</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {p.enriched_company_domain ? (
                            <a href={`https://${p.enriched_company_domain}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-[10px] flex items-center gap-1">
                              {p.enriched_company_domain} <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                            </a>
                          ) : <span className="text-muted-foreground/30">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center"><IcpBadge status={p.icp_status} /></td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge variant={p.comment_count > 1 ? 'default' : 'secondary'} className="text-[10px]">{p.comment_count}</Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          <a href={p.profile_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-[10px] flex items-center gap-1">
                            /in/{p.slug.slice(0, 14)} <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                          </a>
                        </td>
                      </tr>
                    ))}
                    {profiles.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                        {profileTab === 'pending' ? 'All profiles are enriched!' :
                         profileTab === 'icp' ? 'No ICP profiles yet. Run the ICP pipeline after enriching.' :
                         'No profiles yet. Scrape a LinkedIn post first.'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* ═══════════ ICP SUMMARY TAB ═══════════ */}
          <TabsContent value="summary" className="mt-6 space-y-4">
            {stats && stats.unique_profiles > 0 ? (
              <div className="space-y-6">
                {/* ICP Funnel */}
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Engagement → ICP Funnel</h3>
                  <div className="space-y-3">
                    {[
                      { label: 'Total Commenters', value: stats.unique_profiles, color: '#5f33d6', pct: 100 },
                      { label: 'Enriched (have domain)', value: stats.enriched_profiles, color: '#7c5ce7', pct: (stats.enriched_profiles / stats.unique_profiles) * 100 },
                      { label: 'ICP Match', value: stats.icp_profiles, color: '#10b981', pct: (stats.icp_profiles / stats.unique_profiles) * 100 },
                    ].map((step, i) => (
                      <div key={step.label} className="flex items-center gap-4">
                        <div className="w-40 text-xs text-muted-foreground">{step.label}</div>
                        <div className="flex-1 relative h-8 rounded-lg bg-muted/30 overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 rounded-lg flex items-center justify-center text-[10px] font-bold text-white min-w-[40px]"
                            style={{ width: `${Math.max(5, step.pct)}%`, background: step.color }}
                          >
                            {step.value}
                          </div>
                        </div>
                        <div className="w-12 text-right text-[10px] text-muted-foreground">
                          {i > 0 ? `${step.pct.toFixed(0)}%` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top ICP Profiles */}
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Top ICP Engagers</h3>
                  <div className="space-y-2">
                    {profiles
                      .filter(p => {
                        const s = (p.icp_status || '').toLowerCase();
                        return s === 'yes' || s === 'true';
                      })
                      .slice(0, 10)
                      .map((p, i) => (
                        <div key={p.id} className="flex items-center justify-between text-xs bg-muted/20 rounded-lg px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <span className="text-muted-foreground w-4">{i + 1}.</span>
                            <div>
                              <div className="font-medium">{p.name}</div>
                              <div className="text-[10px] text-muted-foreground">{p.enriched_company_name || p.parsed_company || ''} · {p.parsed_designation || ''}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge className="text-[10px]">{p.comment_count} comments</Badge>
                            <IcpBadge status={p.icp_status} />
                          </div>
                        </div>
                      ))}
                    {profiles.filter(p => (p.icp_status || '').toLowerCase() === 'yes' || (p.icp_status || '').toLowerCase() === 'true').length === 0 && (
                      <div className="text-center text-sm text-muted-foreground py-8">
                        No ICP profiles yet. Enrich profiles in Clay and run the ICP pipeline.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl p-16 text-center">
                <BarChart3 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-semibold">No data yet</h3>
                <p className="text-sm text-muted-foreground mt-1">Scrape comments and enrich profiles to see the ICP summary.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
