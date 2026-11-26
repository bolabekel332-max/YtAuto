import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { SAMPLE_PROFILE_FOR_TEST } from '../../shared/agentInputs';
import { FIXTURES } from '../../server/providers/mockFixtures';
import { ExportFileSchema, type ChannelProfile, type StyleAttributes } from '../../shared/schemas';
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
import { StoreProvider, useStore } from '../state/store';
import { AccessibleDialog } from './components/AccessibleDialog';
import { AppShell } from './components/AppShell';
import { ChipGroup, SelectField } from './components/FormFields';
import { Header } from './components/Header';
import { StyleReferenceAnalyzerForm } from './components/StyleReferenceAnalyzerForm';
import { Knowledge } from './pages/Knowledge';
import { ModelSettings } from './pages/ModelSettings';
import { AgentOutput } from './renderers/AgentOutput';
import { StyleProfileView } from './renderers/StyleProfileView';

const GLOBAL_KEYS = [
  'window',
  'document',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'Event',
  'KeyboardEvent',
  'MouseEvent',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
  'IS_REACT_ACT_ENVIRONMENT',
] as const;

interface DomHarness {
  dom: JSDOM;
  rootEl: HTMLElement;
  rerender: (nextEl: React.ReactElement) => void;
  cleanup: () => void;
}

function renderInDom(
  element: React.ReactElement,
  seedStorage: Record<string, string> = {}
): DomHarness {
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = new Map<string, unknown>();
  for (const key of GLOBAL_KEYS) {
    saved.set(key, g[key]);
  }

  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: 'http://localhost:3000/', pretendToBeVisual: true }
  );
  const w = dom.window;

  for (const [k, v] of Object.entries(seedStorage)) {
    w.localStorage.setItem(k, v);
  }

  g.window = w;
  g.document = w.document;
  g.Node = w.Node;
  g.Element = w.Element;
  g.HTMLElement = w.HTMLElement;
  g.HTMLInputElement = w.HTMLInputElement;
  g.HTMLButtonElement = w.HTMLButtonElement;
  g.Event = w.Event;
  g.KeyboardEvent = w.KeyboardEvent;
  g.MouseEvent = w.MouseEvent;
  g.requestAnimationFrame =
    typeof w.requestAnimationFrame === 'function'
      ? w.requestAnimationFrame.bind(w)
      : (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16);
  g.cancelAnimationFrame =
    typeof w.cancelAnimationFrame === 'function'
      ? w.cancelAnimationFrame.bind(w)
      : (id: number) => clearTimeout(id);
  g.getComputedStyle = w.getComputedStyle.bind(w);
  g.IS_REACT_ACT_ENVIRONMENT = true;

  const rootEl = w.document.getElementById('root')!;
  const root: Root = createRoot(rootEl);

  act(() => {
    root.render(element);
  });

  return {
    dom,
    rootEl,
    rerender: (nextEl: React.ReactElement) => {
      act(() => {
        root.render(nextEl);
      });
    },
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      w.close();
      for (const key of GLOBAL_KEYS) {
        const prev = saved.get(key);
        if (prev === undefined) {
          delete g[key];
        } else {
          g[key] = prev;
        }
      }
    },
  };
}

function findButton(container: ParentNode, text: string): HTMLButtonElement {
  const normalizedTarget = text.replace(/\s+/g, ' ').trim().toLowerCase();
  const buttons = Array.from(container.querySelectorAll('button'));
  const found = buttons.find((btn) =>
    (btn.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase().includes(normalizedTarget)
  );
  assert.ok(found, `Tombol dengan teks "${text}" harus ditemukan di DOM`);
  return found as HTMLButtonElement;
}

function findUnnamedControlsInDom(container: ParentNode): string[] {
  const unnamed: string[] = [];
  const controls = Array.from(
    container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input, select, textarea'
    )
  );

  for (const el of controls) {
    if (el.tagName === 'INPUT' && (el as HTMLInputElement).type.toLowerCase() === 'hidden') {
      continue;
    }
    const hasLabels = Boolean(el.labels && el.labels.length > 0);
    const hasAriaLabel = Boolean(el.getAttribute('aria-label')?.trim());
    const hasAriaLabelledBy = Boolean(el.getAttribute('aria-labelledby')?.trim());
    if (!hasLabels && !hasAriaLabel && !hasAriaLabelledBy) {
      unnamed.push(el.outerHTML.slice(0, 120));
    }
  }
  return unnamed;
}

