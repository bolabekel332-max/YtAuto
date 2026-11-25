import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_PROFILE_FOR_TEST } from '../../shared/agentInputs';
import { DEFAULT_KNOWLEDGE } from '../knowledge/blocks';
import { DEFAULT_MODEL_CONFIGS } from './defaults';
import {
  clearLocalData,
  CORRUPT_BACKUP_KEY,
  exportAll,
  importAll,
  isDirty,
  load,
  MAX_IMPORT_BYTES,
  mergeKnowledgeBlocks,
  mergeModelConfigs,
  save,
  STORAGE_KEY,
} from './persistence';
import { safeExternalUrl } from '../utils/safeUrl';

function createMockStorage() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, val: string) {
      store.set(key, String(val));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function withMockWindowStorage(fn: (storage: ReturnType<typeof createMockStorage>) => void) {
  const g = globalThis as unknown as { window?: { localStorage: ReturnType<typeof createMockStorage> } };
  const prevWindow = g.window;
  const storage = createMockStorage();
  g.window = { localStorage: storage };
  try {
    clearLocalData();
    fn(storage);
  } finally {
    clearLocalData();
    if (prevWindow === undefined) {
      delete g.window;
    } else {
      g.window = prevWindow;
    }
  }
}

test('load() hanya mereset bagian yang korup dan mempertahankan bagian lain yang valid (B1)', () => {
  withMockWindowStorage((storage) => {
    const validState = {
      profile: SAMPLE_PROFILE_FOR_TEST,
      profileConfigured: true,
      styleProfiles: [],
      styleReferences: [],
      modelConfigs: DEFAULT_MODEL_CONFIGS,
      knowledge: DEFAULT_KNOWLEDGE,
      history: [],
      activeRun: null,
      changesSinceExport: 2,
    };
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...validState,
        profile: { invalidField: 123 }, // korup!
      })
    );

    const loaded = load();
    assert.ok(loaded.data);
    assert.equal(loaded.data.profile, undefined);
    assert.equal(loaded.data.profileConfigured, true);
    assert.equal(loaded.data.changesSinceExport, 2);
    assert.ok(loaded.warning?.includes('Profil Channel'));
  });
});

test('load() tidak crash pada JSON tidak valid di localStorage', () => {
  withMockWindowStorage((storage) => {
    storage.setItem(STORAGE_KEY, '{invalid-json');
    const loaded = load();
    assert.equal(loaded.data, null);
    assert.ok(loaded.warning?.includes('JSON tidak valid'));
  });
});

test('mergeModelConfigs dan mergeKnowledgeBlocks mempertahankan suntingan user serta menambah default baru', () => {
  const editedConfig = {
    ...DEFAULT_MODEL_CONFIGS[0],
    model: 'gemini-custom-test',
  };
  const mergedConfigs = mergeModelConfigs([editedConfig], DEFAULT_MODEL_CONFIGS);
  assert.equal(mergedConfigs.length, DEFAULT_MODEL_CONFIGS.length);
  assert.equal(mergedConfigs[0].model, 'gemini-custom-test');
  assert.equal(mergedConfigs[1].agentId, DEFAULT_MODEL_CONFIGS[1].agentId);

  const editedBlock = {
    ...DEFAULT_KNOWLEDGE[0],
    content: 'Suntingan manual user',
  };
  const mergedBlocks = mergeKnowledgeBlocks([editedBlock], DEFAULT_KNOWLEDGE);
  assert.equal(mergedBlocks.length, DEFAULT_KNOWLEDGE.length);
  assert.equal(mergedBlocks[0].content, 'Suntingan manual user');
  assert.equal(mergedBlocks[1].id, DEFAULT_KNOWLEDGE[1].id);
});

test('save, clearLocalData, dan isDirty bekerja konsisten', () => {
  withMockWindowStorage((storage) => {
    const res = save({
      profile: SAMPLE_PROFILE_FOR_TEST,
      profileConfigured: false,
      styleProfiles: [],
      styleReferences: [],
      modelConfigs: DEFAULT_MODEL_CONFIGS,
      knowledge: DEFAULT_KNOWLEDGE,
      history: [],
      activeRun: null,
      changesSinceExport: 0,
    });
    assert.equal(res.ok, true);
    assert.ok(storage.getItem(STORAGE_KEY));
    assert.equal(isDirty({ changesSinceExport: 0 }), false);
    assert.equal(isDirty({ changesSinceExport: 1 }), true);

    clearLocalData();
    assert.equal(storage.getItem(STORAGE_KEY), null);
  });
});

