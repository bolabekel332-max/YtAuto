import React from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import type { AuditOutput } from '../../../shared/agentSchemas';
import { StatusBadge } from '../components/StatusBadge';
import { Tooltip } from '../components/Tooltip';

export interface AuditViewProps {
  data: AuditOutput;
}

export const AuditView: React.FC<AuditViewProps> = ({ data }) => {
  const perVideo = data.perVideo ?? [];
  const findings = data.findings ?? [];
  const score = Math.max(0, Math.min(100, Math.round(data.variationScore ?? 0)));

  const scoreColor =
    score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-400' : 'bg-rose-500';

  return (
    <div className="space-y-5">
      {/* Skor Variasi & Disclaimer */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {score >= 70 ? (
              <ShieldCheck className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-amber-400" aria-hidden="true" />
            )}
            <h4 className="text-sm font-semibold text-slate-100">
              Skor Variasi Antar Video
            </h4>
            <Tooltip
              text="Mengukur seberapa beragam struktur pembuka, topik, dan penyajian 10 video terakhir. Skor rendah berarti pola terlalu seragam."
              label="Panduan Skor Variasi"
            />
          </div>
          <span className="font-mono text-lg font-bold text-slate-100 tabular-nums">
            {score}/100
          </span>
        </div>

        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full transition-all ${scoreColor}`}
            style={{ width: `${score}%` }}
          />
        </div>

        <p className="rounded-lg border border-amber-500/30 bg-amber-950/40 px-3 py-2 text-xs text-amber-100">
          Catatan Penting: Audit variasi adalah <strong>tinjauan heuristik otomatis</strong> berdasarkan ringkasan video yang diinputkan, bukan penilaian resmi platform.
        </p>

        {data.notes && (
          <p className="text-xs leading-relaxed text-slate-300 whitespace-pre-line">
            {data.notes}
          </p>
        )}
      </div>

      {/* Risiko Per Video */}
      {perVideo.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-100">
              Evaluasi Per Video ({perVideo.length})
            </h4>
            <Tooltip
              text="Tingkat risiko kemiripan atau kejenuhan pola pada masing-masing video yang diaudit."
              label="Panduan Evaluasi Per Video"
            />
          </div>

          <div className="space-y-2">
            {perVideo.map((item, idx) => (
              <div
                key={`${item.title}-${idx}`}
                className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">{item.title}</p>
                  <StatusBadge value={item.riskLevel} kind="severity" />
                </div>
                {item.reasons && item.reasons.length > 0 && (
                  <ul className="list-disc pl-4 space-y-1 text-xs text-slate-400">
                    {item.reasons.map((r, rIdx) => (
                      <li key={`reason-${rIdx}`}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Temuan Lintas Channel */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-slate-100">
            Temuan Pola Berulang & Perbaikan ({findings.length})
          </h4>
          <Tooltip
            text="Rekomendasi penyesuaian konkret untuk memutus pola template agar channel tetap terasa segar dan autentik."
            label="Panduan Temuan Audit"
          />
        </div>

        {findings.length === 0 ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-4 py-3 text-xs text-emerald-200">
            Tidak ditemukan pola repetitif yang mengkhawatirkan pada kumpulan video ini.
          </div>
        ) : (
          <div className="space-y-2.5">
            {findings.map((finding, idx) => (
              <div
                key={`finding-${idx}`}
                className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2"
              >
                <StatusBadge value={finding.severity} kind="severity" />
                <p className="text-xs leading-relaxed text-slate-200">
                  <span className="font-semibold text-rose-200">Temuan: </span>
                  {finding.problem}
                </p>
                <p className="text-xs leading-relaxed text-slate-300">
                  <span className="font-semibold text-emerald-300">Langkah Perbaikan: </span>
                  {finding.fix}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
