'use client';

import { FunnelSteps } from '@/lib/types';
import { formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { ChevronRight, TrendingDown, UploadCloud } from 'lucide-react';

interface FunnelBarProps {
  steps: FunnelSteps | null;
  activeStep: number | null;
  onStepClick: (step: number | null) => void;
  onUploadClick?: (step: number) => void;
}

export function FunnelBar({ steps, activeStep, onStepClick, onUploadClick }: FunnelBarProps) {
  if (!steps) return <div className="h-24 animate-pulse bg-muted rounded-xl" />;

  const stepData = [
    {
      step: 1,
      label: 'Raw Import',
      total: steps.step1_raw,
      netnew: null,
      drop: null,
      color: 'bg-slate-100 text-slate-800 hover:bg-slate-200',
      activeColor: 'bg-slate-200 ring-2 ring-slate-500 text-slate-900',
    },
    {
      step: 2,
      label: 'Enriched',
      total: steps.step2_apollo,
      netnew: null,
      drop: steps.step2_drop,
      color: 'bg-blue-50 text-blue-800 hover:bg-blue-100',
      activeColor: 'bg-blue-100 ring-2 ring-blue-500 text-blue-900',
    },
    {
      step: 3,
      label: 'Employee > 1',
      total: steps.step3_employees,
      netnew: null,
      drop: steps.step3_drop,
      color: 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100',
      activeColor: 'bg-indigo-100 ring-2 ring-indigo-500 text-indigo-900',
    },
    {
      step: 4,
      label: 'ICP Qualified',
      total: steps.step4_icp_total,
      netnew: steps.step4_icp_netnew,
      drop: steps.step4_drop,
      color: 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
      activeColor: 'bg-emerald-100 ring-2 ring-emerald-500 text-emerald-900',
    },
    {
      step: 5,
      label: 'Funded / Revenue',
      total: steps.step5_funded_total,
      netnew: steps.step5_funded_netnew,
      drop: steps.step5_drop,
      color: 'bg-green-50 text-green-800 hover:bg-green-100',
      activeColor: 'bg-green-100 ring-2 ring-green-500 text-green-900',
    },
  ];

  return (
    <div className="flex items-stretch gap-1 w-full overflow-x-auto pb-2">
      {/* Main View Button */}
      <div className="flex items-stretch mr-2 border-r border-border pr-3">
        <button
          onClick={() => onStepClick(null)}
          className={cn(
            "flex flex-col min-w-[130px] px-4 py-3 rounded-xl transition-all text-left relative",
            activeStep === null ? 'bg-slate-800 text-white ring-2 ring-slate-900' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
          )}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70 mb-1">
            Master Sheet
          </span>
          <span className="text-xs font-medium mb-1">All Data</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">{formatNumber(steps.step1_raw)}</span>
          </div>
        </button>
      </div>

      {stepData.map((s, index) => {
        const isActive = activeStep === s.step;
        
        return (
          <div key={s.step} className="flex items-stretch">
            <button
              onClick={() => onStepClick(isActive ? null : s.step)}
              className={cn(
                "flex flex-col min-w-[130px] px-4 py-3 rounded-xl transition-all text-left relative group",
                isActive ? s.activeColor : s.color
              )}
            >
              <div className="flex justify-between items-start w-full">
                <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70 mb-1">
                  Step {s.step}
                </span>
                {onUploadClick && (
                  <div 
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUploadClick(s.step);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 -mr-2 -mt-2 rounded-full hover:bg-black/5"
                    title="Upload data"
                  >
                    <UploadCloud className="w-3.5 h-3.5 opacity-60" />
                  </div>
                )}
              </div>
              <span className="text-xs font-medium mb-1">{s.label}</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{formatNumber(s.total)}</span>
              </div>
              {s.netnew !== null && s.netnew > 0 && (
                <div className="text-[10px] text-emerald-600 font-medium mt-0.5">
                  +{formatNumber(s.netnew)} NetNew
                </div>
              )}
            </button>
            
            {index < stepData.length - 1 && (
              <div className="flex flex-col items-center justify-center px-1.5 min-w-[40px]">
                <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                {s.drop !== null && s.drop > 0 && (
                  <div className="flex items-center gap-0.5 mt-0.5">
                    <TrendingDown className="w-2.5 h-2.5 text-red-400" />
                    <span className="text-[9px] text-red-400 font-medium">-{formatNumber(s.drop)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* IT Services callout */}
      {steps.step4_services > 0 && (
        <div className="flex flex-col items-center justify-center px-3 ml-2 border-l border-border">
          <span className="text-[10px] text-muted-foreground font-medium uppercase">IT Services</span>
          <span className="text-lg font-bold text-amber-600">{formatNumber(steps.step4_services)}</span>
        </div>
      )}
    </div>
  );
}