test('R3-13 & N3-01: AgentOutput menangani skema korup serta menampilkan/menyembunyikan banner repairedWithoutGrounding', () => {
  const corruptHarness = renderInDom(
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
  try {
    const text = corruptHarness.rootEl.textContent ?? '';
    assert.ok(text.includes('Output tidak sesuai skema'));
    assert.ok(text.includes('Lihat JSON Mentah'));
    assert.ok(text.includes('nicheMap'));
  } finally {
    corruptHarness.cleanup();
  }

  // N3-01: positif repairedWithoutGrounding === true
  const repairedHarness = renderInDom(
    React.createElement(AgentOutput, {
      result: {
        agentId: 'researcher',
        output: FIXTURES.researcher,
        model: 'gemini-4-hydrogen',
        providerId: 'gemini',
        searchUsed: true,
        groundedSourceCount: 0,
        repairedWithoutGrounding: true,
        isMock: false,
        latencyMs: 25,
      },
    })
  );
  try {
    const text = repairedHarness.rootEl.textContent ?? '';
    assert.ok(text.includes('Output diperbaiki tanpa data pencarian; sumber tidak ditampilkan'));
    assert.equal(text.includes('Sumber Grounding Pencarian Server'), false);
  } finally {
    repairedHarness.cleanup();
  }

  // Kontrol negatif N3-01: tanpa repairedWithoutGrounding banner tersebut tidak muncul
  const normalHarness = renderInDom(
    React.createElement(AgentOutput, {
      result: {
        agentId: 'researcher',
        output: FIXTURES.researcher,
        sources: [{ title: 'Sumber Asli', url: 'https://example.com/sumber' }],
        model: 'gemini-4-hydrogen',
        providerId: 'gemini',
        searchUsed: true,
        groundedSourceCount: 1,
        isMock: false,
        latencyMs: 25,
      },
    })
  );
  try {
    const text = normalHarness.rootEl.textContent ?? '';
    assert.equal(text.includes('Output diperbaiki tanpa data pencarian; sumber tidak ditampilkan'), false);
    assert.ok(text.includes('Sumber Asli'));
  } finally {
    normalHarness.cleanup();
  }
});

test('R3-15 & N3-02: semua kontrol form di DOM memiliki label aksesibel (dengan kontrol negatif)', async () => {
  // Kontrol negatif: detector harus menemukan input tanpa label
  const badHarness = renderInDom(
    React.createElement('div', null, React.createElement('input', { type: 'text' }))
  );
  try {
    assert.equal(findUnnamedControlsInDom(badHarness.rootEl).length, 1);
  } finally {
    badHarness.cleanup();
  }

  const formFieldsHarness = renderInDom(
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
  try {
    assert.deepEqual(findUnnamedControlsInDom(formFieldsHarness.rootEl), []);
  } finally {
    formFieldsHarness.cleanup();
  }

  const styleAttrs = (FIXTURES.styleAnalyst as { attributes: StyleAttributes }).attributes;
  const styleViewHarness = renderInDom(
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
  try {
    assert.deepEqual(findUnnamedControlsInDom(styleViewHarness.rootEl), []);
  } finally {
    styleViewHarness.cleanup();
  }

  const prevFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        providers: [],
        dailyCallsUsed: 0,
        dailyCallCap: 300,
        nousOAuthEnabled: false,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch;
  const modelSettingsHarness = renderInDom(
    React.createElement(
      StoreProvider,
      null,
      React.createElement(PipelineProvider, null, React.createElement(ModelSettings))
    )
  );
  try {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 15));
    });
    assert.deepEqual(findUnnamedControlsInDom(modelSettingsHarness.rootEl), []);
  } finally {
    modelSettingsHarness.cleanup();
    globalThis.fetch = prevFetch;
  }

  const headerHarness = renderInDom(
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
  try {
    assert.deepEqual(findUnnamedControlsInDom(headerHarness.rootEl), []);
  } finally {
    headerHarness.cleanup();
  }

  const knowledgeHarness = renderInDom(
    React.createElement(
      StoreProvider,
      null,
      React.createElement(Knowledge as React.FC<{ initialEditingId?: string }>, {
        initialEditingId: DEFAULT_KNOWLEDGE[0].id,
      })
    )
  );
  try {
    assert.deepEqual(findUnnamedControlsInDom(knowledgeHarness.rootEl), []);
  } finally {
    knowledgeHarness.cleanup();
  }
});

