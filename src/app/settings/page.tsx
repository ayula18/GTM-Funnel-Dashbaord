'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Key } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.openai_api_key) {
          setApiKey(data.openai_api_key);
          setIsSaved(true);
        }
        setLoading(false);
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openai_api_key: apiKey }),
      });

      if (!res.ok) throw new Error('Failed to save settings');
      
      setIsSaved(true);
      toast.success('Settings saved');
    } catch (error: any) {
      toast.error('Error saving settings', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8">Loading settings...</div>;
  }

  return (
    <div className="p-8 space-y-8 max-w-4xl mx-auto w-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure integrations and API keys.</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-indigo-500" />
            OpenAI Configuration
          </CardTitle>
          <CardDescription>
            API key for GPT-4o-mini classification pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4 max-w-xl">
            <div className="space-y-2">
              <Label htmlFor="apiKey">OpenAI API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="sk-proj-..."
                value={apiKey}
                onChange={e => {
                  setApiKey(e.target.value);
                  setIsSaved(false);
                }}
                className="bg-card border-border font-mono"
              />
              {isSaved && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-500 mt-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Key is saved and active
                </div>
              )}
            </div>

            <Button 
              type="submit" 
              className="bg-indigo-600 hover:bg-indigo-700 text-foreground"
              disabled={saving || !apiKey || isSaved}
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
