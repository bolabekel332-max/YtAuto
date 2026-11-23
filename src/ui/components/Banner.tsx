import React from 'react';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';

export interface BannerProps {
  tone: 'danger' | 'warning' | 'info';
  title: string;
  message: string;
  action?: React.ReactNode;
  onDismiss?: () => void;
}

export const Banner: React.FC<BannerProps> = ({
  tone,
  title,
  message,
  action,
  onDismiss,
}) => {
  const styles =
    tone === 'danger'
      ? 'border-rose-500/40 bg-rose-950/70 text-rose-100'
      : tone === 'warning'
      ? 'border-amber-500/40 bg-amber-950/60 text-amber-100'
      : 'border-sky-500/40 bg-sky-950/50 text-sky-100';

  const Icon = tone === 'danger' ? ShieldAlert : AlertTriangle;

  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${styles}`}
    >
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-0.5 text-xs opacity-90">{message}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {action}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Tutup peringatan"
            className="rounded-md p-1 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
};