test('R3-16 & N3-02: StyleReferenceAnalyzerForm menonaktifkan submit pada upload_video/upload_images untuk mock dan mengaktifkannya untuk gemini', () => {
  // 1. Provider Mock (tanpa capability image) -> warning tampil dan button.disabled === true
  const mockHarness = renderInDom(
    React.createElement(
      StoreProvider,
      null,
      React.createElement(StyleReferenceAnalyzerForm, { initialType: 'description' })
    ),
    {
      [STORAGE_KEY]: JSON.stringify({
        modelConfigs: createDefaultModelConfigs('mock'),
      }),
    }
  );
  try {
    // Awalnya tab description tidak menonaktifkan tombol
    assert.equal(findButton(mockHarness.rootEl, 'Analisis & Simpan Profil Gaya').disabled, false);

    for (const tabText of ['Unggah Video', 'Unggah Gambar']) {
      act(() => {
        findButton(mockHarness.rootEl, tabText).click();
      });
      const alertEl = mockHarness.rootEl.querySelector('[role="alert"]');
      assert.ok(
        alertEl?.textContent?.includes('tidak mendukung input Gambar/Frame'),
        `Tab "${tabText}" harus menampilkan peringatan kapabilitas untuk provider mock`
      );
      assert.equal(
        findButton(mockHarness.rootEl, 'Analisis & Simpan Profil Gaya').disabled,
        true,
        `Tombol submit pada "${tabText}" harus disabled untuk mock`
      );
    }
  } finally {
    mockHarness.cleanup();
  }

  // 2. Kontrol negatif: provider Gemini (image: true) -> peringatan tidak muncul dan button.disabled === false
  const geminiHarness = renderInDom(
    React.createElement(
      StoreProvider,
      null,
      React.createElement(StyleReferenceAnalyzerForm, { initialType: 'upload_video' })
    ),
    {
      [STORAGE_KEY]: JSON.stringify({
        modelConfigs: createDefaultModelConfigs('gemini'),
      }),
    }
  );
  try {
    for (const tabText of ['Unggah Video', 'Unggah Gambar']) {
      act(() => {
        findButton(geminiHarness.rootEl, tabText).click();
      });
      assert.equal(
        geminiHarness.rootEl.textContent?.includes('tidak mendukung input Gambar/Frame'),
        false
      );
      assert.equal(
        findButton(geminiHarness.rootEl, 'Analisis & Simpan Profil Gaya').disabled,
        false,
        `Tombol submit pada "${tabText}" harus aktif untuk Gemini`
      );
    }
  } finally {
    geminiHarness.cleanup();
  }
});

test('N3-02: AccessibleDialog mengelola focus masuk, Tab trap, Escape, inert pada #root, dan pemulihan fokus', async () => {
  const DialogHost: React.FC = () => {
    const [open, setOpen] = useState(false);
    return React.createElement(
      'div',
      null,
      React.createElement(
        'button',
        { type: 'button', id: 'open-dialog-btn', onClick: () => setOpen(true) },
        'Buka Dialog'
      ),
      React.createElement(AccessibleDialog, {
        open,
        ariaLabel: 'Dialog Uji',
        onClose: () => setOpen(false),
        children: React.createElement(
          'div',
          null,
          React.createElement('button', { type: 'button', id: 'dlg-first' }, 'Pertama'),
          React.createElement('button', { type: 'button', id: 'dlg-last' }, 'Terakhir')
        ),
      })
    );
  };

  const harness = renderInDom(React.createElement(DialogHost));
  try {
    const doc = harness.dom.window.document;
    const triggerBtn = doc.getElementById('open-dialog-btn') as HTMLButtonElement;
    triggerBtn.focus();
    assert.equal(doc.activeElement, triggerBtn);
    assert.notEqual((harness.rootEl as HTMLElement & { inert?: boolean }).inert, true);
    assert.equal(doc.querySelector('[role="dialog"]'), null);

    act(() => {
      triggerBtn.click();
    });

    // Tunggu requestAnimationFrame memindahkan fokus ke dalam dialog
    await act(async () => {
      await new Promise((r) => setTimeout(r, 35));
    });

    const dialogEl = doc.querySelector('[role="dialog"]');
    assert.ok(dialogEl, 'Dialog harus dirender ke document.body');
    assert.equal((harness.rootEl as HTMLElement & { inert?: boolean }).inert, true);

    const firstBtn = doc.getElementById('dlg-first') as HTMLButtonElement;
    const lastBtn = doc.getElementById('dlg-last') as HTMLButtonElement;
    assert.equal(doc.activeElement, firstBtn, 'Fokus awal harus masuk ke elemen pertama dialog');

    // Shift+Tab di elemen pertama harus membungkus ke elemen terakhir
    act(() => {
      doc.dispatchEvent(
        new harness.dom.window.KeyboardEvent('keydown', {
          key: 'Tab',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        })
      );
    });
    assert.equal(doc.activeElement, lastBtn, 'Shift+Tab dari pertama harus trap ke terakhir');

    // Tab di elemen terakhir harus membungkus kembali ke elemen pertama
    act(() => {
      doc.dispatchEvent(
        new harness.dom.window.KeyboardEvent('keydown', {
          key: 'Tab',
          shiftKey: false,
          bubbles: true,
          cancelable: true,
        })
      );
    });
    assert.equal(doc.activeElement, firstBtn, 'Tab dari terakhir harus trap ke pertama');

    // Escape menutup dialog, membersihkan inert, dan mengembalikan fokus ke trigger
    act(() => {
      doc.dispatchEvent(
        new harness.dom.window.KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        })
      );
    });

    assert.equal(doc.querySelector('[role="dialog"]'), null);
    assert.equal((harness.rootEl as HTMLElement & { inert?: boolean }).inert, false);
    assert.equal(doc.activeElement, triggerBtn, 'Fokus harus kembali ke tombol pemicu');
  } finally {
    harness.cleanup();
  }
});

