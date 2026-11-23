import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { CopyButton } from './CopyButton';

export interface JsonViewerProps {
  data: unknown;
  title?: string;
  defaultOpen?: boolean;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({
  data,
  title = 'Lihat JSON Mentah',
  defaultOpen = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const formatted = JSON.stringify(data, null, 2);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded px-1 py-0.5"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          )}
          <span>{title}</span>
        </button>
        <CopyButton text={formatted} label="Salin JSON" />
      </div>
      {open && (
        <pre className="max-h-96 overflow-auto border-t border-slate-800 p-3 font-mono text-xs leading-relaxed text-slate-300">
          {formatted}
        </pre>
      )}
    </div>
  );
};
