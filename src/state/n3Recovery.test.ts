import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { FIXTURES } from '../../server/providers/mockFixtures';
import { SAMPLE_PROFILE_FOR_TEST } from '../../shared/agentInputs';
import type { ChannelProfile } from '../../shared/schemas';
import { isPipelineLocked, runPipeline } from '../agents/pipeline';
import { DEFAULT_KNOWLEDGE } from '../knowledge/blocks';
import { createDefaultModelConfigs, DEFAULT_MODEL_CONFIGS } from './defaults';
import {
  buildRawExportPayload,
  clearLocalData,
  CORRUPT_BACKUP_KEY,
  exportAll,
  importAll,
  load,
  MAX_CORRUPT_BACKUP_BYTES,
  STORAGE_KEY,
  type PersistedAppData,
} from './persistence';
import { appReducer, buildDefaultState, StoreProvider, useStore, type StoreContextValue } from './store';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (idx: number) => Array.from(map.keys())[idx] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

function withMemoryWindow(fn: (storage: Storage) => void) {
  const g = globalThis as unknown as { window?: { localStorage: Storage } };
  const prev = g.window;
  const storage = createMemoryStorage();
  g.window = { localStorage: storage };
  try {
    clearLocalData();
    fn(storage);
  } finally {
    clearLocalData();
    if (prev === undefined) delete g.window;
    else g.window = prev;
  }
}

function makeValidHistoryEntry(id: string) {
  return {
    id,
    createdAt: '2026-11-26T00:00:00.000Z',
    input: { topic: `Topik ${id}`, targetPlatform: 'youtube_shorts' as const, includeResearch: false },
    run: {
      id,
      input: { topic: `Topik ${id}`, targetPlatform: 'youtube_shorts' as const, includeResearch: false },
      steps: {
        researcher: { status: 'skipped' as const },
        scriptwriter: { status: 'idle' as const },
        visual: { status: 'idle' as const },
        packaging: { status: 'idle' as const },
        compliance: { status: 'idle' as const },
        orchestrator: { status: 'idle' as const },
      },
      round: 0 as const,
      complianceRounds: [],
      status: 'completed' as const,
    },
    selection: { titleIndex: 0, hookIndex: 0 },
    profileSnapshot: SAMPLE_PROFILE_FOR_TEST as ChannelProfile,
  };
}

test('N3-03: importAll toleran untuk recoveryExport:true, kontrol negatif tanpa flag gagal, dan IMPORT_RECOVERY hanya menimpa keptSections', () => {
  const invalidData: PersistedAppData = {
    profile: { ...SAMPLE_PROFILE_FOR_TEST, niche: '' }, // rusak (min 1)
    profileConfigured: true,
    styleProfiles: [],
    styleReferences: [],
    modelConfigs: DEFAULT_MODEL_CONFIGS,
    knowledge: DEFAULT_KNOWLEDGE,
    history: [makeValidHistoryEntry('hist_ok')],
    activeRun: null,
    changesSinceExport: 1,
  };

  // exportAll normal tidak menyertakan recoveryExport
  const normalExport = exportAll({ ...invalidData, profile: SAMPLE_PROFILE_FOR_TEST });
  assert.equal('recoveryExport' in normalExport, false);

  const rawPayload = buildRawExportPayload(invalidData) as unknown as Record<string, unknown>;
  assert.equal(rawPayload.recoveryExport, true);
  // Sisipkan 1 entri history rusak di samping 1 entri valid
  rawPayload.history = [makeValidHistoryEntry('hist_ok'), { id: 'hist_bad', rusak: true }];

  const recRes = importAll(JSON.stringify(rawPayload));
  assert.equal(recRes.ok, true);
  if (!recRes.ok) throw new Error('Expected ok');
  assert.ok(recRes.recovery);
  assert.ok(recRes.recovery.droppedSections.some((s) => s.includes('Profil Channel')));
  assert.ok(recRes.recovery.droppedSections.some((s) => s.includes('Riwayat Run')));
  assert.ok(recRes.recovery.keptSections.includes('history'));
  assert.ok(recRes.recovery.keptSections.includes('knowledge'));
  assert.equal(recRes.recovery.keptSections.includes('profile'), false);
  assert.equal(recRes.recovery.partialData.history?.length, 1);

  // Kontrol negatif: JSON yang persis sama TANPA recoveryExport:true harus ditolak ok:false
  const withoutFlag = { ...rawPayload };
  delete withoutFlag.recoveryExport;
  const rejected = importAll(JSON.stringify(withoutFlag));
  assert.equal(rejected.ok, false);

  // IMPORT_RECOVERY hanya menimpa keptSections dan mempertahankan profile state yang ada
  const baseState = {
    ...buildDefaultState(),
    profile: { ...SAMPLE_PROFILE_FOR_TEST, niche: 'Niche Existing Aman' },
    profileConfigured: true,
  };
  const recoveredState = appReducer(baseState, {
    type: 'IMPORT_RECOVERY',
    partialData: recRes.recovery.partialData,
    keptSections: recRes.recovery.keptSections,
  });
  assert.equal(recoveredState.profile.niche, 'Niche Existing Aman');
  assert.equal(recoveredState.history.length, 1);
  assert.equal(recoveredState.history[0].id, 'hist_ok');
});