test('R3-08 & R3-17 & N3-08: AppShell menampilkan cadangan korup serta menonaktifkan tombol konflik tab hanya saat pipeline terkunci', async () => {
  const corruptHarness = renderInDom(
    React.createElement(
      StoreProvider,
      null,
      React.createElement(
        PipelineProvider,
        null,
        React.createElement(AppShell, null, React.createElement('div', null, 'Konten'))
      )
    ),
    {
      [STORAGE_KEY]: '{invalid-corrupt-json',
    }
  );
  try {
    assert.equal(hasCorruptBackup(), true);
    assert.ok(findButton(corruptHarness.rootEl, 'Unduh cadangan korup'));
    assert.ok(findButton(corruptHarness.rootEl, 'Hapus cadangan'));
    assert.ok(corruptHarness.rootEl.textContent?.includes('Privasi & Data'));
    assert.equal(corruptHarness.rootEl.textContent?.includes('APP_ACCESS_CODE'), false);

    clearCorruptBackup();
    assert.equal(hasCorruptBackup(), false);
    assert.equal(corruptHarness.dom.window.localStorage.getItem(CORRUPT_BACKUP_KEY), null);
  } finally {
    corruptHarness.cleanup();
  }

  // N3-08: Tombol konflik tab di AppShell disabled saat isPipelineLocked() === true dan aktif setelah selesai
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ac = new AbortController();

  const runPromise = runPipeline(
    { topic: 'Uji AppShell Conflict Lock', targetPlatform: 'youtube_shorts', includeResearch: false },
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

  const ConflictTriggerHost: React.FC = () => {
    const { state, dispatch } = useStore();
    return React.createElement(
      AppShell,
      null,
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () =>
            dispatch({
              type: 'SET_STORAGE_WARNING',
              warning: 'Data diubah di tab lain.',
              conflict: true,
            }),
        },
        state.storageConflict ? 'Konflik Aktif' : 'Picu Konflik'
      )
    );
  };

  const lockHarness = renderInDom(
    React.createElement(
      StoreProvider,
      null,
      React.createElement(PipelineProvider, null, React.createElement(ConflictTriggerHost))
    )
  );
  try {
    act(() => {
      findButton(lockHarness.rootEl, 'Picu Konflik').click();
    });

    assert.equal(findButton(lockHarness.rootEl, 'Muat data tab terbaru').disabled, true);
    assert.equal(findButton(lockHarness.rootEl, 'Timpa dengan data tab ini').disabled, true);

    ac.abort();
    release();
    await runPromise;
    assert.equal(isPipelineLocked(), false);

    // Kontrol negatif: setelah pipeline selesai dan re-render, kedua tombol menjadi aktif
    lockHarness.rerender(
      React.createElement(
        StoreProvider,
        null,
        React.createElement(PipelineProvider, null, React.createElement(ConflictTriggerHost))
      )
    );
    assert.equal(findButton(lockHarness.rootEl, 'Muat data tab terbaru').disabled, false);
    assert.equal(findButton(lockHarness.rootEl, 'Timpa dengan data tab ini').disabled, false);
  } finally {
    if (isPipelineLocked()) {
      ac.abort();
      release();
      await runPromise;
    }
    lockHarness.cleanup();
  }
});

