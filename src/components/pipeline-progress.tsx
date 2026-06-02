'use client';

import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle2, PlayCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PipelineProgressProps {
  status: 'idle' | 'running' | 'completed' | 'error' | 'stopping';
  completed: number;
  total: number;
  currentDomain: string;
  errors: string[];
  onStop?: () => void;
}

export function PipelineProgress({ status, completed, total, currentDomain, errors, onStop }: PipelineProgressProps) {
  if (status === 'idle') return null;
  
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {(status === 'running' || status === 'stopping') && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
          {status === 'completed' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
          {status === 'error' && <AlertCircle className="w-5 h-5 text-destructive" />}
          
          <div>
            <h3 className="text-sm font-medium">
              {status === 'running' && 'Classification in progress...'}
              {status === 'stopping' && 'Stopping classification...'}
              {status === 'completed' && 'Classification complete'}
              {status === 'error' && 'Classification error'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {status === 'running' && `Processing ${currentDomain}`}
              {status === 'stopping' && `Waiting for current company to finish...`}
              {status === 'completed' && `Processed ${completed} companies`}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          {status === 'running' && onStop && (
            <Button variant="outline" size="sm" onClick={onStop} className="text-red-500 hover:text-red-600 hover:bg-red-500/10">
              Stop Process
            </Button>
          )}
          <div className="text-right">
            <div className="text-2xl font-bold tracking-tight">{percentage}%</div>
            <div className="text-xs text-muted-foreground">{completed} / {total}</div>
          </div>
        </div>
      </div>
      
      <Progress value={percentage} className="h-2 bg-muted" />
      
      {errors.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <div className="text-xs font-medium text-amber-500 mb-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {errors.length} warnings encountered
          </div>
          <div className="max-h-20 overflow-y-auto text-[10px] text-muted-foreground space-y-1 pr-2 hide-scrollbar">
            {errors.map((err, i) => (
              <div key={i} className="truncate">{err}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
