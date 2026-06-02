import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '—';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '—';
  return value.toLocaleString();
}

export function truncate(str: string | null | undefined, maxLen: number = 60): string {
  if (!str) return '—';
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

/** Safely extract a message from an unknown caught error. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
