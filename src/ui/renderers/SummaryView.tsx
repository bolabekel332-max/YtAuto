import React from 'react';
import { AlertTriangle, CheckCircle2, ClipboardList, ShieldAlert } from 'lucide-react';
import type { OrchestratorOutput } from '../../../shared/agentSchemas';
import type { ComplianceVerdict } from '../../../shared/schemas';
import { label } from '../../config/labels';
import { CopyButton } from '../components/CopyButton';
import { Tooltip } from '../components/Tooltip';

export interface SummaryViewProps {
  data: OrchestratorOutput;
  complianceSkipped?: boolean;
  latestVerdict?: ComplianceVerdict;
  runStatus?: string;
}

export const SummaryView: React.FC<SummaryViewProps> = ({
  data,
  complianceSkipped = false,
  latestVerdict,
  runStatus,
}) => {
  const notes = data.consistencyNotes ?? [];
  const verdictNotPass = latestVerdict && latestVerdict.verdict !== 'pass';

  const copyText = [
    data.finalSummary,
    '',
    'Catatan Konsistensi Lintas Agent:',
    ...notes.map((n) => `- ${n}`),
  ].join('\n');

  return (
    <div className="space-y-4">
      {/* Peringatan Eksplisit jika Kepatuhan dilewati / tidak pass / diblokir (BP 8) */}
      {complianceSkipped && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-950/60 px-4 py-3 text-xs text-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
          <div>
            <p className="font-semibold">Pemeriksaan Kepatuhan Dilewati</p>
            <p className="mt-0.5 opacity-90">
              Paket video ini diselesaikan tanpa verifikasi kepatuhan dan kemiripan gaya. Tinjau naskah, visual, dan packaging secara manual sebelum produksi.
            </p>
          </div>
        </div>
      )}

      {!complianceSkipped && (verdictNotPass || runStatus === 'blocked') && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-950/60 px-4 py-3 text-xs text-rose-100"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
          <div>
            <p className="font-semibold">
              Status Kepatuhan: {latestVerdict ? label(latestVerdict.verdict) : 'Perlu Perhatian'}
              {runStatus === 'blocked' ? ' (Pipeline Diblokir Setelah Batas Revisi)' : ''}
            </p>
            <p className="mt-0.5 opacity-90">
              Paket belum berstatus layak penuh setelah putaran revisi. Periksa tab Kepatuhan untuk memperbaiki temuan sebelum diunggah.
            </p>
          </div>
        </div>
      )}

      {/* Ringkasan QC Akhir */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-sky-400" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-slate-100">
              Ringkasan Kontrol Kualitas Akhir (Orkestrator)
            </h4>
            <Tooltip
              text="Menyimpulkan keselarasan antara naskah, storyboard visual, judul/thumbnail, dan catatan kepatuhan."
              label="Panduan Ringkasan Orkestrator"
            />
          </div>
          <CopyButton text={copyText} label="Salin Ringkasan QC" />
        </div>

        <p className="text-sm leading-relaxed text-slate-200 whitespace-pre-line">
          {data.finalSummary}
        </p>
      </div>

      {/* Catatan Konsistensi */}
      {notes.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-slate-100">
              Catatan Konsistensi Lintas Agent ({notes.length})
            </h4>
          </div>
          <ul className="list-disc pl-5 space-y-1.5 text-xs leading-relaxed text-slate-300">
            {notes.map((note, idx) => (
              <li key={`cn-${idx}`}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