test('R3-14 & N3-03: buildRawExportPayload menyertakan penanda recoveryExport saat exportAll gagal', () => {
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
  assert.equal(rawFallback.recoveryExport, true);
  assert.equal(rawFallback.profile.niche, '');
  assert.equal(ExportFileSchema.safeParse(rawFallback).success, false);
});

test('N3-03 UI: Header menampilkan label pemulihan darurat & dialog konfirmasi parsing toleran', async () => {
  const HeaderHost: React.FC = () => {
    const { dispatch } = useStore();
    return React.createElement(
      'div',
      null,
      React.createElement(Header, { title: 'Header Uji', subtitle: 'Subjudul' }),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () =>
            dispatch({
              type: 'SET_PROFILE',
              profile: { ...SAMPLE_PROFILE_FOR_TEST, niche: '' } as ChannelProfile,
            }),
        },
        'Set Profil Rusak'
      )
    );
  };

  const harness = renderInDom(
    React.createElement(
      StoreProvider,
      null,
      React.createElement(PipelineProvider, null, React.createElement(HeaderHost))
    )
  );
  try {
    // 1. Set profil invalid di state, lalu klik Ekspor JSON -> muncul tombol Ekspor mentah (hanya pemulihan darurat)
    act(() => {
      findButton(harness.rootEl, 'Set Profil Rusak').click();
    });
    act(() => {
      findButton(harness.rootEl, 'Ekspor Cadangan*').click();
    });
    assert.ok(findButton(harness.rootEl, 'Ekspor mentah (hanya pemulihan darurat)'));

    // 2. Pilih file recoveryExport dengan profile rusak + knowledge valid -> dialog menampilkan warning pemulihan darurat
    const fileInput = harness.rootEl.querySelector('input[type="file"]') as HTMLInputElement;
    assert.ok(fileInput);
    const recoveryPayload = {
      recoveryExport: true,
      schemaVersion: 1,
      exportedAt: '2026-11-26T00:00:00.000Z',
      profile: { ...SAMPLE_PROFILE_FOR_TEST, niche: '' }, // rusak -> dilewati
      knowledge: DEFAULT_KNOWLEDGE,
    };
    const fakeFile = {
      name: 'recovery.json',
      text: async () => JSON.stringify(recoveryPayload),
    };
    Object.defineProperty(fileInput, 'files', {
      value: [fakeFile],
      configurable: true,
    });

    await act(async () => {
      fileInput.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 20));
    });

    const dialogEl = harness.dom.window.document.querySelector('[role="dialog"]');
    assert.ok(dialogEl, 'Dialog konfirmasi impor darurat harus terbuka');
    const dialogText = dialogEl.textContent ?? '';
    assert.ok(dialogText.includes('File ekspor darurat: bagian Profil Channel dilewati'));
    assert.ok(dialogText.includes('Blok Pengetahuan akan dipulihkan'));
  } finally {
    harness.cleanup();
  }
});

test('R3-18e & N3-02: Header menonaktifkan Impor JSON dan Hapus Data saat pipeline lock aktif dan mengaktifkannya lagi setelah selesai', async () => {
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

  const tree = React.createElement(
    StoreProvider,
    null,
    React.createElement(
      PipelineProvider,
      null,
      React.createElement(Header, { title: 'Studio Video', subtitle: 'Subjudul' })
    )
  );

  const harness = renderInDom(tree);
  try {
    assert.equal(findButton(harness.rootEl, 'Impor JSON').disabled, true);
    assert.equal(findButton(harness.rootEl, 'Hapus Data').disabled, true);

    ac.abort();
    release();
    await runPromise;
    assert.equal(isPipelineLocked(), false);

    // Kontrol negatif: setelah pipeline selesai dan re-render, kedua tombol menjadi aktif
    harness.rerender(
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
    assert.equal(findButton(harness.rootEl, 'Impor JSON').disabled, false);
    assert.equal(findButton(harness.rootEl, 'Hapus Data').disabled, false);
  } finally {
    if (isPipelineLocked()) {
      ac.abort();
      release();
      await runPromise;
    }
    harness.cleanup();
  }
});