test('safeExternalUrl hanya mengizinkan http:// dan https://', () => {
  assert.equal(safeExternalUrl('https://youtube.com/watch?v=1'), 'https://youtube.com/watch?v=1');
  assert.equal(safeExternalUrl('http://example.com'), 'http://example.com/');
  assert.equal(safeExternalUrl('javascript:alert(1)'), null);
  assert.equal(safeExternalUrl('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(safeExternalUrl(''), null);
  assert.equal(safeExternalUrl(undefined), null);
});

test('F-21: load() mencadangkan payload JSON mentah yang korup ke CORRUPT_BACKUP_KEY', () => {
  withMockWindowStorage((storage) => {
    const broken = '{"profile": [corrupt';
    storage.setItem(STORAGE_KEY, broken);
    const loaded = load();
    assert.equal(loaded.data, null);
    assert.equal(storage.getItem(CORRUPT_BACKUP_KEY), broken);
  });
});

test('F-20: load() menyelamatkan entri history valid saat 1 entri korup dan menormalkan complianceRounds berlebih saat save/exportAll', () => {
  withMockWindowStorage((storage) => {
    const validEntry = {
      id: 'run_valid_1',
      createdAt: '2026-11-24T01:00:00.000Z',
      input: { topic: 'Topik valid', targetPlatform: 'youtube_shorts' as const, includeResearch: false },
      run: {
        id: 'run_valid_1',
        input: { topic: 'Topik valid', targetPlatform: 'youtube_shorts' as const, includeResearch: false },
        steps: {
          researcher: { status: 'skipped' as const },
          scriptwriter: { status: 'idle' as const },
          visual: { status: 'idle' as const },
          packaging: { status: 'idle' as const },
          compliance: { status: 'idle' as const },
          orchestrator: { status: 'idle' as const },
        },
        round: 0 as const,
        complianceRounds: [
          {
            verdict: 'revise' as const,
            issues: [
              {
                severity: 'medium' as const,
                relatedAgent: 'scriptwriter' as const,
                problem: 'Masalah 1',
                fix: 'Perbaikan 1',
              },
            ],
            similarityRisks: [],
            notes: 'Catatan',
          },
        ],
        status: 'paused' as const,
      },
      selection: { titleIndex: 0, hookIndex: 0 },
      profileSnapshot: SAMPLE_PROFILE_FOR_TEST,
    };

    const corruptEntry = { id: 'run_corrupt', bad: true };
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        history: [validEntry, corruptEntry],
      })
    );

    const loaded = load();
    assert.ok(loaded.data?.history);
    assert.equal(loaded.data.history.length, 1);
    assert.equal(loaded.data.history[0].id, 'run_valid_1');
    assert.ok(loaded.warning?.includes('1 entri tidak valid dilewati'));

    const oversizedEntry = structuredClone(validEntry);
    oversizedEntry.run.complianceRounds[0].issues = Array.from({ length: 35 }, (_, idx) => ({
      severity: 'medium' as const,
      relatedAgent: 'scriptwriter' as const,
      problem: `Masalah ${idx}`,
      fix: `Perbaikan ${idx}`,
    }));

    const saveRes = save({
      profile: SAMPLE_PROFILE_FOR_TEST,
      profileConfigured: true,
      styleProfiles: [],
      styleReferences: [],
      modelConfigs: DEFAULT_MODEL_CONFIGS,
      knowledge: DEFAULT_KNOWLEDGE,
      history: [oversizedEntry],
      activeRun: oversizedEntry.run,
      changesSinceExport: 1,
    });
    assert.equal(saveRes.ok, true);
    const savedParsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}') as {
      activeRun?: { complianceRounds: Array<{ issues: unknown[] }> };
    };
    assert.equal(savedParsed.activeRun?.complianceRounds[0].issues.length, 30);

    const exported = exportAll({
      profile: SAMPLE_PROFILE_FOR_TEST,
      profileConfigured: true,
      styleProfiles: [],
      styleReferences: [],
      modelConfigs: DEFAULT_MODEL_CONFIGS,
      knowledge: DEFAULT_KNOWLEDGE,
      history: [oversizedEntry],
      activeRun: oversizedEntry.run,
      changesSinceExport: 1,
    });
    assert.equal(exported.history[0].run.complianceRounds[0].issues.length, 30);
  });
});

test('F-25: importAll menolak file yang melampaui MAX_IMPORT_BYTES', () => {
  const huge = 'x'.repeat(MAX_IMPORT_BYTES + 10);
  const res = importAll(huge);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.ok(res.error.includes('melebihi batas maksimum'));
  }
});

