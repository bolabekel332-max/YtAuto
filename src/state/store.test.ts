import test from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURES } from '../../server/providers/mockFixtures';
import { SAMPLE_PROFILE_FOR_TEST } from '../../shared/agentInputs';
import { HISTORY_MAX } from '../../shared/constants';
import type { HistoryEntry, PipelineRun } from '../../shared/schemas';
import { isPipelineLocked, runPipeline } from '../agents/pipeline';
import { DEFAULT_KNOWLEDGE } from '../knowledge/blocks';
import { DEFAULT_MODEL_CONFIGS } from './defaults';
import {
  appReducer,
  buildDefaultState,
  normalizeInterruptedRun,
  shouldFlushPendingSave,
} from './store';

function makeDummyRun(id: string, status: PipelineRun['status'] = 'running'): PipelineRun {
  return {
    id,
    input: { topic: `Topik ${id}`, targetPlatform: 'youtube_shorts', includeResearch: false },
    steps: {
      researcher: { status: 'skipped' },
      scriptwriter: { status: 'done', result: { agentId: 'scriptwriter', output: FIXTURES.scriptwriter, model: 'mock-sim-v1', latencyMs: 1 } },
      visual: { status: 'running' },
      packaging: { status: 'idle' },
      compliance: { status: 'idle' },
      orchestrator: { status: 'idle' },
    },
    round: 0,
    complianceRounds: [],
    status,
  };
}

test('normalizeInterruptedRun mengubah status running yang terputus menjadi interrupted dan failed step', () => {
  const normalized = normalizeInterruptedRun(makeDummyRun('r1', 'running'));
  assert.ok(normalized);
  assert.equal(normalized.status, 'interrupted');
  assert.equal(normalized.steps.visual.status, 'failed');
  assert.ok(normalized.steps.visual.error?.includes('terputus'));
  assert.equal(normalized.steps.scriptwriter.status, 'done');

  const completed = normalizeInterruptedRun(makeDummyRun('r2', 'completed'));
  assert.equal(completed?.status, 'completed');
});

test('F-26: appReducer memproses mutasi profil, batas riwayat, hapus aktif, konflik multi-tab, impor, dan reset secara murni', () => {
  const initial = buildDefaultState();

  const afterProfile = appReducer(initial, {
    type: 'SET_PROFILE',
    profile: { ...SAMPLE_PROFILE_FOR_TEST, niche: 'Keuangan & Investasi' },
  });
  assert.equal(afterProfile.profileConfigured, true);
  assert.equal(afterProfile.changesSinceExport, 1);
  assert.equal(afterProfile.profile.niche, 'Keuangan & Investasi');

  // History cap HISTORY_MAX
  let state = afterProfile;
  for (let i = 0; i < HISTORY_MAX + 5; i += 1) {
    const entry: HistoryEntry = {
      id: `run_${i}`,
      createdAt: '2026-11-24T00:00:00.000Z',
      input: { topic: `Topik ${i}`, targetPlatform: 'youtube_shorts', includeResearch: false },
      run: makeDummyRun(`run_${i}`, 'completed'),
      selection: { titleIndex: 0, hookIndex: 0 },
      profileSnapshot: SAMPLE_PROFILE_FOR_TEST,
    };
    state = appReducer(state, { type: 'UPSERT_HISTORY', entry });
  }
  assert.equal(state.history.length, HISTORY_MAX);

  // Set active run & delete matching history
  const newestRun = state.history[0].run;
  state = appReducer(state, { type: 'SET_ACTIVE_RUN', run: newestRun });
  state = appReducer(state, { type: 'DELETE_HISTORY', id: newestRun.id });
  assert.equal(state.activeRun, null);

  // Multi-tab conflict flag
  state = appReducer(state, {
    type: 'SET_STORAGE_WARNING',
    warning: 'Data diubah di tab lain',
    conflict: true,
  });
  assert.equal(state.storageConflict, true);

  // Reload from storage clears conflict while keeping currentScreen
  const onModels = appReducer(state, { type: 'SET_SCREEN', screen: 'models' });
  const reloaded = appReducer(onModels, {
    type: 'RELOAD_FROM_STORAGE',
    loaded: { ...buildDefaultState(), knowledge: DEFAULT_KNOWLEDGE, modelConfigs: DEFAULT_MODEL_CONFIGS },
  });
  assert.equal(reloaded.currentScreen, 'models');
  assert.equal(reloaded.storageConflict, false);

  // Clear local data restores defaults
  const cleared = appReducer(reloaded, { type: 'CLEAR_LOCAL_DATA' });
  assert.equal(cleared.profileConfigured, false);
  assert.equal(cleared.history.length, 0);
});

