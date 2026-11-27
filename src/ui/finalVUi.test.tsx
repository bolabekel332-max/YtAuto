import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { FIXTURES } from '../../server/providers/mockFixtures';
import type { ProvidersStatusResponse } from '../../shared/api';
import { SAMPLE_PROFILE_FOR_TEST } from '../../shared/agentInputs';
import { buildAutoConfigPlan } from '../config/modelAutoConfig';
import { AgentTaskProvider } from '../state/agentTaskContext';
import { createDefaultModelConfigs, DEFAULT_GEMINI_MODEL } from '../state/defaults';
import { clearProviderStatusCacheForTests } from '../state/modelPolicyGuard';
import { PipelineProvider } from '../state/pipelineContext';
import { STORAGE_KEY } from '../state/persistence';
import { StoreProvider, useStore } from '../state/store';
import { AppShell } from './components/AppShell';
import { AutoConfigModal } from './components/AutoConfigModal';
import { StyleReferenceAnalyzerForm } from './components/StyleReferenceAnalyzerForm';
import { Analytics } from './pages/Analytics';
import { Ideas } from './pages/Ideas';
import { ModelSettings } from './pages/ModelSettings';
import { SetupChannel } from './pages/SetupChannel';
import { VideoStudio } from './pages/VideoStudio';

const GLOBAL_KEYS = [
  'window',
  'document',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
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
  cleanup: () => void;
}

let createRootImpl: ((container: Element | DocumentFragment) => Root) | null = null;

before(async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const savedWindow = g.window;
  const savedDocument = g.document;
  const bootstrapDom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost:3000/',
  });
  g.window = bootstrapDom.window;
  g.document = bootstrapDom.window.document;
  try {
    const mod = await import('react-dom/client');
    createRootImpl = mod.createRoot;
  } finally {
    bootstrapDom.window.close();
    if (savedWindow === undefined) delete g.window;
    else g.window = savedWindow;
    if (savedDocument === undefined) delete g.document;
    else g.document = savedDocument;
  }
});

