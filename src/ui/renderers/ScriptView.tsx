import React from 'react';
import { Clock, FileText, Megaphone, Sparkles } from 'lucide-react';
import type { ScriptwriterOutput } from '../../../shared/agentSchemas';
import { CopyButton } from '../components/CopyButton';
import { Tooltip } from '../components/Tooltip';

export interface ScriptViewProps {
  data: ScriptwriterOutput;
  selectedHookIndex?: number;
  onSelectHook?: (index: number) => void;
}

export const ScriptView: React.FC<ScriptViewProps> = ({
  data,
  selectedHookIndex = 0,
  onSelectHook,
}) => {
  const hooks = data.hooks ?? [];
  const sections = data.script ?? [];

  const fullScriptText = [
    `Hook Terpilih:\n${hooks[selectedHookIndex] ?? hooks[0] ?? ''}`,
    '',
    ...sections.map(
      (s, i) =>
        `[${i + 1}. ${s.section} - ${s.durationSec} dtk]\nNarasi: ${s.narration}\nTeks Layar: ${s.onScreenText}`
    ),
    '',
    `Ajakan Bertindak (CTA): ${data.cta}`,
  ].join('\n');

  return (
    <div className="space-y-5">
      {/* Info durasi & salin semua */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <Clock className="h-4 w-4 text-sky-400" aria-hidden="true" />
          <span>Estimasi Total Durasi:</span>
          <span className="font-mono font-semibold text-slate-100 tabular-nums">
            {data.estimatedDurationSec} detik
          </span>
          <Tooltip
            text="Perkiraan waktu baca narasi lengkap sesuai ritme platform yang dipilih."
            label="Panduan Estimasi Durasi"
          />
        </div>
        <CopyButton text={fullScriptText} label="Salin Naskah Lengkap" />
      </div>

      {/* 3 Pilihan Hook */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-slate-100">
            3 Opsi Hook Pembuka {onSelectHook ? '(Pilih 1 untuk disimpan ke riwayat)' : ''}
          </h4>
          <Tooltip
            text="Pilih hook pembuka yang paling kuat untuk 3 detik pertama. Pilihan ini dicatat di riwayat agar Audit Konten dapat memeriksa variasi pembuka Anda."
            label="Panduan Pemilihan Hook"
          />
        </div>

        <div className="grid gap-2.5">
          {hooks.map((hook, idx) => {
            const active = selectedHookIndex === idx;
            return (
              <div
                key={`hook-${idx}`}
                className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border p-3.5 transition-colors ${
                  active
                    ? 'border-sky-500/50 bg-sky-500/10'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  {onSelectHook && (
                    <input
                      type="radio"
                      name="selected-hook"
                      checked={active}
                      onChange={() => onSelectHook(idx)}
                      aria-label={`Pilih Hook ${idx + 1}`}
                      className="mt-1 h-4 w-4 accent-sky-400"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Opsi Hook {idx + 1}
                    </span>
                    <p className="mt-0.5 text-sm leading-relaxed text-slate-100">{hook}</p>
                  </div>
                </div>
                <CopyButton text={hook} label="Salin" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Struktur Naskah */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-sky-400" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-slate-100">
            Struktur Naskah & Teks Layar ({sections.length} bagian)
          </h4>
          <Tooltip
            text="Alur naskah bertahap dilengkapi durasi per segmen, kalimat narasi untuk TTS/voiceover, dan teks singkat yang tampil di layar."
            label="Panduan Struktur Naskah"
          />
        </div>

        <div className="space-y-3">
          {sections.map((seg, idx) => (
            <div
              key={`${seg.section}-${idx}`}
              className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-500 tabular-nums">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <span className="text-sm font-semibold text-slate-100">{seg.section}</span>
                </div>
                <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-xs text-sky-300 tabular-nums">
                  {seg.durationSec} dtk
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="md:col-span-2 rounded-lg border border-slate-800/80 bg-slate-900/50 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Narasi / Voiceover
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-200 whitespace-pre-line">
                    {seg.narration}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-800/80 bg-slate-900/50 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Teks di Layar
                  </p>
                  <p className="mt-1 text-sm font-medium leading-relaxed text-amber-200">
                    {seg.onScreenText}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-slate-100">Ajakan Bertindak (CTA)</h4>
            <Tooltip
              text="Penutup yang mengarahkan interaksi organik penonton seperti komentar atau menyimpan video."
              label="Panduan CTA"
            />
          </div>
          <CopyButton text={data.cta} label="Salin CTA" />
        </div>
        <p className="text-sm text-slate-200">{data.cta}</p>
      </div>
    </div>
  );
};
