import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_PROFILE_FOR_TEST } from '../../shared/agentInputs';
import { DEFAULT_KNOWLEDGE } from '../knowledge/blocks';
import { DEFAULT_MODEL_CONFIGS } from './defaults';
import {
  clearLocalData,
  isDirty,
  load,
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
