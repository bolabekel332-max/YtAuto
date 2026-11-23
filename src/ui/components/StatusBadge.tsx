import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldAlert,
  SkipForward,
} from 'lucide-react';
import { label } from '../../config/labels';

export type BadgeKind =
  | 'step'
  | 'run'
  | 'verdict'
  | 'severity'
  | 'certainty'
  | 'confidence';

export interface StatusBadgeProps {
  value: string;
  kind?: BadgeKind;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ value, kind = 'step' }) => {
  const display = label(value);

  let style = 'border-slate-700 bg-slate-800/70 text-slate-300';
  let Icon: React.ComponentType<{ className?: string }> = Clock;

  if (value === 'done' || value === 'completed' || value === 'pass' || value === 'official' || value === 'high' && kind === 'confidence') {
    style = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    Icon = CheckCircle2;
  } else if (value === 'running') {
    style = 'border-sky-500/30 bg-sky-500/10 text-sky-300';
    Icon = Loader2;
  } else if (
    value === 'revise' ||
    value === 'paused' ||
    value === 'interrupted' ||
    value === 'medium' ||
    value === 'reported' ||
    value === 'creator_observation'
  ) {
    style = 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    Icon = AlertTriangle;
  } else if (
    value === 'failed' ||
    value === 'reject' ||
    value === 'blocked' ||
    (value === 'high' && (kind === 'severity' || kind === 'verdict'))
  ) {
    style = 'border-rose-500/30 bg-rose-500/10 text-rose-300';
    Icon = kind === 'verdict' ? ShieldAlert : AlertCircle;
  } else if (value === 'skipped') {
    style = 'border-slate-700 bg-slate-800/50 text-slate-400';
    Icon = SkipForward;
  } else if (value === 'house_rule') {
    style = 'border-sky-500/30 bg-sky-500/10 text-sky-300';
    Icon = CheckCircle2;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${style}`}
    >
      <Icon
        className={`h-3.5 w-3.5 shrink-0 ${value === 'running' ? 'animate-spin' : ''}`}
        aria-hidden="true"
      />
      <span>{display}</span>
    </span>
  );
};