test('N3-04: cadangan korup menyimpan hanya bagian/entri rusak pada korupsi parsial dan menyimpan prefix hampir 2 MB pada JSON unparseable', () => {
  // 1. Korupsi parsial dalam payload > 2 MB: bagian sehat TIDAK ikut ke CORRUPT_BACKUP_KEY, entri korup utuh tersimpan
  withMemoryWindow((storage) => {
    const validEntries = Array.from({ length: 10 }, (_, idx) => {
      const entry = makeValidHistoryEntry(`healthy_${idx}`);
      entry.profileSnapshot = {
        ...SAMPLE_PROFILE_FOR_TEST,
        customNiche: `sehat-${idx}-${'A'.repeat(450)}`,
      };
      return entry;
    });
    const bigValidText = 'V'.repeat(2_250_000);
    const corruptHistoryEntry = { id: 'corrupt_target_entry', note: 'catatan_rusak_unik', bad: true };

    const hugePartialPayload = JSON.stringify({
      profile: SAMPLE_PROFILE_FOR_TEST,
      profileConfigured: true,
      styleProfiles: [
        {
          id: 'sp_valid',
          name: 'Valid',
          referenceIds: [],
          weights: {},
          attributes: (FIXTURES.styleAnalyst as { attributes: unknown }).attributes,
          edited: false,
        },
      ],
      styleReferences: [{ id: 'sr_1', type: 'description', source: bigValidText.slice(0, 1900), status: 'analyzed' }],
      lastExportedAt: bigValidText.slice(0, 2_250_000),
      history: [...validEntries, corruptHistoryEntry],
    });
    assert.ok(hugePartialPayload.length > MAX_CORRUPT_BACKUP_BYTES);
    storage.setItem(STORAGE_KEY, hugePartialPayload);

    const loaded = load();
    assert.equal(loaded.data?.profile?.niche, SAMPLE_PROFILE_FOR_TEST.niche);
    assert.equal(loaded.data?.history?.length, 10);

    const backupRaw = storage.getItem(CORRUPT_BACKUP_KEY);
    assert.ok(backupRaw !== null);
    assert.ok(backupRaw.length < 50_000, 'Backup parsial tidak boleh ikut menyalin bagian sehat >2 MB');
    const parsedBackup = JSON.parse(backupRaw) as {
      dropped?: { history?: Array<{ id?: string; note?: string }> };
    };
    assert.equal(parsedBackup.dropped?.history?.length, 1);
    assert.equal(parsedBackup.dropped?.history?.[0]?.note, 'catatan_rusak_unik');
  });

  // 2. Entri korup melebihi >2 MB sendiri: simpan yang paling kecil muat dan catat omittedCount
  withMemoryWindow((storage) => {
    const tinyCorrupt = { id: 'tiny_corrupt', tag: 'kecil' };
    const giantCorrupt = { id: 'giant_corrupt', blob: 'Z'.repeat(2_300_000) };
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        profile: SAMPLE_PROFILE_FOR_TEST,
        history: [giantCorrupt, tinyCorrupt],
      })
    );

    load();
    const backupRaw = storage.getItem(CORRUPT_BACKUP_KEY);
    assert.ok(backupRaw !== null);
    assert.ok(backupRaw.length <= MAX_CORRUPT_BACKUP_BYTES);
    const parsedBackup = JSON.parse(backupRaw) as {
      truncated?: boolean;
      omittedCount?: number;
      dropped?: { history?: Array<{ id?: string }> };
    };
    assert.equal(parsedBackup.truncated, true);
    assert.equal(parsedBackup.omittedCount, 1);
    assert.equal(parsedBackup.dropped?.history?.[0]?.id, 'tiny_corrupt');
  });

  // 3. JSON benar-benar tak bisa diparse > 2 MB -> prefix hampir 2 MB (bukan 1 KB) & tetap <= 2 MB
  withMemoryWindow((storage) => {
    const rawUnparseable = `{"broken_start": "${'Q'.repeat(3_000_000)}`;
    storage.setItem(STORAGE_KEY, rawUnparseable);
    load();
    const backupRaw = storage.getItem(CORRUPT_BACKUP_KEY);
    assert.ok(backupRaw !== null);
    assert.ok(backupRaw.length <= MAX_CORRUPT_BACKUP_BYTES);
    const parsed = JSON.parse(backupRaw) as {
      truncated?: boolean;
      originalBytes?: number;
      rawPrefix?: string;
    };
    assert.equal(parsed.truncated, true);
    assert.ok((parsed.originalBytes ?? 0) > 3_000_000);
    assert.ok(
      (parsed.rawPrefix?.length ?? 0) > 1_900_000,
      `rawPrefix (${parsed.rawPrefix?.length}) harus mendekati 2 MB`
    );
  });
});

