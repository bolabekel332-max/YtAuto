import React, { useMemo, useState } from 'react';
import { Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { MAX_AUDIT_VIDEOS } from '../../../shared/constants';
import type { AuditVideoItem } from '../../../shared/agentInputs';
import type { OrchestratorOutput, PackagingOutput } from '../../../shared/agentSchemas';
import type { Platform } from '../../../shared/schemas';
import { runAgent } from '../../api/client';
import { label } from '../../config/labels';
import { PROFILE_OPTIONS } from '../../config/presets';
import { useStore } from '../../state/store';
import { Card } from '../components/Card';
import { SelectField } from '../components/FormFields';
import { Tooltip } from '../components/Tooltip';
import { AgentOutput } from '../renderers/AgentOutput';

export const Audit: React.FC = () => {
  const { state, dispatch } = useStore();

  const historyItems = useMemo(() => {
    return state.history.slice(0, MAX_AUDIT_VIDEOS).map((entry) => {
      const pkg = entry.run.steps.packaging.result?.output as
        | PackagingOutput
        | undefined;
      const orch = entry.run.steps.orchestrator.result?.output as
        | OrchestratorOutput
        | undefined;
      const title =
        pkg?.titles?.[entry.selection.titleIndex] ??
        pkg?.titles?.[0] ??
        entry.input.topic;
      const summary =
        orch?.finalSummary ??
        `Topik: ${entry.input.topic}. Status paket: ${label(entry.run.status)}.`;

      return {
        id: entry.id,
        item: {
          title,
          summary,
          platform: entry.input.targetPlatform,
          date: entry.createdAt.slice(0, 10),
        } satisfies AuditVideoItem,
      };
    });
  }, [state.history]);

  const [excludedHistoryIds, setExcludedHistoryIds] = useState<string[]>([]);
  const [manualItems, setManualItems] = useState<AuditVideoItem[]>([]);
  const [manualTitle, setManualTitle] = useState('');
  const [manualSummary, setManualSummary] = useState('');
  const [manualPlatform, setManualPlatform] = useState<Platform>(
    state.profile.platforms[0] ?? 'youtube_shorts'
  );
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [styleProfileId, setStyleProfileId] = useState<string>(
    state.profile.visualStyle.mode === 'reference'
      ? state.profile.visualStyle.defaultStyleProfileId ?? ''
      : ''
  );

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const includedHistory = historyItems.filter(
    (h) => !excludedHistoryIds.includes(h.id)
  );
  const combinedVideos: AuditVideoItem[] = [
    ...includedHistory.map((h) => h.item),
    ...manualItems,
  ].slice(0, MAX_AUDIT_VIDEOS);

  const complianceConfig =
    state.modelConfigs.find((c) => c.agentId === 'compliance') ??
    state.modelConfigs[0];

  const toggleHistoryItem = (id: string) => {
    setExcludedHistoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleAddManual = () => {
    setErrorMsg(null);
    if (!manualTitle.trim() || !manualSummary.trim()) {
      setErrorMsg('Isi judul dan ringkasan video manual sebelum menambahkan.');
      return;
    }
    if (includedHistory.length + manualItems.length >= MAX_AUDIT_VIDEOS) {
      setErrorMsg(`Maksimal ${MAX_AUDIT_VIDEOS} video dalam satu kali Audit Konten.`);
      return;
    }
    setManualItems((prev) => [
      ...prev,
      {
        title: manualTitle.trim(),
        summary: manualSummary.trim(),
        platform: manualPlatform,
        date: manualDate || new Date().toISOString().slice(0, 10),
      },
    ]);
    setManualTitle('');
    setManualSummary('');
  };

  const handleRunAudit = async () => {
    setErrorMsg(null);
    if (combinedVideos.length === 0) {
      setErrorMsg(
        'Pilih minimal 1 video dari riwayat atau tambahkan entri manual untuk diaudit.'
      );
      return;
    }

    const activeStyle = styleProfileId
      ? state.styleProfiles.find((sp) => sp.id === styleProfileId)
      : undefined;

    setLoading(true);
    try {
      const result = await runAgent(
        {
          agentId: 'compliance',
          mode: 'audit',
          input: {
            videos: combinedVideos,
            activeStyleReferenceIds: activeStyle?.referenceIds,
          },
          profile: state.profile,
          styleProfile: activeStyle,
          knowledge: state.knowledge,
          config: complianceConfig,
        },
        state.session.accessCode
      );
      dispatch({ type: 'SET_LAST_AUDIT', result });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menjalankan Audit Konten.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card
        title={`Sumber Video untuk Audit (${combinedVideos.length}/${MAX_AUDIT_VIDEOS})`}
        description="Memuat otomatis hingga 10 video terakhir dari Riwayat Studio Video (memakai judul final pilihan & ringkasan Orkestrator), atau tambahkan daftar video manual."
        tooltip="Audit mengevaluasi pola berulang, variasi hook, dan risiko konten tidak autentik lintas video."
      >
        <div className="space-y-5">
          {/* Daftar dari Riwayat */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Dari Riwayat Studio Video ({includedHistory.length}/{historyItems.length} dipilih)
              </h3>
              <Tooltip
                text="Centang video riwayat yang ingin disertakan ke audit batch ini."
                label="Panduan Video Riwayat"
              />
            </div>

            {historyItems.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
                Belum ada riwayat run di Studio Video. Anda tetap dapat menempel video secara manual di bawah.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {historyItems.map(({ id, item }) => {
                  const checked = !excludedHistoryIds.includes(id);
                  return (
                    <label
                      key={id}
                      className={`flex items-start gap-3 rounded-xl border p-3 text-xs transition-colors cursor-pointer ${
                        checked
                          ? 'border-sky-500/40 bg-sky-500/5'
                          : 'border-slate-800 bg-slate-950/50 opacity-65'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleHistoryItem(id)}
                        className="mt-0.5 h-4 w-4 accent-sky-400"
                      />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="font-semibold text-slate-100">{item.title}</p>
                        <p className="text-slate-400">
                          {label(item.platform)} · {item.date}
                        </p>
                        <p className="text-slate-300 line-clamp-2">{item.summary}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tambah Manual */}
          <div className="space-y-3 border-t border-slate-800/80 pt-4">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Tambah Video Manual / Eksternal ({manualItems.length})
              </h3>
              <Tooltip
                text="Gunakan bagian ini untuk mengaudit video lama yang dibuat di luar aplikasi."
                label="Panduan Tambah Video Manual"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <input
                type="text"
                aria-label="Judul video manual"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="Judul video..."
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500"
              />
              <select
                aria-label="Platform video manual"
                value={manualPlatform}
                onChange={(e) => setManualPlatform(e.target.value as Platform)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
              >
                {PROFILE_OPTIONS.platforms.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                aria-label="Tanggal video manual"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                aria-label="Ringkasan konsep video manual"
                value={manualSummary}
                onChange={(e) => setManualSummary(e.target.value)}
                placeholder="Ringkasan singkat isi, pola pembuka, dan gaya visual video..."
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={handleAddManual}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Tambah ke Daftar</span>
              </button>
            </div>

            {manualItems.length > 0 && (
              <div className="space-y-1.5">
                {manualItems.map((m, idx) => (
                  <div
                    key={`man-${idx}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-slate-100">{m.title}</span>
                      <span className="ml-2 text-slate-400">
                        ({label(m.platform)} · {m.date})
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Hapus ${m.title}`}
                      onClick={() =>
                        setManualItems((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-slate-400 hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 border-t border-slate-800/80 pt-4">
            <SelectField
              label="Profil Gaya Referensi yang Dibandingkan (Opsional)"
              value={styleProfileId}
              options={[
                { value: '', label: 'Tidak membandingkan profil gaya khusus' },
                ...state.styleProfiles.map((sp) => ({
                  value: sp.id,
                  label: sp.name,
                })),
              ]}
              onChange={setStyleProfileId}
              tooltip="Jika dipilih, audit juga memeriksa apakah kumpulan video terlalu bergantung pada satu referensi gaya."
            />
          </div>

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
              Menggunakan agent Kepatuhan (mode audit · {label(complianceConfig.providerId)})
            </span>
            <button
              type="button"
              disabled={loading || combinedVideos.length === 0}
              onClick={handleRunAudit}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              )}
              <span>
                {loading
                  ? 'Mengaudit Video...'
                  : `Jalankan Audit (${combinedVideos.length} Video)`}
              </span>
            </button>
          </div>
        </div>
      </Card>

      {state.lastAudit && (
        <Card title="Hasil Audit Konten Terakhir">
          <AgentOutput result={state.lastAudit} mode="audit" />
        </Card>
      )}
    </div>
  );
};
