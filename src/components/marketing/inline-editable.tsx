'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Pencil, Check, X } from 'lucide-react';

interface InlineEditableProps {
  value: string | number;
  onSave: (value: string) => void;
  type?: 'text' | 'number';
  prefix?: string;
  placeholder?: string;
  className?: string;
}

export function InlineEditable({
  value,
  onSave,
  type = 'text',
  prefix,
  placeholder = '—',
  className,
}: InlineEditableProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    onSave(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(String(value ?? ''));
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') handleCancel();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        {prefix && <span className="text-muted-foreground text-xs">{prefix}</span>}
        <input
          ref={inputRef}
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          className="bg-muted/50 border border-border rounded px-1.5 py-0.5 text-xs w-20 outline-none focus:ring-1 focus:ring-primary"
        />
        <button onClick={handleSave} className="text-emerald-500 hover:text-emerald-400 p-0.5">
          <Check className="w-3 h-3" />
        </button>
        <button onClick={handleCancel} className="text-muted-foreground hover:text-foreground p-0.5">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  const displayValue = value === '' || value === null || value === undefined
    ? placeholder
    : `${prefix || ''}${value}`;

  return (
    <button
      onClick={() => { setDraft(String(value ?? '')); setEditing(true); }}
      className={cn(
        "group flex items-center gap-1 text-xs hover:text-primary transition-colors",
        !value && "text-muted-foreground",
        className
      )}
    >
      <span>{displayValue}</span>
      <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
    </button>
  );
}
