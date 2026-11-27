import React, { useEffect, useRef, useState } from 'react';
import { BarChart3, Info, Loader2, Upload, XCircle } from 'lucide-react';
import { MAX_PASTE_CHARS } from '../../../shared/constants';
import type { Platform } from '../../../shared/schemas';
import { label } from '../../config/labels';
import { PROFILE_OPTIONS } from '../../config/presets';
import { useAgentTask } from '../../state/agentTaskContext';
import { useStore } from '../../state/store';
import { Card } from '../components/Card';
import { SelectField } from '../components/FormFields';
import { Tooltip } from '../components/Tooltip';
import { AgentOutput } from '../renderers/AgentOutput';

const LARGE_FILE_BYTES = 1_000_000;

export const Analytics: React.FC = () => {
  const { state } = useStore();
  const { tasks, startAnalyticsTask, cancelTask, clearTaskMessages } = useAgentTask();
  const analyticsTask = tasks.analytics;
  const loading = analyticsTask.status === 'running';

  const [targetPlatform, setTargetPlatform] = useState<Platform>(
    state.profile.platform ?? 'youtube_shorts'
  );
  const [period, setPeriod] = useState('');
  const [metricsText, setMetricsText] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const errorMsg = localError ?? analyticsTask.error ?? null;
  const statusMsg = analyticsTask.statusMessage ?? null;
  const [truncateWarn, setTruncateWarn] = useState<string | null>(null);
  const prevProfilePlatformRef = useRef<Platform>(state.profile.platform ?? 'youtube_shorts');

  useEffect(() => {
    const nextPlatform = state.profile.platform ?? 'youtube_shorts';
    if (prevProfilePlatformRef.current !== nextPlatform) {
      prevProfilePlatformRef.current = nextPlatform;
      setTargetPlatform(nextPlatform);
    }
  }, [state.profile.platform]);

  const analystConfig =
    state.modelConfigs.find((c) => c.agentId === 'analyst') ?? state.modelConfigs[0];

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setTruncateWarn(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const readPartial = file.size > LARGE_FILE_BYTES;
      const raw = readPartial
        ? await file.slice(0, MAX_PASTE_CHARS * 4).text()
        : await file.text();

      if (readPartial || raw.length > MAX_PASTE_CHARS) {
        let sliced = raw.slice(0, MAX_PASTE_CHARS);
        const lastNewline = sliced.lastIndexOf('\n');
        if (lastNewline >= Math.floor(MAX_PASTE_CHARS * 0.5)) {
          sliced = sliced.slice(0, lastNewline);
        }
        setMetricsText(sliced);
        setTruncateWarn(
          `File melebihi batas ${MAX_PASTE_CHARS.toLocaleString(
            'id-ID'
          )} karakter dan otomatis dipotong pada batas baris agar sesuai kapasitas analisis.`
        );
      } else {
        setMetricsText(raw);
      }
    } finally {
      e.target.value = '';
    }
  };

  const handleRunAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearTaskMessages('analytics');
    if (!metricsText.trim()) {
      setLocalError('Tempel data metrik atau unggah file CSV/TSV terlebih dahulu.');
      return;
    }

    await startAnalyticsTask({
      agentId: 'analyst',
      mode: 'default',
      input: {
        targetPlatform,
        metricsText: metricsText.slice(0, MAX_PASTE_CHARS),
        period: period.trim() || undefined,
      },
      profile: state.profile,
      knowledge: state.knowledge,
      config: analystConfig,
    });
  };

  return (
    <div className="space-y-6">
      {/* Keterbukaan Tanpa Koneksi Akun Langsung */}
      <div className="flex items-start gap-3 rounded-xl border border-sky-500/30 bg-sky-950/40 px-4 py-3 text-xs text-sky-100">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
        <p className="leading-relaxed">
          <strong>Input Data Manual:</strong> Aplikasi tidak terhubung langsung ke akun YouTube Studio atau TikTok Analytics Anda. Tempel data tabel, ringkasan angka, atau impor file CSV ekspor Anda di bawah ini.
        </p>
      </div>

      <Card
        title="Analisis Data Performa"
        description="Diagnosis pola retensi, klik, dan rekomendasi eksperimen terukur dari data performa yang Anda tempel."
        tooltip="Agent Analis dilarang mengarang angka di luar teks yang Anda berikan dan akan memberi peringatan jika sampel terlalu kecil atau kolom penting tidak ada."
      >
        <form onSubmit={handleRunAnalysis} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Platform Sumber Data"
              value={targetPlatform}
              options={PROFILE_OPTIONS.platforms}
              onChange={(v) => setTargetPlatform(v as Platform)}
              tooltip="Menentukan tolok ukur sinyal metrik (misalnya CTR & AVD untuk long-form atau Viewed vs Swiped Away untuk Shorts)."
            />

            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <label htmlFor="analytics-period" className="text-xs font-medium text-slate-200">
                  Rentang Waktu Data (Opsional)
                </label>
                <Tooltip
                  text="Contoh: 28 hari terakhir, atau November 2026."
                  label="Panduan Rentang Waktu"
                />
              </div>
              <input
                id="analytics-period"
                type="text"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="Contoh: 14 hari terakhir (10 unggahan)"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus-visible:outline-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <label htmlFor="metrics-text" className="text-xs font-medium text-slate-200">
                  Data Metrik / CSV (Maks {MAX_PASTE_CHARS.toLocaleString('id-ID')} karakter)
                </label>
                <Tooltip
                  text="Sertakan kolom seperti Judul, Tayangan, CTR, Rata-rata Durasi Tonton, atau Persentase Selesai agar diagnosis lebih tajam."
                  label="Panduan Format Data Metrik"
                />
              </div>

              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800">
                <Upload className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                <span>Muat File CSV / TXT</span>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,text/csv,text/plain"
                  onChange={handleFilePick}
                  className="hidden"
                />
              </label>
            </div>

            <textarea
              id="metrics-text"
              rows={7}
              value={metricsText}
              maxLength={MAX_PASTE_CHARS}
              onChange={(e) => setMetricsText(e.target.value)}
              placeholder={
                'Judul,Tayangan,Retensi_Rata2,CTR\nVideo A,15400,68%,6.2%\nVideo B,3200,41%,3.1%'
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs leading-relaxed text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus-visible:outline-none"
            />
            <p className="text-right font-mono text-[11px] text-slate-400 tabular-nums">
              {metricsText.length.toLocaleString('id-ID')} /{' '}
              {MAX_PASTE_CHARS.toLocaleString('id-ID')} karakter
            </p>
          </div>

          {truncateWarn && (
            <div
              role="alert"
              className="rounded-xl border border-amber-500/40 bg-amber-950/50 px-4 py-2.5 text-xs text-amber-100"
            >
              {truncateWarn}
            </div>
          )}

          {statusMsg && (
            <div
              role="status"
              className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-xs text-amber-100"
            >
              {statusMsg}
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/40 bg-rose-950/60 px-4 py-3 text-xs text-rose-200"
            >
              {errorMsg}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-400">
              Menggunakan agent Analis Performa ({label(analystConfig.providerId)})
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {loading && (
                <button
                  type="button"
                  onClick={() => cancelTask('analytics')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-xs font-medium text-rose-200 hover:bg-rose-950/80"
                >
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  <span>Batalkan</span>
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <BarChart3 className="h-4 w-4" aria-hidden="true" />
                )}
                <span>{loading ? 'Menganalisis Data...' : 'Analisis Performa'}</span>
              </button>
            </div>
          </div>
        </form>
      </Card>

      {state.lastAnalysis && (
        <Card title="Hasil Diagnosis Analitik Terakhir">
          <AgentOutput result={state.lastAnalysis} />
        </Card>
      )}
    </div>
  );
};