test('R3-07 & R3-18d: konflik antar-tab bertahan lintas mutasi, dapat diselesaikan via overwrite, dan shouldFlushPendingSave menjaga agar tidak tertimpa', () => {
  const initial = buildDefaultState();
  const conflicted = appReducer(initial, {
    type: 'SET_STORAGE_WARNING',
    warning: 'Data diubah di tab lain.',
    conflict: true,
  });
  assert.equal(conflicted.storageConflict, true);

  // Aksi mutasi biasa TIDAK boleh menghapus flag storageConflict
  const mutatedWhileConflicted = appReducer(conflicted, {
    type: 'SET_PROFILE',
    profile: { ...SAMPLE_PROFILE_FOR_TEST, niche: 'Sains Populer' },
  });
  assert.equal(
    mutatedWhileConflicted.storageConflict,
    true,
    'storageConflict harus tetap aktif saat pengguna menyunting di tab usang sampai dipilih Muat Ulang atau Timpa'
  );

  // shouldFlushPendingSave menolak flush saat conflict aktif atau belum ada mutasi
  assert.equal(shouldFlushPendingSave({ hasUserMutations: false, externalTabConflict: false }), false);
  assert.equal(shouldFlushPendingSave({ hasUserMutations: true, externalTabConflict: true }), false);
  assert.equal(shouldFlushPendingSave({ hasUserMutations: true, externalTabConflict: false }), true);

  // Aksi RESOLVE_STORAGE_CONFLICT_OVERWRITE membersihkan conflict & warning
  const overwritten = appReducer(mutatedWhileConflicted, {
    type: 'RESOLVE_STORAGE_CONFLICT_OVERWRITE',
  });
  assert.equal(overwritten.storageConflict, false);
  assert.equal(overwritten.storageWarning, undefined);
});

test('R3-18e: isPipelineLocked() aktif saat pipeline berjalan dan menolak eksekusi ganda lintas navigasi', async () => {
  let resolveFirstStep!: () => void;
  const firstStepGate = new Promise<void>((resolve) => {
    resolveFirstStep = resolve;
  });
  const ac = new AbortController();

  const runningPromise = runPipeline(
    {
      topic: 'Uji lock lintas navigasi',
      targetPlatform: 'youtube_shorts',
      includeResearch: false,
    },
    {
      profile: SAMPLE_PROFILE_FOR_TEST,
      styleProfiles: [],
      modelConfigs: DEFAULT_MODEL_CONFIGS,
      knowledge: DEFAULT_KNOWLEDGE,
      history: [],
      signal: ac.signal,
      onRunUpdate: () => {},
      onHistorySave: () => {},
      runAgentFn: async (req) => {
        if (req.agentId === 'scriptwriter') {
          await firstStepGate;
        }
        return {
          agentId: req.agentId,
          output: FIXTURES[req.agentId as keyof typeof FIXTURES],
          model: 'mock-sim-v1',
          providerId: 'mock',
          isMock: true,
          latencyMs: 1,
        };
      },
    }
  );

  // Beri 1 microtask agar step scriptwriter mulai dan lock aktif
  await Promise.resolve();
  assert.equal(isPipelineLocked(), true);

  await assert.rejects(
    () =>
      runPipeline(
        {
          topic: 'Pipeline paralel terlarang',
          targetPlatform: 'youtube_shorts',
          includeResearch: false,
        },
        {
          profile: SAMPLE_PROFILE_FOR_TEST,
          styleProfiles: [],
          modelConfigs: DEFAULT_MODEL_CONFIGS,
          knowledge: DEFAULT_KNOWLEDGE,
          history: [],
          onRunUpdate: () => {},
          onHistorySave: () => {},
        }
      ),
    /proses pipeline yang sedang berjalan/i
  );

  ac.abort();
  resolveFirstStep();
  await runningPromise;
  assert.equal(isPipelineLocked(), false);
});

