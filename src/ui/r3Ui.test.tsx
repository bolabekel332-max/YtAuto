import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SAMPLE_PROFILE_FOR_TEST } from '../../shared/agentInputs';
import { FIXTURES } from '../../server/providers/mockFixtures';
import { ExportFileSchema, type StyleAttributes } from '../../shared/schemas';
import { isPipelineLocked, runPipeline } from '../agents/pipeline';
import { DEFAULT_KNOWLEDGE } from '../knowledge/blocks';
import { createDefaultModelConfigs } from '../state/defaults';
import { PipelineProvider } from '../state/pipelineContext';
import {
  buildRawExportPayload,
  clearCorruptBackup,
  CORRUPT_BACKUP_KEY,
  exportAll,
  hasCorruptBackup,
  STORAGE_KEY,
} from '../state/persistence';
import { StoreProvider } from '../state/store';
import { AppShell } from './components/AppShell';
import { ChipGroup, SelectField } from './components/FormFields';
import { Header } from './components/Header';
import { StyleReferenceAnalyzerForm } from './components/StyleReferenceAnalyzerForm';
import { Knowledge } from './pages/Knowledge';
import { ModelSettings } from './pages/ModelSettings';
import { AgentOutput } from './renderers/AgentOutput';
import { StyleProfileView } from './renderers/StyleProfileView';

function createMemoryWindow(seed: Record<string, string> = {}) {
  const mem = new Map<string, string>(Object.entries(seed));
  return {
    localStorage: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
      clear: () => {
        mem.clear();
      },
      key: (idx: number) => Array.from(mem.keys())[idx] ?? null,
      get length() {
        return mem.size;
      },
    } as Storage,
  };
}

function findUnnamedFormControls(html: string): string[] {
  const labelForIds = new Set<string>();
  const labelForRegex = /<label\b[^>]*\bfor=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = labelForRegex.exec(html)) !== null) {
    labelForIds.add(m[1]);
  }

  const unnamed: string[] = [];
  const tokenRegex = /<\/?label\b[^>]*>|<(input|select|textarea)\b[^>]*>/gi;
  let openLabelDepth = 0;

  while ((m = tokenRegex.exec(html)) !== null) {
    const tag = m[0];
    if (/^<label\b/i.test(tag)) {
      if (!tag.endsWith('/>')) openLabelDepth += 1;
      continue;
    }
    if (/^<\/label>/i.test(tag)) {
      openLabelDepth = Math.max(0, openLabelDepth - 1);
      continue;
    }

    const typeMatch = tag.match(/\btype=["']([^"']+)["']/i);
    if (typeMatch?.[1]?.toLowerCase() === 'hidden') continue;

    const hasAria =
      /\baria-label=["'][^"']+["']/i.test(tag) ||
      /\baria-labelledby=["'][^"']+["']/i.test(tag);
    const idMatch = tag.match(/\bid=["']([^"']+)["']/i);
    const hasForLabel = Boolean(idMatch?.[1] && labelForIds.has(idMatch[1]));
    const wrappedInLabel = openLabelDepth > 0;

    if (!hasAria && !hasForLabel && !wrappedInLabel) {
      unnamed.push(tag.slice(0, 120));
    }
  }
  return unnamed;
}

test('R3-13: AgentOutput tidak crash pada output korup/versi lama dan menampilkan pesan skema serta JSON mentah', () => {
  const html = renderToStaticMarkup(
    React.createElement(AgentOutput, {
      result: {
        agentId: 'researcher',
        output: { legacyWrongField: 'bentuk lama' },
        model: 'mock-sim-v1',
        providerId: 'mock',
        isMock: true,
        latencyMs: 12,
      },
    })
  );

  assert.ok(html.includes('Output tidak sesuai skema'));
  assert.ok(html.includes('Lihat JSON Mentah'));
  assert.ok(html.includes('nicheMap'));
});

test('R3-15: semua kontrol form di FormFields, ModelSettings, Knowledge, Header, dan StyleProfileView memiliki label aksesibel', () => {
  const formFieldsHtml = renderToStaticMarkup(
    React.createElement(
      'div',
      null,
      React.createElement(SelectField, {
        label: 'Pilih Opsi',
        value: 'Lainnya',
        options: ['A', 'Lainnya'],
        onChange: () => {},
        customValue: 'Kustom',
        onCustomChange: () => {},
      }),
      React.createElement(ChipGroup, {
        label: 'Minat',
        options: ['Teknologi', 'Lainnya'],
        selected: ['Teknologi', 'Lainnya'],
        onChange: () => {},
        customValue: 'Desain',
        onCustomChange: () => {},
      })
    )
  );
  assert.deepEqual(findUnnamedFormControls(formFieldsHtml), []);

  const styleAttrs = (FIXTURES.styleAnalyst as { attributes: StyleAttributes }).attributes;
  const styleViewHtml = renderToStaticMarkup(
    React.createElement(StyleProfileView, {
      attributes: styleAttrs,
      sourceOptions: [
        { id: 's1', name: 'Sumber 1' },
        { id: 's2', name: 'Sumber 2' },
      ],
      onChangeAttributes: () => {},
      onSelectAttributeSource: () => {},
    })
  );
  assert.deepEqual(
    findUnnamedFormControls(styleViewHtml),
    [],
    'StyleProfileView harus memberi label aksesibel ke semua input'
  );

  const modelSettingsHtml = renderToStaticMarkup(
    React.createElement(
      StoreProvider,
      null,
      React.createElement(
        PipelineProvider,
        null,
        React.createElement(ModelSettings)
      )
    )
  );
  assert.deepEqual(
    findUnnamedFormControls(modelSettingsHtml),
    [],
    'ModelSettings tidak boleh memiliki input/select tanpa label aksesibel'
  );

  const headerHtml = renderToStaticMarkup(
    React.createElement(
      StoreProvider,
      null,
      React.createElement(
        PipelineProvider,
        null,
        React.createElement(Header, { title: 'Judul', subtitle: 'Subjudul' })
      )
    )
  );
  assert.deepEqual(findUnnamedFormControls(headerHtml), []);

  const knowledgeHtml = renderToStaticMarkup(
    React.createElement(
      StoreProvider,
      null,
      React.createElement(
        Knowledge as React.FC<{ initialEditingId?: string }>,
        { initialEditingId: DEFAULT_KNOWLEDGE[0].id }
      )
    )
  );
  assert.deepEqual(
    findUnnamedFormControls(knowledgeHtml),
    [],
    'Knowledge edit form tidak boleh memiliki input/select/textarea tanpa label aksesibel'
  );
});