function renderInDom(
  element: React.ReactElement,
  seedStorage: Record<string, string> = {}
): DomHarness {
  assert.ok(createRootImpl, 'react-dom/client createRoot harus sudah terinisialisasi');
  clearProviderStatusCacheForTests();
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = new Map<string, unknown>();
  for (const key of GLOBAL_KEYS) {
    saved.set(key, g[key]);
  }

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost:3000/',
    pretendToBeVisual: true,
  });
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
  g.HTMLTextAreaElement = w.HTMLTextAreaElement;
  g.HTMLButtonElement = w.HTMLButtonElement;
  g.Event = w.Event;
  g.KeyboardEvent = w.KeyboardEvent;
  g.MouseEvent = w.MouseEvent;
  g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16);
  g.cancelAnimationFrame = (id: number) => clearTimeout(id);
  g.getComputedStyle = w.getComputedStyle.bind(w);
  g.IS_REACT_ACT_ENVIRONMENT = true;

  const rootEl = w.document.getElementById('root')!;
  const root: Root = createRootImpl(rootEl);

  act(() => {
    root.render(element);
  });

  return {
    dom,
    rootEl,
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      w.close();
      clearProviderStatusCacheForTests();
      for (const key of GLOBAL_KEYS) {
        const prev = saved.get(key);
        if (prev === undefined) delete g[key];
        else g[key] = prev;
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
  assert.ok(found, `Tombol "${text}" harus ada di DOM`);
  return found as HTMLButtonElement;
}

function findCardSectionByTitle(container: ParentNode, titleText: string): HTMLElement {
  const headings = Array.from(container.querySelectorAll('section h2'));
  const h2 = headings.find((el) => (el.textContent ?? '').trim() === titleText);
  assert.ok(h2, `Kartu dengan judul "${titleText}" harus ada di DOM`);
  const section = h2.closest('section');
  assert.ok(section, `Elemen <section> untuk "${titleText}" harus ada di DOM`);
  return section as HTMLElement;
}

function setReactInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  descriptor?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

const RESTRICTED_OPENROUTER_STATUS: ProvidersStatusResponse = {
  providers: [
    {
      id: 'mock',
      name: 'Mock',
      keyDetected: true,
      available: true,
      tested: true,
      statusNote: 'ok',
      capabilities: { jsonSchema: true, jsonObject: true, search: false, video: false, image: false },
      modelPolicy: { restricted: false, explicit: false, allowlist: [], allowFreeModels: true },
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      keyDetected: true,
      available: true,
      tested: true,
      statusNote: 'ok',
      capabilities: { jsonSchema: true, jsonObject: true, search: true, video: false, image: true },
      modelPolicy: {
        restricted: true,
        explicit: true,
        allowlist: ['meta-llama/llama-3.3-70b:free'],
        allowFreeModels: false,
      },
    },
  ],
  dailyCallsUsed: 0,
  dailyCallCap: 300,
  nousOAuthEnabled: false,
};

test('V-01 DOM (ModelSettings): memperingatkan model yang akan ditolak server dan memblokir /api/agent/test sebelum request', async () => {
  const prevFetch = globalThis.fetch;
  let agentTestCalls = 0;

  globalThis.fetch = (async (url: string | URL | Request, _init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/api/providers/status')) {
      return new Response(JSON.stringify(RESTRICTED_OPENROUTER_STATUS), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (u.includes('/api/providers/openrouter/models')) {
      return new Response(
        JSON.stringify({ providerId: 'openrouter', fetchedAt: '2026-11-27T00:00:00Z', models: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (u.includes('/api/agent/test')) {
      agentTestCalls += 1;
      return new Response(
        JSON.stringify({
          agentId: 'scriptwriter',
          output: FIXTURES.scriptwriter,
          model: 'meta-llama/llama-3.3-70b:free',
          providerId: 'openrouter',
          isMock: false,
          latencyMs: 5,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;

  const mixedConfigs = createDefaultModelConfigs('openrouter').map((cfg) => {
    if (cfg.agentId === 'researcher') {
      return { ...cfg, providerId: 'openrouter' as const, model: 'anthropic/claude-4-opus', fallbackModels: [] };
    }
    return { ...cfg, providerId: 'openrouter' as const, model: 'meta-llama/llama-3.3-70b:free', fallbackModels: [] };
  });

  const harness = renderInDom(
    React.createElement(
      StoreProvider,
      null,
      React.createElement(PipelineProvider, null, React.createElement(ModelSettings))
    ),
    {
      [STORAGE_KEY]: JSON.stringify({ modelConfigs: mixedConfigs }),
    }
  );

  try {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    const researcherCard = findCardSectionByTitle(harness.rootEl, 'Periset');
    const researcherAlerts = Array.from(researcherCard.querySelectorAll('[role="alert"]')).map(
      (el) => el.textContent ?? ''
    );
    const rejectionAlert = researcherAlerts.find((t) =>
      t.includes('Model ini akan ditolak server pada konfigurasi sekarang')
    );
    assert.ok(rejectionAlert, 'Kartu agent Periset bermodel ditolak harus menampilkan peringatan server');
    assert.ok(rejectionAlert.includes('meta-llama/llama-3.3-70b:free'));

    // Kartu Periset (disallowed) -> diblokir tanpa fetch('/api/agent/test') dan menampilkan pesan error blokir
    await act(async () => {
      findButton(researcherCard, 'Tes Agent Ini').click();
      await new Promise((r) => setTimeout(r, 15));
    });
    assert.equal(agentTestCalls, 0, 'Model ditolak tidak boleh mengirim /api/agent/test');
    const blockedText = Array.from(researcherCard.querySelectorAll('[role="alert"]'))
      .map((el) => el.textContent ?? '')
      .join(' ');
    assert.ok(blockedText.includes('anthropic/claude-4-opus'));

    // Kontrol negatif: kartu Penulis Naskah (allowed) -> memanggil /api/agent/test
    const scriptwriterCard = findCardSectionByTitle(harness.rootEl, 'Penulis Naskah');
    await act(async () => {
      findButton(scriptwriterCard, 'Tes Agent Ini').click();
      await new Promise((r) => setTimeout(r, 15));
    });
    assert.equal(agentTestCalls, 1, 'Model diizinkan harus meneruskan /api/agent/test');
  } finally {
    harness.cleanup();
    globalThis.fetch = prevFetch;
  }
});

test('V-01 DOM (Pre-run Guard): Ideas dan VideoStudio memblokir /api/agent/run saat model ditolak policy (dan lanjut saat diizinkan)', async () => {
  const prevFetch = globalThis.fetch;
  let runCalls = 0;

  globalThis.fetch = (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/api/providers/status')) {
      return new Response(JSON.stringify(RESTRICTED_OPENROUTER_STATUS), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (u.includes('/api/agent/run')) {
      runCalls += 1;
      return new Response(
        JSON.stringify({
          agentId: 'researcher',
          output: FIXTURES.researcher,
          model: 'meta-llama/llama-3.3-70b:free',
          providerId: 'openrouter',
          isMock: false,
          latencyMs: 5,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;

  const blockedConfigs = createDefaultModelConfigs('openrouter').map((cfg) => ({
    ...cfg,
    providerId: 'openrouter' as const,
    model: 'anthropic/claude-4-opus',
    fallbackModels: [],
  }));

  // 1. Blokir pada Ideas
  const blockedIdeas = renderInDom(
    React.createElement(
      StoreProvider,
      null,
      React.createElement(AgentTaskProvider, null, React.createElement(Ideas))
    ),
    { [STORAGE_KEY]: JSON.stringify({ modelConfigs: blockedConfigs }) }
  );
  try {
    await act(async () => {
      findButton(blockedIdeas.rootEl, 'Hasilkan Ide & Kalender').click();
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.equal(runCalls, 0);
    assert.ok(blockedIdeas.rootEl.querySelector('[role="alert"]')?.textContent?.includes('ditolak server'));
  } finally {
    blockedIdeas.cleanup();
  }

  // 2. Blokir pada VideoStudio
  const blockedStudio = renderInDom(
    React.createElement(
      StoreProvider,
      null,
      React.createElement(
        AgentTaskProvider,
        null,
        React.createElement(PipelineProvider, null, React.createElement(VideoStudio))
      )
    ),
    { [STORAGE_KEY]: JSON.stringify({ modelConfigs: blockedConfigs }) }
  );
  try {
    const topicInput = blockedStudio.rootEl.querySelector('#studio-topic') as HTMLTextAreaElement;
    act(() => {
      setReactInputValue(topicInput, 'Topik Tes Guard');
    });
    await act(async () => {
      findButton(blockedStudio.rootEl, 'Mulai Buat Paket Video').click();
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.equal(runCalls, 0);
    const studioAlertText = blockedStudio.rootEl.querySelector('[role="alert"]')?.textContent ?? '';
    assert.ok(studioAlertText.includes('ditolak server'));
  } finally {
    blockedStudio.cleanup();
  }

  // 3. Kontrol negatif: Ideas dengan model diizinkan -> lanjut ke /api/agent/run
  const allowedConfigs = createDefaultModelConfigs('openrouter').map((cfg) => ({
    ...cfg,
    providerId: 'openrouter' as const,
    model: 'meta-llama/llama-3.3-70b:free',
    fallbackModels: [],
  }));
  const allowedIdeas = renderInDom(
    React.createElement(
      StoreProvider,
      null,
      React.createElement(AgentTaskProvider, null, React.createElement(Ideas))
    ),
    { [STORAGE_KEY]: JSON.stringify({ modelConfigs: allowedConfigs }) }
  );
  try {
    await act(async () => {
      findButton(allowedIdeas.rootEl, 'Hasilkan Ide & Kalender').click();
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.equal(runCalls, 1);
  } finally {
    allowedIdeas.cleanup();
    globalThis.fetch = prevFetch;
  }
});

test('V-02 DOM (AutoConfigModal): menampilkan disclaimer non-benchmark, konteks tidak diverifikasi untuk Gemini, dan ukuran konteks terverifikasi untuk katalog live', () => {
  const plan = buildAutoConfigPlan({
    tier: 'max',
    currentConfigs: createDefaultModelConfigs('mock'),
    providers: [
      {
        id: 'gemini',
        name: 'Google Gemini',
        keyDetected: true,
        available: true,
        tested: true,
        statusNote: 'ok',
        capabilities: { jsonSchema: true, jsonObject: true, search: true, video: true, image: true },
      },
      {
        id: 'openrouter',
        name: 'OpenRouter',
        keyDetected: true,
        available: true,
        tested: true,
        statusNote: 'ok',
        capabilities: { jsonSchema: true, jsonObject: true, search: true, video: false, image: true },
      },
    ],
    catalogs: {
      openrouter: {
        providerId: 'openrouter',
        fetchedAt: '2026-11-27T00:00:00Z',
        models: [
          {
            id: 'anthropic/claude-4-opus',
            name: 'Claude 4 Opus',
            isFree: false,
            contextLength: 200_000,
            inputModalities: ['text', 'image'],
            supportsStructuredOutput: true,
            promptPricePerMillion: 15,
          },
        ],
      },
    },
  });

  // Pastikan style_analyst memilih Gemini default
  assert.equal(
    plan.items.find((i) => i.agentId === 'style_analyst')?.nextConfig.model,
    DEFAULT_GEMINI_MODEL
  );

  const harness = renderInDom(
    React.createElement(AutoConfigModal, {
      plan,
      onClose: () => {},
      onApply: () => {},
    })
  );

  try {
    const dialog = harness.dom.window.document.querySelector('[role="dialog"]');
    assert.ok(dialog);
    const dialogText = dialog.textContent ?? '';
    assert.ok(
      dialogText.includes(
        'Peringkat kemampuan diperkirakan dari nama model dan harga katalog; bukan hasil benchmark.'
      )
    );
    assert.ok(dialogText.includes('konteks tidak diverifikasi'));
    assert.equal(dialogText.includes('1M ctx'), false, 'Gemini default tidak boleh mengklaim 1M ctx');
    assert.ok(dialogText.includes('200K ctx'), 'Katalog terverifikasi tetap menampilkan 200K ctx');
  } finally {
    harness.cleanup();
  }
});

test('V-03 DOM: navigasi halaman saat riset berjalan TIDAK meng-abort request, mengunci duplikat, menampilkan banner AppShell, & tetap menyimpan ke Store', async () => {
  const prevFetch = globalThis.fetch;
  let capturedSignal: AbortSignal | undefined;
  let runCallCount = 0;
  let resolveRun!: (res: Response) => void;

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/api/providers/status')) {
      return new Response(
        JSON.stringify({
          providers: [
            {
              id: 'mock',
              name: 'Mock',
              keyDetected: true,
              available: true,
              tested: true,
              statusNote: 'ok',
              capabilities: { jsonSchema: true, jsonObject: true, search: false, video: false, image: false },
              modelPolicy: { restricted: false, explicit: false, allowlist: [], allowFreeModels: true },
            },
          ],
          dailyCallsUsed: 0,
          dailyCallCap: 300,
          nousOAuthEnabled: false,
        }),
        { status: 200 }
      );
    }
    if (u.includes('/api/agent/run')) {
      runCallCount += 1;
      capturedSignal = init?.signal ?? undefined;
      return new Promise<Response>((resolve, reject) => {
        resolveRun = resolve;
        const sig = init?.signal;
        if (sig) {
          if (sig.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          sig.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true }
          );
        }
      });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  const NavTestApp: React.FC = () => {
    const { state } = useStore();
    return React.createElement(
      AppShell,
      null,
      state.currentScreen === 'ideas'
        ? React.createElement(Ideas)
        : state.currentScreen === 'analytics'
        ? React.createElement(Analytics)
        : state.currentScreen === 'style'
        ? React.createElement(StyleReferenceAnalyzerForm, { initialType: 'description' })
        : React.createElement(SetupChannel)
    );
  };

  const harness = renderInDom(
    React.createElement(
      StoreProvider,
      null,
      React.createElement(
        AgentTaskProvider,
        null,
        React.createElement(PipelineProvider, null, React.createElement(NavTestApp))
      )
    ),
    {
      [STORAGE_KEY]: JSON.stringify({
        profile: SAMPLE_PROFILE_FOR_TEST,
        profileConfigured: true,
        modelConfigs: createDefaultModelConfigs('mock'),
      }),
    }
  );

  try {
    // Pindah ke halaman Ide & Kalender lalu mulai Riset Ide
    act(() => {
      findButton(harness.rootEl, 'Ide & Kalender').click();
    });
    await act(async () => {
      findButton(harness.rootEl, 'Hasilkan Ide & Kalender').click();
      await new Promise((r) => setTimeout(r, 15));
    });

    assert.equal(runCallCount, 1);
    assert.ok(capturedSignal);
    assert.equal(capturedSignal.aborted, false);
    assert.equal(findButton(harness.rootEl, 'Sedang Meriset Ide').disabled, true);
    assert.ok(harness.rootEl.textContent?.includes('Sedang berjalan: Riset Ide'));

    // Pindah ke Setup Channel (meng-unmount Ideas!)
    act(() => {
      findButton(harness.rootEl, 'Setup Channel').click();
    });

    // Request TIDAK boleh dibatalkan saat Ideas di-unmount!
    assert.equal(capturedSignal.aborted, false, 'Unmount Ideas tidak boleh membatalkan request agent');
    assert.ok(harness.rootEl.textContent?.includes('Sedang berjalan: Riset Ide'));

    // Selesaikan respons fetch saat user berada di halaman lain (Setup Channel)
    await act(async () => {
      resolveRun(
        new Response(
          JSON.stringify({
            agentId: 'researcher',
            output: FIXTURES.researcher,
            model: 'mock-sim-v1',
            providerId: 'mock',
            isMock: true,
            latencyMs: 8,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
      await new Promise((r) => setTimeout(r, 20));
    });

    assert.equal(harness.rootEl.textContent?.includes('Sedang berjalan: Riset Ide'), false);

    // Kembali ke Ide & Kalender -> hasil sudah otomatis masuk ke Store!
    act(() => {
      findButton(harness.rootEl, 'Ide & Kalender').click();
    });
    assert.ok(harness.rootEl.textContent?.includes('Hasil Riset Terakhir'));

    // Uji pembatalan global dari AppShell ketika task Analytics berjalan di latar belakang
    act(() => {
      findButton(harness.rootEl, 'Analitik').click();
    });
    const metricsBox = harness.rootEl.querySelector('#metrics-text') as HTMLTextAreaElement;
    act(() => {
      setReactInputValue(metricsBox, 'Judul,Views\nVideo 1,1000');
    });
    await act(async () => {
      findButton(harness.rootEl, 'Analisis Performa').click();
      await new Promise((r) => setTimeout(r, 15));
    });
    assert.equal(runCallCount, 2);
    assert.equal(capturedSignal?.aborted, false);

    act(() => {
      findButton(harness.rootEl, 'Setup Channel').click();
    });
    assert.ok(harness.rootEl.textContent?.includes('Sedang berjalan: Analitik Performa'));

    // Klik Batalkan di banner global AppShell
    await act(async () => {
      findButton(harness.rootEl, 'Batalkan').click();
      await new Promise((r) => setTimeout(r, 15));
    });
    assert.equal(capturedSignal?.aborted, true, 'Tombol Batalkan di AppShell harus membatalkan task');
    assert.equal(harness.rootEl.textContent?.includes('Sedang berjalan: Analitik Performa'), false);
  } finally {
    harness.cleanup();
    globalThis.fetch = prevFetch;
  }
});

test('V-03 DOM (StyleReferenceAnalyzerForm): analyzeStyle bertahan melewati unmount sementara batalkan eksplisit meng-abort', async () => {
  const prevFetch = globalThis.fetch;
  let capturedSignal: AbortSignal | undefined;
  let resolveAnalyze!: (res: Response) => void;

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/api/providers/status')) {
      return new Response(
        JSON.stringify({
          providers: [
            {
              id: 'mock',
              name: 'Mock',
              keyDetected: true,
              available: true,
              tested: true,
              statusNote: 'ok',
              capabilities: { jsonSchema: true, jsonObject: true, search: false, video: false, image: false },
              modelPolicy: { restricted: false, explicit: false, allowlist: [], allowFreeModels: true },
            },
          ],
          dailyCallsUsed: 0,
          dailyCallCap: 300,
          nousOAuthEnabled: false,
        }),
        { status: 200 }
      );
    }
    if (u.includes('/api/style/analyze')) {
      capturedSignal = init?.signal ?? undefined;
      return new Promise<Response>((resolve, reject) => {
        resolveAnalyze = resolve;
        const sig = init?.signal;
        if (sig) {
          if (sig.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          sig.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true }
          );
        }
      });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  let savedProfileCount = 0;
  const StyleHost: React.FC = () => {
    const { state, dispatch } = useStore();
    savedProfileCount = state.styleProfiles.length;
    return React.createElement(
      AppShell,
      null,
      state.currentScreen === 'style'
        ? React.createElement(StyleReferenceAnalyzerForm, { initialType: 'description' })
        : React.createElement(SetupChannel)
    );
  };

  const harness = renderInDom(
    React.createElement(
      StoreProvider,
      null,
      React.createElement(
        AgentTaskProvider,
        null,
        React.createElement(PipelineProvider, null, React.createElement(StyleHost))
      )
    ),
    {
      [STORAGE_KEY]: JSON.stringify({
        currentScreen: 'style',
        modelConfigs: createDefaultModelConfigs('mock'),
      }),
    }
  );

  try {
    act(() => {
      findButton(harness.rootEl, 'Referensi Gaya').click();
    });
    const descBox = harness.rootEl.querySelector('textarea') as HTMLTextAreaElement;
    act(() => {
      setReactInputValue(
        descBox,
        'Gaya visual edukasi cepat dengan teks putih tebal di tengah dan B-roll biru gelap.'
      );
    });

    await act(async () => {
      findButton(harness.rootEl, 'Analisis & Simpan Profil Gaya').click();
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.ok(capturedSignal);
    assert.equal(capturedSignal.aborted, false);
    assert.ok(harness.rootEl.textContent?.includes('Sedang berjalan: Analisis Referensi Gaya'));

    // Unmount form dengan berpindah tab ke Setup Channel
    act(() => {
      findButton(harness.rootEl, 'Setup Channel').click();
    });
    assert.equal(capturedSignal.aborted, false, 'Unmount form tidak boleh membatalkan analyzeStyle server');

    // Selesaikan analyzeStyle -> Store langsung menyimpan profil gaya
    const profilePayload = FIXTURES.styleAnalyst as {
      name: string;
      attributes: Record<string, unknown>;
    };
    await act(async () => {
      resolveAnalyze(
        new Response(
          JSON.stringify({
            profile: {
              id: 'sp_test_v03',
              name: profilePayload.name,
              createdAt: '2026-11-27T00:00:00Z',
              sourceSummary: 'Deskripsi test',
              referenceIds: ['ref_1'],
              attributes: profilePayload.attributes,
            },
            result: {
              agentId: 'style_analyst',
              output: FIXTURES.styleAnalyst,
              model: 'mock-sim-v1',
              providerId: 'mock',
              isMock: true,
              latencyMs: 5,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.equal(savedProfileCount, 1);
  } finally {
    harness.cleanup();
    globalThis.fetch = prevFetch;
  }
});
