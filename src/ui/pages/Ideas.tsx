import React, { useEffect, useRef, useState } from 'react';
import { Lightbulb, Loader2, Sparkles, XCircle } from 'lucide-react';
import type { Platform } from '../../../shared/schemas';
import { label } from '../../config/labels';
import { PROFILE_OPTIONS } from '../../config/presets';
import { useAgentTask } from '../../state/agentTaskContext';
import { useStore } from '../../state/store';
import { ActiveChannelSummary } from '../components/ActiveChannelSummary';
import { Card } from '../components/Card';
import { SelectField } from '../components/FormFields';
import { Tooltip } from '../components/Tooltip';
import { AgentOutput } from '../renderers/AgentOutput';

export const Ideas: React.FC = () => {
  const { state, dispatch } = useStore();
  const { tasks, startIdeasTask, cancelTask, clearTaskMessages } = useAgentTask();
  const ideasTask = tasks.ideas;
  const loading = ideasTask.status === 'running';
  const errorMsg = ideasTask.error ?? null;
  const statusMsg = ideasTask.statusMessage ?? null;

  const [targetPlatform, setTargetPlatform] = useState<Platform>(
    state.profile.platform ?? 'youtube_shorts'
  );
  const [topic, setTopic] = useState('');
  const [existingIdeasText, setExistingIdeasText] = useState('');
  const prevProfilePlatformRef = useRef<Platform>(state.profile.platform ?? 'youtube_shorts');

  useEffect(() => {
    const nextDefault = state.profile.platform ?? 'youtube_shorts';
    if (prevProfilePlatformRef.current !== nextDefault) {
      prevProfilePlatformRef.current = nextDefault;
      setTargetPlatform(nextDefault);
    }
  }, [state.profile.platform]);

  const researcherConfig =
    state.modelConfigs.find((c) => c.agentId === 'researcher') ??
    state.modelConfigs[0];

  const handleRunResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    clearTaskMessages('ideas');
    const existingIdeas = existingIdeasText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    await startIdeasTask({
      agentId: 'researcher',
      mode: 'default',
      input: {
        targetPlatform,
        topic: topic.trim() || undefined,
        profile: state.profile,
        existingIdeas: existingIdeas.length > 0 ? existingIdeas : undefined,
      },
      profile: state.profile,
      knowledge: state.knowledge,
      config: researcherConfig,
    });
  };

  const handleSendToStudio = (ideaTitle: string) => {
    const isRefVisualActive =
      state.profile.visualStyle.mode === 'reference' ||
      (state.profile.visualStyle.mode === 'template' &&
        state.profile.visualStyle.template === 'Berdasarkan referensi kreator');
    const configuredId = state.profile.visualStyle.defaultStyleProfileId;
    const validStyleId =
      isRefVisualActive &&
      configuredId &&
      state.styleProfiles.some((sp) => sp.id === configuredId)
        ? configuredId
        : undefined;

    dispatch({
      type: 'SET_DRAFT_RUN_INPUT',
      input: {
        topic: ideaTitle,
        targetPlatform,
        includeResearch: false,
        styleProfileId: validStyleId,
      },
    });
    dispatch({ type: 'SET_SCREEN', screen: 'studio' });
  };

  return (
    <div className="space-y-6">
      <Card
        title="Riset Ide, Pilar Konten & Kalender"
        description="Jalankan agent Periset secara mandiri untuk memetakan celah niche, membuat seri berulang, ide berperingkat, dan jadwal tayang."
        tooltip="Anda bisa langsung menekan tombol 'Jadikan Video' pada salah satu ide hasil riset untuk mengirimkannya ke Studio Video."
      >
        <div className="space-y-4">
          <ActiveChannelSummary currentPlatformOverride={targetPlatform} />
          <form onSubmit={handleRunResearch} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Platform Target Riset"
              value={targetPlatform}
              options={PROFILE_OPTIONS.platforms}
              onChange={(v) => setTargetPlatform(v as Platform)}
              tooltip="Pilih satu platform spesifik agar format seri, durasi, dan jadwal disesuaikan dengan karakter platform tersebut."
            />

            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <label htmlFor="ideas-topic" className="text-xs font-medium text-slate-200">
                  Fokus Topik / Sub-niche (Opsional)
                </label>
                <Tooltip
                  text="Kosongkan jika ingin riset menyeluruh berdasarkan niche utama di Setup Channel."
                  label="Panduan Fokus Topik"
                />
              </div>
              <input
                id="ideas-topic"
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Contoh: Teknologi baterai masa depan atau sejarah uang kertas"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus-visible:outline-none"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <label htmlFor="existing-ideas" className="text-xs font-medium text-slate-200">
                Ide yang Sudah Pernah Dibuat (Opsional, 1 per baris)
              </label>
              <Tooltip
                text="Masukkan daftar topik lama agar Periset menghindari pengulangan sudut pembahasan yang sama."
                label="Panduan Daftar Ide Lama"
              />
            </div>
            <textarea
              id="existing-ideas"
              rows={3}
              value={existingIdeasText}
              onChange={(e) => setExistingIdeasText(e.target.value)}
              placeholder="Contoh:&#10;Kenapa jam atom sangat akurat&#10;Cara kerja GPS tanpa internet"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus-visible:outline-none"
            />
          </div>

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
              Provider aktif: {label(researcherConfig.providerId)} ·{' '}
              <span className="font-mono">{researcherConfig.model}</span>
              {researcherConfig.useSearch && researcherConfig.providerId !== 'mock'
                ? ' · Pencarian Web Aktif'
                : ''}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {loading && (
                <button
                  type="button"
                  onClick={() => cancelTask('ideas')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-xs font-medium text-rose-200 hover:bg-rose-950/80"
                >
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  <span>Batalkan</span>
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 transition-colors"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                )}
                <span>{loading ? 'Sedang Meriset Ide...' : 'Hasilkan Ide & Kalender'}</span>
              </button>
            </div>
          </div>
        </form>
        </div>
      </Card>

      {state.lastIdeas ? (
        <Card
          title="Hasil Riset Terakhir"
          description="Klik 'Jadikan Video' pada ide manapun untuk langsung mengisi Studio Video tanpa mengulang langkah riset."
        >
          <AgentOutput
            result={state.lastIdeas}
            onSelectIdeaForVideo={handleSendToStudio}
          />
        </Card>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-6 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
          <Lightbulb className="h-6 w-6 text-slate-500" aria-hidden="true" />
          <p>Belum ada hasil riset ide. Isi formulir di atas lalu klik "Hasilkan Ide & Kalender".</p>
        </div>
      )}
    </div>
  );
};
