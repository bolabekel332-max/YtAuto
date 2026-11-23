import React from 'react';
import { AlertTriangle, BarChart2, CheckSquare, FlaskConical } from 'lucide-react';
import type { AnalystOutput } from '../../../shared/agentSchemas';
import { CopyButton } from '../components/CopyButton';
import { StatusBadge } from '../components/StatusBadge';
import { Tooltip } from '../components/Tooltip';

export interface AnalystViewProps {
  data: AnalystOutput;
}

export const AnalystView: React.FC<AnalystViewProps> = ({ data }) => {
  const diagnosis = data.diagnosis ?? [];
  const recommendations = data.recommendations ?? [];
  const testPlan = data.testPlan ?? [];
  const dataWarnings = data.dataWarnings ?? [];

  const copySummary = [
    'DIAGNOSIS PERFORMA:',
    ...diagnosis.map((d, i) => `${i + 1}. ${d.finding} (Bukti: ${d.evidence})`),
    '',
    'REKOMENDASI:',
    ...recommendations.map((r) => `- ${r}`),
    '',
    'RENCANA EKSPERIMEN:',
    ...testPlan.map(
      (t, i) =>
        `${i + 1}. Hipotesis: ${t.hypothesis} | Perubahan: ${t.change} | Metrik: ${t.successMetric}`
    ),
  ].join('\n');

  return (
    <div className="space-y-5">
      {/* Peringatan Kualitas Data (Menonjol sesuai BP) */}
      {dataWarnings.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/40 bg-amber-950/50 p-4 space-y-2"
        >
          <div className="flex items-center gap-2 text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <h4 className="text-sm font-semibold">Peringatan Keterbatasan Data</h4>
            <Tooltip
              text="Menjelaskan celah sampel, metrik yang hilang, atau bias data yang Anda tempel agar kesimpulan tidak disalahartikan."
              label="Panduan Peringatan Data"
            />
          </div>
          <ul className="list-disc pl-5 space-y-1 text-xs text-amber-100">
            {dataWarnings.map((w, idx) => (
              <li key={`warn-${idx}`}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Header & Copy */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <BarChart2 className="h-4 w-4 text-sky-400" aria-hidden="true" />
          <span>Diagnosis ditemukan:</span>
          <span className="font-mono font-semibold text-slate-100 tabular-nums">
            {diagnosis.length} poin
          </span>
        </div>
        <CopyButton text={copySummary} label="Salin Laporan Analitik" />
      </div>

      {/* Diagnosis */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-slate-100">Diagnosis Berbasis Bukti</h4>
          <Tooltip
            text="Temuan utama yang diturunkan langsung dari angka yang Anda tempel beserta tingkat keyakinannya."
            label="Panduan Diagnosis Analitik"
          />
        </div>

        <div className="space-y-2.5">
          {diagnosis.map((d, idx) => (
            <div
              key={`diag-${idx}`}
              className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-100">{d.finding}</p>
                <StatusBadge value={d.confidence} kind="confidence" />
              </div>
              <p className="text-xs leading-relaxed text-slate-300">
                <span className="font-medium text-slate-400">Bukti dari Data: </span>
                {d.evidence}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Rekomendasi */}
      {recommendations.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-slate-100">Rekomendasi Aksi</h4>
            <Tooltip
              text="Perubahan spesifik yang sebaiknya diterapkan pada batch video berikutnya."
              label="Panduan Rekomendasi Analitik"
            />
          </div>
          <ul className="list-disc pl-5 space-y-1.5 text-xs leading-relaxed text-slate-200">
            {recommendations.map((rec, idx) => (
              <li key={`rec-${idx}`}>{rec}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Rencana Eksperimen */}
      {testPlan.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-sky-400" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-slate-100">
              Rencana Uji Terukur ({testPlan.length})
            </h4>
            <Tooltip
              text="Uji satu variabel dalam satu waktu dengan tolok ukur keberhasilan yang jelas."
              label="Panduan Rencana Eksperimen"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {testPlan.map((tp, idx) => (
              <div
                key={`tp-${idx}`}
                className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2"
              >
                <p className="text-xs font-semibold text-sky-300">Eksperimen #{idx + 1}</p>
                <p className="text-xs leading-relaxed text-slate-200">
                  <span className="font-medium text-slate-400">Hipotesis: </span>
                  {tp.hypothesis}
                </p>
                <p className="text-xs leading-relaxed text-slate-300">
                  <span className="font-medium text-slate-400">Perubahan: </span>
                  {tp.change}
                </p>
                <p className="text-xs leading-relaxed text-emerald-300">
                  <span className="font-medium text-slate-400">Metrik Keberhasilan: </span>
                  {tp.successMetric}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
