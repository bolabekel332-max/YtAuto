import React from 'react';
import { CopyPlus, FolderOpen, History } from 'lucide-react';
import type { PackagingOutput } from '../../../shared/agentSchemas';
import type { HistoryEntry } from '../../../shared/schemas';
import { label } from '../../config/labels';
import { StatusBadge } from './StatusBadge';
import { Tooltip } from './Tooltip';

export interface HistoryPanelProps {
  entries: HistoryEntry[];
  activeRunId?: string;
  onOpenEntry: (entry: HistoryEntry) => void;
  onDuplicateEntry: (entry: HistoryEntry) => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  entries,
  activeRunId,
  onOpenEntry,
  onDuplicateEntry,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-100">
            Riwayat Run ({entries.length}/30)
          </h3>
          <Tooltip
            text="Menyimpan hingga 30 paket video terakhir beserta judul & hook pilihan. Anda dapat membuka kembali hasil atau menduplikasi topik ke run baru."
            label="Panduan Riwayat Run"
          />
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/50 p-4 text-xs text-slate-400">
          Belum ada riwayat paket video tersimpan. Jalankan pipeline pertama Anda di Studio Video.
        </div>
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {entries.map((entry) => {
            const pkg = entry.run.steps.packaging.result?.output as
              | PackagingOutput
              | undefined;
            const chosenTitle =
              pkg?.titles?.[entry.selection.titleIndex] ??
              pkg?.titles?.[0] ??
              entry.input.topic;
            const lastVerdict =
              entry.run.complianceRounds[entry.run.complianceRounds.length - 1];
            const isCurrent = activeRunId === entry.id;

            return (
              <div
                key={entry.id}
                className={`rounded-lg border p-3 transition-colors ${
                  isCurrent
                    ? 'border-sky-500/40 bg-sky-500/5'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-100">
                      {chosenTitle}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-400 tabular-nums">
                      <span>{label(entry.input.targetPlatform)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{entry.createdAt.slice(0, 10)}</span>
                      {lastVerdict && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Kepatuhan: {label(lastVerdict.verdict)}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <StatusBadge value={entry.run.status} kind="run" />
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenEntry(entry)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
                  >
                    <FolderOpen className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    <span>Buka Ulang</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDuplicateEntry(entry)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
                  >
                    <CopyPlus className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    <span>Duplikasi</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
