import React from 'react';
import { Clapperboard, Film, Mic, Scissors, Sparkles } from 'lucide-react';
import type { VisualOutput } from '../../../shared/agentSchemas';
import { CopyButton } from '../components/CopyButton';
import { Tooltip } from '../components/Tooltip';

export interface VisualViewProps {
  data: VisualOutput;
}

export const VisualView: React.FC<VisualViewProps> = ({ data }) => {
  const shots = data.shotList ?? [];
  const editingGuide = data.editingGuide ?? [];
  const variationNotes = data.variationNotes ?? [];

  const copyText = [
    'SHOT LIST:',
    ...shots.map(
      (s) =>
        `#${s.no} (${s.durationSec} dtk) | Visual: ${s.visual} | Aset: ${s.assetSource}`
    ),
    '',
    `Arahan Suara: ${data.voiceDirection}`,
    '',
    'Panduan Editing:',
    ...editingGuide.map((g) => `- ${g}`),
    '',
    'Catatan Variasi:',
    ...variationNotes.map((v) => `- ${v}`),
  ].join('\n');

  return (
    <div className="space-y-5">
      {/* Header salin */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <Clapperboard className="h-4 w-4 text-sky-400" aria-hidden="true" />
          <span>Total Shot Storyboard:</span>
          <span className="font-mono font-semibold text-slate-100 tabular-nums">
            {shots.length} adegan
          </span>
          <Tooltip
            text="Panduan visual berurutan yang dapat langsung dieksekusi di editor video tanpa menampilkan wajah."
            label="Panduan Storyboard Visual"
          />
        </div>
        <CopyButton text={copyText} label="Salin Arahan Visual" />
      </div>

      {/* Tabel Shot List */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-sky-400" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-slate-100">Shot List Storyboard</h4>
          <Tooltip
            text="Rincian adegan demi adegan lengkap dengan sumber aset (B-roll, motion graphic, atau ilustrasi) dan durasi target."
            label="Panduan Shot List"
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/70 text-slate-400">
              <tr>
                <th className="px-3.5 py-2.5 font-medium w-12">No</th>
                <th className="px-3.5 py-2.5 font-medium">Deskripsi Visual</th>
                <th className="px-3.5 py-2.5 font-medium">Sumber Aset</th>
                <th className="px-3.5 py-2.5 font-medium text-right whitespace-nowrap">
                  Durasi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-slate-200">
              {shots.map((shot) => (
                <tr key={shot.no} className="hover:bg-slate-900/40 align-top">
                  <td className="px-3.5 py-3 font-mono text-slate-400 tabular-nums">
                    {String(shot.no).padStart(2, '0')}
                  </td>
                  <td className="px-3.5 py-3 leading-relaxed text-slate-100">{shot.visual}</td>
                  <td className="px-3.5 py-3 text-slate-300">{shot.assetSource}</td>
                  <td className="px-3.5 py-3 text-right font-mono text-sky-300 whitespace-nowrap tabular-nums">
                    {shot.durationSec} dtk
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Arahan Suara */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-1.5">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-sky-400" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-slate-100">Arahan Suara / Voiceover</h4>
          <Tooltip
            text="Panduan intonasi, jeda napas, dan kecepatan bicara untuk pengisi suara atau TTS."
            label="Panduan Arahan Suara"
          />
        </div>
        <p className="text-sm leading-relaxed text-slate-300">{data.voiceDirection}</p>
      </div>

      {/* Panduan Editing & Catatan Variasi */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <Scissors className="h-4 w-4 text-sky-400" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-slate-100">Panduan Editing</h4>
            <Tooltip
              text="Instruksi ritme potongan, gaya teks layar, dan transisi saat proses penyuntingan."
              label="Panduan Editing"
            />
          </div>
          <ul className="space-y-1.5 text-xs leading-relaxed text-slate-300 list-disc pl-4">
            {editingGuide.map((item, idx) => (
              <li key={`edit-${idx}`}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-slate-100">Catatan Variasi Anti-Repetitif</h4>
            <Tooltip
              text="Saran pembeda antar video agar channel terhindar dari risiko konten berulang atau terasa template massal."
              label="Panduan Catatan Variasi"
            />
          </div>
          <ul className="space-y-1.5 text-xs leading-relaxed text-slate-300 list-disc pl-4">
            {variationNotes.map((item, idx) => (
              <li key={`var-${idx}`}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