test('R3-08: cadangan korup dibatasi <= 2 MB dan save() menghapus CORRUPT_BACKUP_KEY sebelum membuang history saat kuota penuh', () => {
  withMockWindowStorage((storage) => {
    // 1. Payload korup > 2 MB tidak boleh disimpan utuh ke CORRUPT_BACKUP_KEY
    const hugeCorrupt = `{"profile": "${'x'.repeat(2_200_000)}`;
    storage.setItem(STORAGE_KEY, hugeCorrupt);
    const loaded = load();
    assert.ok(loaded.warning);
    const backup = storage.getItem(CORRUPT_BACKUP_KEY);
    assert.ok(backup !== null);
    assert.ok(
      backup.length <= 2 * 1024 * 1024,
      `Ukuran CORRUPT_BACKUP_KEY (${backup.length}) harus <= 2 MB`
    );
    const parsedSummary = JSON.parse(backup) as { truncated?: boolean; originalBytes?: number };
    assert.equal(parsedSummary.truncated, true);
    assert.ok((parsedSummary.originalBytes ?? 0) > 2_000_000);
  });

  // 2. Saat QuotaExceededError terjadi pada save(), CORRUPT_BACKUP_KEY dihapus sebelum history dipotong
  const prevWindow = (globalThis as unknown as { window?: unknown }).window;
  const backing = new Map<string, string>();
  backing.set(CORRUPT_BACKUP_KEY, '{"old":"corrupt"}');

  const quotaStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (k === STORAGE_KEY && backing.has(CORRUPT_BACKUP_KEY)) {
        const quotaErr = new Error('Quota exceeded');
        quotaErr.name = 'QuotaExceededError';
        throw quotaErr;
      }
      backing.set(k, v);
    },
    removeItem: (k: string) => {
      backing.delete(k);
    },
    clear: () => backing.clear(),
  };
  (globalThis as unknown as { window: { localStorage: typeof quotaStorage } }).window = {
    localStorage: quotaStorage,
  };

  try {
    const entry = {
      id: 'run_keep_1',
      createdAt: '2026-11-24T01:00:00.000Z',
      input: { topic: 'Topik aman', targetPlatform: 'youtube_shorts' as const, includeResearch: false },
      run: {
        id: 'run_keep_1',
        input: { topic: 'Topik aman', targetPlatform: 'youtube_shorts' as const, includeResearch: false },
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
        status: 'paused' as const,
      },
      selection: { titleIndex: 0, hookIndex: 0 },
      profileSnapshot: SAMPLE_PROFILE_FOR_TEST,
    };

    const res = save({
      profile: SAMPLE_PROFILE_FOR_TEST,
      profileConfigured: true,
      styleProfiles: [],
      styleReferences: [],
      modelConfigs: DEFAULT_MODEL_CONFIGS,
      knowledge: DEFAULT_KNOWLEDGE,
      history: [entry],
      activeRun: null,
      changesSinceExport: 1,
    });
    assert.equal(res.ok, true);
    assert.equal(backing.get(CORRUPT_BACKUP_KEY), undefined, 'CORRUPT_BACKUP_KEY harus dihapus lebih dulu');
    const saved = JSON.parse(backing.get(STORAGE_KEY) ?? '{}') as { history?: unknown[] };
    assert.equal(saved.history?.length, 1, 'History tidak boleh dibuang bila penghapusan cadangan korup cukup');
  } finally {
    if (prevWindow === undefined) delete (globalThis as unknown as { window?: unknown }).window;
    else (globalThis as unknown as { window: unknown }).window = prevWindow;
  }
});

test('R3-18c: compliance notes 5000 char + 35 issues dinormalkan saat save/exportAll dan lolos round-trip load()', () => {
  withMockWindowStorage((storage) => {
    const oversizedComplianceRun = {
      id: 'run_r3_18c',
      input: { topic: 'Topik panjang', targetPlatform: 'youtube_shorts' as const, includeResearch: false },
      steps: {
        researcher: { status: 'skipped' as const },
        scriptwriter: { status: 'idle' as const },
        visual: { status: 'idle' as const },
        packaging: { status: 'idle' as const },
        compliance: { status: 'idle' as const },
        orchestrator: { status: 'idle' as const },
      },
      round: 1 as const,
      complianceRounds: [
        {
          verdict: 'revise' as const,
          issues: Array.from({ length: 35 }, (_, i) => ({
            severity: 'low' as const,
            relatedAgent: 'scriptwriter' as const,
            problem: `Masalah ${i}`,
            fix: `Perbaikan ${i}`,
          })),
          similarityRisks: [],
          notes: 'N'.repeat(5000),
        },
      ],
      status: 'paused' as const,
    };

    const data = {
      profile: SAMPLE_PROFILE_FOR_TEST,
      profileConfigured: true,
      styleProfiles: [],
      styleReferences: [],
      modelConfigs: DEFAULT_MODEL_CONFIGS,
      knowledge: DEFAULT_KNOWLEDGE,
      history: [
        {
          id: 'run_r3_18c',
          createdAt: '2026-11-24T01:00:00.000Z',
          input: oversizedComplianceRun.input,
          run: oversizedComplianceRun,
          selection: { titleIndex: 0, hookIndex: 0 },
          profileSnapshot: SAMPLE_PROFILE_FOR_TEST,
        },
      ],
      activeRun: oversizedComplianceRun,
      changesSinceExport: 1,
    };

    const saveRes = save(data);
    assert.equal(saveRes.ok, true);
    const exported = exportAll(data);
    assert.equal(exported.history[0].run.complianceRounds[0].notes.length, 4000);
    assert.equal(exported.history[0].run.complianceRounds[0].issues.length, 30);

    const loaded = load();
    assert.equal(loaded.warning, undefined);
    assert.equal(loaded.data?.history?.length, 1);
    assert.ok(storage.getItem(STORAGE_KEY));
  });
});