test('R3-16: StyleReferenceAnalyzerForm menampilkan peringatan kapabilitas dan menonaktifkan submit pada tab upload_video/upload_images saat provider tanpa vision', () => {
  const g = globalThis as unknown as {
    window?: { localStorage: Storage };
  };
  const prevWindow = g.window;
  g.window = createMemoryWindow({
    [STORAGE_KEY]: JSON.stringify({
      modelConfigs: createDefaultModelConfigs('mock'),
    }),
  });

  try {
    for (const tab of ['upload_video', 'upload_images'] as const) {
      const html = renderToStaticMarkup(
        React.createElement(
          StoreProvider,
          null,
          React.createElement(StyleReferenceAnalyzerForm, { initialType: tab })
        )
      );
      assert.ok(
        html.includes('tidak mendukung input Gambar/Frame'),
        `Tab ${tab} harus menampilkan peringatan kapabilitas prapengiriman`
      );
      assert.ok(
        /<button[^>]*disabled=""[^>]*>[\s\S]*Analisis &amp; Simpan Profil Gaya/i.test(html),
        `Tombol submit pada tab ${tab} harus dinonaktifkan saat provider tanpa dukungan gambar`
      );
    }
  } finally {
    if (prevWindow === undefined) delete g.window;
    else g.window = prevWindow;
  }
});

test('R3-08 & R3-17: AppShell menampilkan tombol cadangan korup saat tersedia dan teks Privasi & Data tanpa password gate', () => {
  const g = globalThis as unknown as {
    window?: { localStorage: Storage };
  };
  const prevWindow = g.window;
  g.window = createMemoryWindow({
    [STORAGE_KEY]: '{invalid-corrupt-json',
  });

  try {
    const html = renderToStaticMarkup(
      React.createElement(
        StoreProvider,
        null,
        React.createElement(
          PipelineProvider,
          null,
          React.createElement(AppShell, null, React.createElement('div', null, 'Konten'))
        )
      )
    );
    assert.equal(hasCorruptBackup(), true);
    assert.ok(html.includes('Unduh cadangan korup'));
    assert.ok(html.includes('Hapus cadangan'));
    assert.ok(html.includes('Privasi &amp; Data'));
    assert.equal(html.includes('APP_ACCESS_CODE'), false);

    clearCorruptBackup();
    assert.equal(hasCorruptBackup(), false);
    assert.equal(g.window.localStorage.getItem(CORRUPT_BACKUP_KEY), null);
  } finally {
    if (prevWindow === undefined) delete g.window;
    else g.window = prevWindow;
  }
});

test('R3-14: buildRawExportPayload tetap menghasilkan backup saat exportAll gagal validasi ExportFileSchema', () => {
  const invalidLegacyData = {
    profile: { ...SAMPLE_PROFILE_FOR_TEST, niche: '' },
    profileConfigured: true,
    styleProfiles: [],
    styleReferences: [],
    modelConfigs: createDefaultModelConfigs('mock'),
    knowledge: DEFAULT_KNOWLEDGE,
    history: [],
    activeRun: null,
    changesSinceExport: 1,
  };

  assert.throws(() => exportAll(invalidLegacyData));
  const rawFallback = buildRawExportPayload(invalidLegacyData);
  assert.equal(rawFallback.profile.niche, '');
  assert.equal(ExportFileSchema.safeParse(rawFallback).success, false);
});

test('R3-18e: Header menonaktifkan tombol Impor JSON dan Hapus Data saat pipeline lock aktif', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ac = new AbortController();

  const runPromise = runPipeline(
    { topic: 'Uji Header Lock', targetPlatform: 'youtube_shorts', includeResearch: false },
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

  const lockedHeaderHtml = renderToStaticMarkup(
    React.createElement(
      StoreProvider,
      null,
      React.createElement(
        PipelineProvider,
        null,
        React.createElement(Header, { title: 'Studio Video', subtitle: 'Subjudul' })
      )
    )
  );
  assert.ok(
    /<button[^>]*disabled=""[^>]*>[\s\S]*Impor JSON/i.test(lockedHeaderHtml),
    'Tombol Impor JSON harus disabled saat pipeline aktif'
  );
  assert.ok(
    /<button[^>]*disabled=""[^>]*>[\s\S]*Hapus Data/i.test(lockedHeaderHtml),
    'Tombol Hapus Data harus disabled saat pipeline aktif'
  );

  ac.abort();
  release();
  await runPromise;
  assert.equal(isPipelineLocked(), false);
});
