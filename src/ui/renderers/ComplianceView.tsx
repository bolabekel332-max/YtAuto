import React from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import type { ComplianceOutput } from '../../../shared/agentSchemas';
import { label } from '../../config/labels';
import { StatusBadge } from '../components/StatusBadge';
import { Tooltip } from '../components/Tooltip';

export interface ComplianceViewProps {
  data: ComplianceOutput;
}

export const ComplianceView: React.FC<ComplianceViewProps> = ({ data }) => {
  const issues = data.issues ?? [];
  const similarityRisks = data.similarityRisks ?? [];

  return (
    <div className="space-y-5">
      {/* Header Verdict & Disclaimer Wajib BP 7.2 */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {data.verdict === 'pass' ? (
              <ShieldCheck className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-amber-400" aria-hidden="true" />
            )}
            <h4 className="text-sm font-semibold text-slate-100">Keputusan Pemeriksaan Kepatuhan</h4>
            <Tooltip
              text="Menilai keaslian konten, transparansi label AI/sintetis, keamanan hak cipta, topik sensitif, serta jarak kemiripan dari referensi gaya."
              label="Panduan Pemeriksaan Kepatuhan"
            />
          </div>
          <StatusBadge value={data.verdict} kind="verdict" />
        </div>

        <p className="rounded-lg border border-amber-500/30 bg-amber-950/40 px-3 py-2 text-xs text-amber-100">
          Catatan Penting: Penilaian ini adalah <strong>tinjauan heuristik otomatis</strong> sebagai panduan kreator, bukan keputusan resmi YouTube/TikTok dan bukan nasihat hukum/medis/keuangan.
        </p>

        {data.notes && (
          <p className="text-xs leading-relaxed text-slate-300 whitespace-pre-line">
            {data.notes}
          </p>
        )}
      </div>

      {/* Daftar Issues */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-slate-100">
            Temuan & Saran Perbaikan ({issues.length})
          </h4>
          <Tooltip
            text="Setiap temuan mengarah langsung ke agent terkait (Penulis Naskah, Pengarah Visual, atau Packaging & SEO) agar revisi terarah."
            label="Panduan Temuan Kepatuhan"
          />
        </div>

        {issues.length === 0 ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-4 py-3 text-xs text-emerald-200">
            Tidak ada pelanggaran atau catatan revisi yang ditemukan pada pemeriksaan ini.
          </div>
        ) : (
          <div className="space-y-2.5">
            {issues.map((issue, idx) => (
              <div
                key={`issue-${idx}`}
                className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StatusBadge value={issue.severity} kind="severity" />
                    <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs font-medium text-sky-300">
                      Agent Terkait: {label(issue.relatedAgent)}
                    </span>
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-slate-200">
                  <span className="font-semibold text-rose-200">Masalah: </span>
                  {issue.problem}
                </p>
                <p className="text-xs leading-relaxed text-slate-300">
                  <span className="font-semibold text-emerald-300">Saran Perbaikan: </span>
                  {issue.fix}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Risiko Kemiripan Gaya */}
      {similarityRisks.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-100">
              Risiko Kemiripan terhadap Referensi ({similarityRisks.length})
            </h4>
            <Tooltip
              text="Mengukur apakah konsep terlalu meniru ciri khas referensi kreator lain sehingga berisiko dianggap tidak autentik."
              label="Panduan Risiko Kemiripan"
            />
          </div>
          <div className="space-y-2">
            {similarityRisks.map((risk, idx) => (
              <div
                key={`${risk.referenceId}-${idx}`}
                className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-mono text-xs text-slate-400">
                    Referensi: {risk.referenceId}
                  </p>
                  <p className="text-xs leading-relaxed text-slate-200">{risk.reason}</p>
                </div>
                <StatusBadge value={risk.level} kind="severity" />
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
