import React from 'react';
import { Calendar, Compass, ExternalLink, Layers, Lightbulb, Sparkles } from 'lucide-react';
import type { ResearcherOutput } from '../../../shared/agentSchemas';
import { label } from '../../config/labels';
import { safeExternalUrl } from '../../utils/safeUrl';
import { CopyButton } from '../components/CopyButton';
import { Tooltip } from '../components/Tooltip';

export interface ResearchViewProps {
  data: ResearcherOutput;
  onSelectIdeaForVideo?: (ideaTitle: string) => void;
}

export const ResearchView: React.FC<ResearchViewProps> = ({ data, onSelectIdeaForVideo }) => {
  const pillars = data.contentPillars ?? [];
  const series = data.series ?? [];
  const ideas = data.ideas ?? [];
  const calendar = data.calendar ?? [];
  const sources = data.sources ?? [];

  const copySummary = [
    `Peta Niche:\n${data.nicheMap}`,
    '',
    'Ide Teratas:',
    ...ideas.map((idea, idx) => `${idx + 1}. [${idea.score}/100] ${idea.title} — ${idea.reason}`),
  ].join('\n');

  return (
    <div className="space-y-5">
      {/* Peta Niche */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-sky-400" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-slate-100">Peta Celah Niche</h4>
            <Tooltip
              text="Ringkasan peluang topik, sudut pembahasan yang belum jenuh, dan posisi pembeda channel Anda."
              label="Panduan Peta Celah Niche"
            />
          </div>
          <CopyButton text={copySummary} label="Salin Ringkasan Riset" />
        </div>
        <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-line">
          {data.nicheMap}
        </p>
      </div>

      {/* Pilar Konten */}
      {pillars.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-sky-400" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-slate-100">
              Pilar Konten ({pillars.length})
            </h4>
            <Tooltip
              text="Tema utama berkelanjutan yang membentuk identitas channel Anda agar audiens tahu apa yang diharapkan."
              label="Panduan Pilar Konten"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {pillars.map((pillar, idx) => (
              <div
                key={`${pillar.name}-${idx}`}
                className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5"
              >
                <p className="text-sm font-semibold text-slate-100">{pillar.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  {pillar.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Seri Konten */}
      {series.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-sky-400" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-slate-100">
              Format Seri Berulang ({series.length})
            </h4>
            <Tooltip
              text="Rangkaian episode dengan benang merah format yang memudahkan penonton kembali menonton episode selanjutnya."
              label="Panduan Format Seri"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {series.map((s, idx) => (
              <div
                key={`${s.name}-${idx}`}
                className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">{s.name}</p>
                  <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-sky-300">
                    {label(s.platform)}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{s.format}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ide Video Berperingkat */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-slate-100">
              Daftar Ide Berperingkat ({ideas.length})
            </h4>
            <Tooltip
              text="Skor 0–100 adalah estimasi relevansi dari model AI berdasarkan profil channel dan pengetahuan aktif, bukan jaminan angka tayangan nyata."
              label="Panduan Skor Ide"
            />
          </div>
          <span className="text-[11px] text-slate-400">
            Catatan: Skor merupakan estimasi model AI, bukan data performa nyata.
          </span>
        </div>

        <div className="space-y-2.5">
          {ideas.map((idea, idx) => (
            <div
              key={`${idea.title}-${idx}`}
              className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono text-slate-500 tabular-nums">
                    #{String(idx + 1).padStart(2, '0')}
                  </span>
                  <span className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs font-semibold text-sky-300 tabular-nums">
                    Skor {idea.score}/100
                  </span>
                  <h5 className="text-sm font-semibold text-slate-100">{idea.title}</h5>
                </div>
                <p className="text-xs leading-relaxed text-slate-400">{idea.reason}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <CopyButton text={idea.title} label="Salin Judul" />
                {onSelectIdeaForVideo && (
                  <button
                    type="button"
                    onClick={() => onSelectIdeaForVideo(idea.title)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 transition-colors"
                  >
                    <span>Jadikan Video</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Kalender Konten */}
      {calendar.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-sky-400" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-slate-100">
              Kalender Konten ({calendar.length} slot)
            </h4>
            <Tooltip
              text="Jadwal usulan penayangan sesuai frekuensi unggah dan platform pilihan di Setup Channel."
              label="Panduan Kalender Konten"
            />
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-900/70 text-slate-400">
                <tr>
                  <th className="px-3.5 py-2.5 font-medium">Hari / Urutan</th>
                  <th className="px-3.5 py-2.5 font-medium">Topik</th>
                  <th className="px-3.5 py-2.5 font-medium">Platform</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-slate-200">
                {calendar.map((slot, idx) => (
                  <tr key={`${slot.day}-${idx}`} className="hover:bg-slate-900/40">
                    <td className="px-3.5 py-2.5 font-medium whitespace-nowrap text-slate-300">
                      {slot.day}
                    </td>
                    <td className="px-3.5 py-2.5">{slot.topic}</td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap text-sky-300">
                      {label(slot.platform)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sumber Riset Nyata */}
      {sources.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Sumber Grounding Pencarian ({sources.length})
            </h4>
            <Tooltip
              text="Daftar tautan nyata yang dikembalikan langsung oleh mesin pencarian server (tidak dikarang)."
              label="Panduan Sumber Pencarian"
            />
          </div>
          <ul className="space-y-1.5 text-xs">
            {sources.map((src, idx) => {
              const safeHref = safeExternalUrl(src.url);
              return (
                <li key={`${src.url}-${idx}`} className="flex items-start gap-2">
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" aria-hidden="true" />
                  {safeHref ? (
                    <a
                      href={safeHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-300 hover:text-sky-200 underline break-all"
                    >
                      {src.title || src.url}
                    </a>
                  ) : (
                    <span className="text-slate-300 break-all">{src.title || src.url}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
