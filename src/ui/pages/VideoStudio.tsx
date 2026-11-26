import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, Clapperboard, Loader2, Play, ShieldAlert, XCircle } from 'lucide-react';
import { PIPELINE_STEP_IDS } from '../../../shared/constants';
import type {
  PipelineStepId,
  Platform,
  RunInput,
} from '../../../shared/schemas';
import { estimateCalls } from '../../agents/dependencies';
import { isPipelineLocked } from '../../agents/pipeline';
import { label } from '../../config/labels';
import { PROFILE_OPTIONS } from '../../config/presets';
import { usePipeline } from '../../state/pipelineContext';
import { useStore } from '../../state/store';
import {
  ActiveChannelSummary,
  resolveVisualStyleSummaryLabel,
} from '../components/ActiveChannelSummary';
import { Card } from '../components/Card';
import { SelectField } from '../components/FormFields';
import { HistoryPanel } from '../components/HistoryPanel';
import { StatusBadge } from '../components/StatusBadge';
import { StepList } from '../components/StepList';
import { Tabs, type TabItem } from '../components/Tabs';
import { Tooltip } from '../components/Tooltip';
import { AgentOutput } from '../renderers/AgentOutput';

export const VideoStudio: React.FC = () => {
  const { state, dispatch } = useStore();
  const {
    isBusy,
    pipelineError,
    startPipeline,
    resumePipeline,
    retryPipelineStep,
    skipPipelineStep,
    cancelPipeline,
    dismissPipelineError,
  } = usePipeline();

  const isRefVisualActive =
    state.profile.visualStyle.mode === 'reference' ||
    (state.profile.visualStyle.mode === 'template' &&
      state.profile.visualStyle.template === 'Berdasarkan referensi kreator');

  const defaultStyleId =
    isRefVisualActive &&
    state.profile.visualStyle.defaultStyleProfileId &&
    state.styleProfiles.some((sp) => sp.id === state.profile.visualStyle.defaultStyleProfileId)
      ? state.profile.visualStyle.defaultStyleProfileId
      : '';

  const [topic, setTopic] = useState(state.draftRunInput?.topic ?? '');
  const [targetPlatform, setTargetPlatform] = useState<Platform>(
    state.draftRunInput?.targetPlatform ?? state.profile.platform ?? 'youtube_shorts'
  );
  const [includeResearch, setIncludeResearch] = useState<boolean>(
    state.draftRunInput?.includeResearch ?? false
  );
  const [styleProfileId, setStyleProfileId] = useState<string>(
    state.draftRunInput?.styleProfileId ?? defaultStyleId
  );

  const [selectedStep, setSelectedStep] = useState<PipelineStepId>('scriptwriter');
  const [formError, setFormError] = useState<string | null>(null);
  const prevProfilePlatformRef = React.useRef<Platform>(
    state.profile.platform ?? 'youtube_shorts'
  );
  const prevDefaultStyleIdRef = React.useRef<string>(defaultStyleId);

  // Sinkronkan default Platform & Gaya Visual bila Profil Setup Channel diperbarui dari luar
  useEffect(() => {
    const nextPlatform = state.profile.platform ?? 'youtube_shorts';
    if (prevProfilePlatformRef.current !== nextPlatform) {
      prevProfilePlatformRef.current = nextPlatform;
      if (!state.draftRunInput) {
        setTargetPlatform(nextPlatform);
      }
    }
  }, [state.profile.platform, state.draftRunInput]);

  useEffect(() => {
    if (prevDefaultStyleIdRef.current !== defaultStyleId) {
      prevDefaultStyleIdRef.current = defaultStyleId;
      if (!state.draftRunInput) {
        setStyleProfileId(defaultStyleId);
      }
    }
  }, [defaultStyleId, state.draftRunInput]);

  // Sinkronkan draft input jika datang dari halaman Ide atau tombol Duplikasi
  useEffect(() => {
    if (state.draftRunInput) {
      setTopic(state.draftRunInput.topic);
      setTargetPlatform(state.draftRunInput.targetPlatform);
      setIncludeResearch(state.draftRunInput.includeResearch);
      const draftStyleId = state.draftRunInput.styleProfileId;
      const validDraftStyleId =
        draftStyleId && state.styleProfiles.some((sp) => sp.id === draftStyleId)
          ? draftStyleId
          : defaultStyleId;
      setStyleProfileId(validDraftStyleId);
      dispatch({ type: 'SET_DRAFT_RUN_INPUT', input: null });
    }
  }, [state.draftRunInput, defaultStyleId, state.styleProfiles, dispatch]);

  const effectiveStyleProfileId =
    styleProfileId && state.styleProfiles.some((sp) => sp.id === styleProfileId)
      ? styleProfileId
      : '';

  useEffect(() => {
    if (styleProfileId && effectiveStyleProfileId !== styleProfileId) {
      setStyleProfileId('');
    }
  }, [styleProfileId, effectiveStyleProfileId]);

  const callEst = useMemo(
    () => estimateCalls({ includeResearch }, state.modelConfigs),
    [includeResearch, state.modelConfigs]
  );

  const activeRun = state.activeRun;

  // Otomatis pindah tab ke langkah pertama yang memiliki hasil jika tab terpilih belum punya hasil
  useEffect(() => {
    if (!activeRun) return;
    if (activeRun.steps[selectedStep]?.result) return;
    const doneSteps = [...PIPELINE_STEP_IDS].reverse().find(
      (id) => Boolean(activeRun.steps[id]?.result)
    );
    if (doneSteps) {
      setSelectedStep(doneSteps);
    }
  }, [activeRun, selectedStep]);

  const handleCancelPipeline = () => {
    cancelPipeline();
  };

  const handleStartPipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    dismissPipelineError();

    if (!topic.trim()) {
      setFormError('Masukkan topik atau judul ide video terlebih dahulu.');
      return;
    }
    if (isBusy || isPipelineLocked()) {
      setFormError('Masih ada proses pipeline yang sedang berjalan.');
      return;
    }

    const input: RunInput = {
      topic: topic.trim(),
      targetPlatform,
      includeResearch,
      styleProfileId: effectiveStyleProfileId || undefined,
    };

    setSelectedStep(includeResearch ? 'researcher' : 'scriptwriter');
    await startPipeline(input);
  };

  const handleResume = async () => {
    if (!activeRun || isBusy || isPipelineLocked()) return;
    setFormError(null);
    dismissPipelineError();
    await resumePipeline(activeRun);
  };

  const handleRetryStep = async (stepId: PipelineStepId) => {
    if (!activeRun || isBusy || isPipelineLocked()) return;
    setFormError(null);
    dismissPipelineError();
    setSelectedStep(stepId);
    await retryPipelineStep(activeRun, stepId);
  };

  const handleSkipStep = async (stepId: PipelineStepId) => {
    if (!activeRun || isBusy || isPipelineLocked()) return;
    setFormError(null);
    dismissPipelineError();
    await skipPipelineStep(activeRun, stepId);
  };

  const displayedError = formError ?? pipelineError;

  const historyEntryForActive = activeRun
    ? state.history.find((h) => h.id === activeRun.id)
    : undefined;

  const latestVerdict = activeRun?.complianceRounds[activeRun.complianceRounds.length - 1];

  const availableTabs: TabItem[] = activeRun
    ? PIPELINE_STEP_IDS.filter((id) => Boolean(activeRun.steps[id].result)).map((id) => ({
        id,
        label: label(id),
        badgeText: activeRun.steps[id].result?.isMock ? 'Mock' : undefined,
      }))
    : [];

  const selectedResult = activeRun?.steps[selectedStep]?.result;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Kolom Kiri/Utama: Form, StepList, Output */}
      <div className="space-y-6 lg:col-span-8 min-w-0">
        <Card
          title="Buat Paket 1 Video Lengkap"
          description="Menjalankan urutan deterministik: Penulis Naskah → Pengarah Visual → Packaging & SEO → Kepatuhan (maks 2 putaran revisi) → Orkestrator."
          tooltip="Anda dapat memilih menyertakan agent Periset di awal atau langsung mulai dari topik matang."
        >
          <div className="space-y-4">
            <ActiveChannelSummary currentPlatformOverride={targetPlatform} />
            <form onSubmit={handleStartPipeline} className="space-y-4">
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <label htmlFor="studio-topic" className="text-xs font-medium text-slate-200">
                    Topik / Ide Video
                  </label>
                  <Tooltip
                    text="Jelaskan ide utama atau judul sementara video yang ingin diproduksi menjadi paket lengkap."
                    label="Panduan Topik Video"
                  />
                </div>
                <textarea
                  id="studio-topic"
                  rows={2}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  disabled={isBusy}
                  placeholder="Contoh: Mengapa jam atom jauh lebih akurat daripada rotasi Bumi"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus-visible:outline-none"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Platform Tujuan (Pilih Tepat 1)"
                  value={targetPlatform}
                  options={PROFILE_OPTIONS.platforms}
                  onChange={(v) => setTargetPlatform(v as Platform)}
                  tooltip="Setiap run hanya menargetkan satu platform agar struktur durasi, hook, dan caption optimal."
                />

                <SelectField
                  label="Profil Gaya Visual (Opsional)"
                  value={effectiveStyleProfileId}
                  options={[
                    {
                      value: '',
                      label: `Bawaan Setup (${resolveVisualStyleSummaryLabel(
                        state.profile,
                        state.styleProfiles
                      )})`,
                    },
                    ...state.styleProfiles.map((sp) => ({
                      value: sp.id,
                      label: sp.name,
                    })),
                  ]}
                  onChange={setStyleProfileId}
                  tooltip="Menyuntikkan ciri ritme, warna, dan tata letak abstrak dari Referensi Gaya ke Penulis Naskah, Visual, Packaging, dan Kepatuhan."
                />
              </div>

            <label className="flex items-start gap-2.5 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-200">
              <input
                type="checkbox"
                checked={includeResearch}
                onChange={(e) => setIncludeResearch(e.target.checked)}
                disabled={isBusy}
                className="mt-0.5 h-4 w-4 accent-sky-400"
              />
              <span>
                <strong>Sertakan Periset di awal pipeline</strong> — aktifkan jika topik masih mentah dan perlu peta sudut pembahasan sebelum naskah ditulis.
              </span>
            </label>

            {/* Estimasi Panggilan Model Sebelum Start (BP 8.5) */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-xs space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-slate-300">
                  <Calculator className="h-4 w-4 text-sky-400 shrink-0" aria-hidden="true" />
                  <span>Perkiraan Panggilan Model:</span>
                  <Tooltip
                    text="Menghitung panggilan standar (termasuk pencarian dua langkah jika aktif) serta skenario terburuk jika Kepatuhan memicu hingga 2 putaran revisi penuh."
                    label="Panduan Estimasi Panggilan"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums">
                  <span className="text-sky-300 font-semibold">
                    Standar: {callEst.baselineCalls} panggilan
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-amber-300">
                    Skenario Maks (2 revisi): {callEst.worstCaseCalls} panggilan
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                Estimasi ini adalah perkiraan panggilan baseline dan skenario revisi; tidak menghitung retry jaringan, fallback model, atau perbaikan JSON.
              </p>
            </div>

            {displayedError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-500/40 bg-rose-950/60 px-4 py-3 text-xs text-rose-200"
              >
                {displayedError}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              {isBusy && (
                <button
                  type="button"
                  onClick={handleCancelPipeline}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/50 px-4 py-2.5 text-xs font-medium text-rose-200 hover:bg-rose-950/80"
                >
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  <span>Batalkan Pipeline</span>
                </button>
              )}
              <button
                type="submit"
                disabled={isBusy}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 transition-colors"
              >
                {isBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Play className="h-4 w-4" aria-hidden="true" />
                )}
                <span>
                  {isBusy ? 'Pipeline Sedang Berjalan...' : 'Mulai Buat Paket Video'}
                </span>
              </button>
            </div>
          </form>
          </div>
        </Card>

        {/* Progres Pipeline & Langkah */}
        {activeRun && (
          <Card
            title="Progres Pipeline Produksi"
            description={`Topik: ${activeRun.input.topic} · Platform: ${label(activeRun.input.targetPlatform)}`}
            headerAction={
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1 font-mono text-xs text-slate-300 tabular-nums">
                  Putaran Revisi: {activeRun.round}/2
                </span>
                <StatusBadge value={activeRun.status} kind="run" />
                {latestVerdict && <StatusBadge value={latestVerdict.verdict} kind="verdict" />}
              </div>
            }
          >
            <div className="space-y-4">
              {activeRun.status === 'blocked' && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-950/60 px-4 py-3 text-xs text-rose-100"
                >
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
                  <p>
                    <strong>Paket Diblokir Kepatuhan:</strong> Setelah 2 putaran revisi, agent Kepatuhan masih memberikan keputusan Ditolak. Perbaiki topik atau sesuaikan temuan secara manual.
                  </p>
                </div>
              )}

              {activeRun.status === 'paused' && !isBusy && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-950/50 px-4 py-3 text-xs text-amber-100">
                  <span>
                    Pipeline dijeda karena ada langkah gagal. Anda dapat menekan <strong>Ulangi</strong> atau <strong>Lewati</strong> pada langkah tersebut.
                  </span>
                  <button
                    type="button"
                    onClick={handleResume}
                    className="inline-flex items-center gap-1.5 rounded-md bg-amber-400 px-3 py-1.5 font-semibold text-slate-950 hover:bg-amber-300"
                  >
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Lanjutkan Pipeline</span>
                  </button>
                </div>
              )}

              <StepList
                run={activeRun}
                isBusy={isBusy}
                onRetryStep={handleRetryStep}
                onSkipStep={handleSkipStep}
                onResumeRun={handleResume}
                selectedStep={selectedStep}
                onSelectStep={setSelectedStep}
              />
            </div>
          </Card>
        )}

        {/* Tab Hasil Agent */}
        {activeRun && availableTabs.length > 0 && (
          <Card
            title="Hasil Paket Video"
            description="Klik setiap tab agent untuk meninjau naskah, storyboard visual, judul/thumbnail, kepatuhan, dan ringkasan QC."
            tooltip="Jika run sudah selesai dan tersimpan di riwayat, pilihan Hook dan Judul final akan ikut disimpan untuk Audit Konten."
          >
            <div className="space-y-4">
              <Tabs
                items={availableTabs}
                activeId={selectedStep}
                onChange={(id) => setSelectedStep(id as PipelineStepId)}
                ariaLabel="Hasil langkah pipeline"
              />

              {selectedResult ? (
                <AgentOutput
                  result={selectedResult}
                  selectedHookIndex={historyEntryForActive?.selection.hookIndex ?? 0}
                  onSelectHook={
                    historyEntryForActive
                      ? (hookIndex) =>
                          dispatch({
                            type: 'UPDATE_HISTORY_SELECTION',
                            id: historyEntryForActive.id,
                            selection: {
                              ...historyEntryForActive.selection,
                              hookIndex,
                            },
                          })
                      : undefined
                  }
                  selectedTitleIndex={historyEntryForActive?.selection.titleIndex ?? 0}
                  onSelectTitle={
                    historyEntryForActive
                      ? (titleIndex) =>
                          dispatch({
                            type: 'UPDATE_HISTORY_SELECTION',
                            id: historyEntryForActive.id,
                            selection: {
                              ...historyEntryForActive.selection,
                              titleIndex,
                            },
                          })
                      : undefined
                  }
                  complianceSkipped={activeRun.steps.compliance.status === 'skipped'}
                  latestVerdict={latestVerdict}
                  runStatus={activeRun.status}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-6 text-center text-xs text-slate-400">
                  Pilih salah satu langkah yang sudah selesai untuk melihat hasilnya.
                </div>
              )}
            </div>
          </Card>
        )}

        {!activeRun && (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-6 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
            <Clapperboard className="h-6 w-6 text-slate-500" aria-hidden="true" />
            <p>
              Masukkan topik video di atas lalu tekan "Mulai Buat Paket Video" untuk menjalankan seluruh pipeline.
            </p>
          </div>
        )}
      </div>

      {/* Kolom Kanan: Riwayat Run */}
      <div className="lg:col-span-4 min-w-0">
        <Card>
          <HistoryPanel
            entries={state.history}
            activeRunId={activeRun?.id}
            disabled={isBusy}
            onOpenEntry={(entry) => {
              dispatch({ type: 'SET_ACTIVE_RUN', run: structuredClone(entry.run) });
              setSelectedStep('orchestrator');
            }}
            onDuplicateEntry={(entry) => {
              setTopic(entry.input.topic);
              setTargetPlatform(entry.input.targetPlatform);
              setIncludeResearch(entry.input.includeResearch);
              setStyleProfileId(entry.input.styleProfileId ?? '');
            }}
            onDeleteEntry={(id) => dispatch({ type: 'DELETE_HISTORY', id })}
          />
        </Card>
      </div>
    </div>
  );
};