test('N3-08: StoreProvider menolak RELOAD_FROM_STORAGE & RESOLVE_STORAGE_CONFLICT_OVERWRITE saat isPipelineLocked() dan mengizinkannya setelah selesai', async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost:3000/',
  });
  const savedKeys = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const saved = Object.fromEntries(savedKeys.map((k) => [k, g[k]]));

  g.window = dom.window;
  g.document = dom.window.document;
  g.IS_REACT_ACT_ENVIRONMENT = true;

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ac = new AbortController();

  const runPromise = runPipeline(
    { topic: 'Uji Store Lock', targetPlatform: 'youtube_shorts', includeResearch: false },
    {
      profile: SAMPLE_PROFILE_FOR_TEST,
      styleProfiles: [],
      modelConfigs: createDefaultModelConfigs('mock'),
      knowledge: DEFAULT_KNOWLEDGE,
      history: [],
      signal: ac.signal,
      onRunUpdate: () => {},
      onHistorySave: () => {},
      runAgentFn: async (req) => {
        if (req.agentId === 'scriptwriter') await gate;
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

  await Promise.resolve();
  assert.equal(isPipelineLocked(), true);

  let storeApi!: StoreContextValue;
  const Probe: React.FC = () => {
    storeApi = useStore();
    return null;
  };

  const root: Root = createRoot(dom.window.document.getElementById('root')!);
  try {
    act(() => {
      root.render(React.createElement(StoreProvider, null, React.createElement(Probe)));
    });

    // Simulasikan konflik tab lain + penulisan baru di localStorage
    dom.window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        profile: { ...SAMPLE_PROFILE_FOR_TEST, niche: 'Niche Tab Sebelah' },
        profileConfigured: true,
      })
    );
    act(() => {
      storeApi.dispatch({
        type: 'SET_STORAGE_WARNING',
        warning: 'Konflik tab',
        conflict: true,
      });
    });
    assert.equal(storeApi.state.storageConflict, true);

    // Saat pipeline terkunci, reloadFromStorage dan overwriteStorageFromCurrentTab harus ditolak
    act(() => {
      storeApi.reloadFromStorage();
    });
    assert.equal(storeApi.state.storageConflict, true);
    assert.ok(storeApi.state.storageWarning?.includes('Tunggu pipeline selesai'));
    assert.notEqual(storeApi.state.profile.niche, 'Niche Tab Sebelah');

    act(() => {
      storeApi.overwriteStorageFromCurrentTab();
    });
    assert.equal(storeApi.state.storageConflict, true);
    assert.ok(storeApi.state.storageWarning?.includes('Tunggu pipeline selesai'));

    // Kontrol negatif: setelah pipeline selesai, kedua aksi berfungsi normal
    ac.abort();
    release();
    await runPromise;
    assert.equal(isPipelineLocked(), false);

    act(() => {
      storeApi.reloadFromStorage();
    });
    assert.equal(storeApi.state.storageConflict, false);
    assert.equal(storeApi.state.profile.niche, 'Niche Tab Sebelah');

    act(() => {
      storeApi.dispatch({ type: 'SET_STORAGE_WARNING', warning: 'Konflik 2', conflict: true });
    });
    assert.equal(storeApi.state.storageConflict, true);
    act(() => {
      storeApi.overwriteStorageFromCurrentTab();
    });
    assert.equal(storeApi.state.storageConflict, false);
  } finally {
    if (isPipelineLocked()) {
      ac.abort();
      release();
      await runPromise;
    }
    act(() => {
      root.unmount();
    });
    dom.window.close();
    for (const k of savedKeys) {
      if (saved[k] === undefined) delete g[k];
      else g[k] = saved[k];
    }
  }
});
