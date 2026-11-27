import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES } from './providers/mockFixtures';
import { AUTO_FREE_FALLBACK_MODELS } from '../shared/constants';
import { evaluateModelPolicy } from '../shared/modelPolicy';
import type { AgentModelConfig, ProviderId } from '../shared/schemas';
import { clearCatalogFreeModelsForTests, recordCatalogFreeModels } from './config';
import { callNousChat } from './providers/nous';
import { callOpenRouterChat } from './providers/openrouter';
import { listStatus } from './providers/registry';
import { withRetryAndFallback } from './providers/retry';
import type { LLMProvider, LLMRequest } from './providers/types';
import { validateConfig } from './validation';

const SAMPLE_ENV_KEYS = [
  'HOST',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'NOUS_API_KEY',
  'APINEX_API_KEY',
  'GEMINI_MODEL_ALLOWLIST',
  'OPENROUTER_MODEL_ALLOWLIST',
  'NOUS_MODEL_ALLOWLIST',
  'APINEX_MODEL_ALLOWLIST',
  'AUTO_FREE_FALLBACK',
] as const;

async function withEnv(
  patch: Partial<Record<(typeof SAMPLE_ENV_KEYS)[number], string | undefined>>,
  fn: () => Promise<void> | void
) {
  const prev = new Map<string, string | undefined>();
  for (const key of SAMPLE_ENV_KEYS) {
    prev.set(key, process.env[key]);
  }
  try {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await fn();
  } finally {
    for (const key of SAMPLE_ENV_KEYS) {
      const orig = prev.get(key);
      if (orig === undefined) delete process.env[key];
      else process.env[key] = orig;
    }
  }
}

function makeFakeAvailableProvider(id: ProviderId): LLMProvider {
  return {
    id,
    name: id,
    capabilities: { jsonSchema: true, jsonObject: true, search: true, video: true, image: true },
    isAvailable: () => true,
    isTested: () => true,
    statusNote: () => 'ok',
    generate: async () => ({
      text: '{}',
      model: 'stub',
      latencyMs: 1,
      isMock: false,
    }),
    testConnection: async () => ({ ok: true, message: 'ok', latencyMs: 1 }),
  };
}

function makeConfig(providerId: ProviderId, model: string): AgentModelConfig {
  return {
    agentId: 'scriptwriter',
    providerId,
    model,
    fallbackModels: [],
    temperature: 0.7,
    maxTokens: 1024,
    timeoutMs: 30000,
    jsonMode: 'json_object',
    useSearch: false,
    searchMode: 'two_step',
  };
}

test('V-01 paritas server-klien: evaluateModelPolicy(status.modelPolicy) identik dengan validateConfig di >= 20 kombinasi', async () => {
  type Case = {
    label: string;
    env: Partial<Record<(typeof SAMPLE_ENV_KEYS)[number], string | undefined>>;
    providerId: ProviderId;
    model: string;
    catalogFree?: string[];
  };

  const cases: Case[] = [
    // Loopback (restricted: false) -> semua diizinkan
    { label: 'loopback gemini default', env: { HOST: '127.0.0.1' }, providerId: 'gemini', model: 'gemini-4-hydrogen' },
    { label: 'loopback gemini custom', env: { HOST: '127.0.0.1' }, providerId: 'gemini', model: 'gemini-2.5-pro' },
    { label: 'loopback openrouter paid', env: { HOST: '127.0.0.1' }, providerId: 'openrouter', model: 'anthropic/claude-4-opus' },
    { label: 'loopback nous paid', env: { HOST: '127.0.0.1' }, providerId: 'nous', model: 'Hermes-4-405B' },
    { label: 'loopback apinex paid', env: { HOST: 'localhost' }, providerId: 'apinex', model: 'claude-fable-5.1' },
    // Non-loopback default (restricted: true, explicit: false)
    { label: '0.0.0.0 gemini default', env: { HOST: '0.0.0.0' }, providerId: 'gemini', model: 'gemini-4-hydrogen' },
    { label: '0.0.0.0 gemini non-default blocked', env: { HOST: '0.0.0.0' }, providerId: 'gemini', model: 'gemini-2.5-pro' },
    { label: '0.0.0.0 openrouter :free allowed', env: { HOST: '0.0.0.0' }, providerId: 'openrouter', model: 'qwen/qwen-2.5-7b:free' },
    { label: '0.0.0.0 openrouter paid blocked', env: { HOST: '0.0.0.0' }, providerId: 'openrouter', model: 'anthropic/claude-4-opus' },
    { label: '0.0.0.0 openrouter catalog free allowed', env: { HOST: '0.0.0.0' }, providerId: 'openrouter', model: 'zero-cost-catalog-id', catalogFree: ['zero-cost-catalog-id'] },
    { label: '0.0.0.0 nous :free allowed', env: { HOST: '0.0.0.0' }, providerId: 'nous', model: 'Hermes-4-70B:free' },
    { label: '0.0.0.0 nous paid blocked', env: { HOST: '0.0.0.0' }, providerId: 'nous', model: 'Hermes-4-405B' },
    { label: '0.0.0.0 apinex free/* allowed', env: { HOST: '0.0.0.0' }, providerId: 'apinex', model: 'free/deepseek-v4.1-flash' },
    { label: '0.0.0.0 apinex paid blocked', env: { HOST: '0.0.0.0' }, providerId: 'apinex', model: 'claude-fable-5.1' },
    { label: '0.0.0.0 mock always allowed', env: { HOST: '0.0.0.0' }, providerId: 'mock', model: 'mock-sim-v1' },
    // Explicit allowlist overrides free patterns even on loopback or 0.0.0.0
    {
      label: 'explicit openrouter allowlist allows listed model',
      env: { HOST: '127.0.0.1', OPENROUTER_MODEL_ALLOWLIST: 'openai/gpt-4.1-mini' },
      providerId: 'openrouter',
      model: 'openai/gpt-4.1-mini',
    },
    {
      label: 'explicit openrouter allowlist blocks unlisted :free',
      env: { HOST: '127.0.0.1', OPENROUTER_MODEL_ALLOWLIST: 'openai/gpt-4.1-mini' },
      providerId: 'openrouter',
      model: 'meta-llama/llama-3.3-70b:free',
    },
    {
      label: 'explicit apinex allowlist blocks unlisted free/*',
      env: { HOST: '0.0.0.0', APINEX_MODEL_ALLOWLIST: 'free/gemini-4-hydrogen' },
      providerId: 'apinex',
      model: 'free/qwen-3.8-max',
    },
    {
      label: 'explicit gemini allowlist blocks unlisted',
      env: { HOST: '127.0.0.1', GEMINI_MODEL_ALLOWLIST: 'gemini-4-hydrogen,gemini-2.5-pro' },
      providerId: 'gemini',
      model: 'gemini-1.5-pro',
    },
    {
      label: 'explicit gemini allowlist allows second item',
      env: { HOST: '0.0.0.0', GEMINI_MODEL_ALLOWLIST: 'gemini-4-hydrogen,gemini-2.5-pro' },
      providerId: 'gemini',
      model: 'gemini-2.5-pro',
    },
  ];

  assert.ok(cases.length >= 20);

  let allowedCount = 0;
  let rejectedCount = 0;

  for (const c of cases) {
    await withEnv(
      {
        GEMINI_MODEL_ALLOWLIST: undefined,
        OPENROUTER_MODEL_ALLOWLIST: undefined,
        NOUS_MODEL_ALLOWLIST: undefined,
        APINEX_MODEL_ALLOWLIST: undefined,
        ...c.env,
      },
      () => {
        clearCatalogFreeModelsForTests();
        if (c.catalogFree) {
          recordCatalogFreeModels(c.providerId, c.catalogFree);
        }

        const providersList = listStatus();
        const providerStatus = providersList.find((p) => p.id === c.providerId);
        assert.ok(providerStatus?.modelPolicy, `modelPolicy harus ada untuk ${c.providerId}`);

        const clientEval = evaluateModelPolicy(
          providerStatus.modelPolicy,
          c.providerId,
          c.model,
          c.catalogFree
        );

        let serverAllowed = true;
        try {
          validateConfig(makeConfig(c.providerId, c.model), makeFakeAvailableProvider(c.providerId));
        } catch {
          serverAllowed = false;
        }

        assert.equal(
          clientEval.allowed,
          serverAllowed,
          `Ketidakcocokan paritas pada kasus "${c.label}": client=${clientEval.allowed}, server=${serverAllowed}`
        );

        if (serverAllowed) allowedCount += 1;
        else rejectedCount += 1;
      }
    );
  }

  clearCatalogFreeModelsForTests();
  assert.ok(allowedCount > 0 && rejectedCount > 0, 'Matriks harus menguji baik diizinkan maupun ditolak');
});

test('V-04: OpenRouter & Nous mempertahankan peran system/user/assistant/user dan menempatkan gambar hanya pada pesan user terakhir', async () => {
  await withEnv(
    { OPENROUTER_API_KEY: 'test-or-key', NOUS_API_KEY: 'test-nous-key' },
    async () => {
      const capturedBodies: Array<Record<string, unknown>> = [];
      const stubFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        capturedBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        return new Response(
          JSON.stringify({
            choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }],
            usage: { total_tokens: 15 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as typeof fetch;

      const multiTurnReq: LLMRequest = {
        system: 'Aturan sistem inti.',
        messages: [
          { role: 'user', content: 'Pertanyaan pertama' },
          { role: 'assistant', content: 'Jawaban asisten' },
          { role: 'user', content: 'Pertanyaan terakhir dengan gambar' },
        ],
        media: [{ type: 'image', mime: 'image/png', ref: 'AQID' }],
        jsonMode: 'json_object',
        maxTokens: 512,
        temperature: 0.3,
        timeoutMs: 10_000,
        useSearch: false,
        schemaId: 'researcher',
      };

      await callOpenRouterChat(multiTurnReq, 'openai/gpt-4.1-mini', stubFetch);
      await callNousChat(multiTurnReq, 'Hermes-4-70B:free', stubFetch);
      assert.equal(capturedBodies.length, 2);

      for (const body of capturedBodies) {
        const msgs = body.messages as Array<{ role: string; content: unknown }>;
        assert.deepEqual(
          msgs.map((m) => m.role),
          ['system', 'user', 'assistant', 'user']
        );
        assert.equal(msgs[0].content, 'Aturan sistem inti.');
        assert.equal(msgs[1].content, 'Pertanyaan pertama');
        assert.equal(msgs[2].content, 'Jawaban asisten');
        assert.ok(Array.isArray(msgs[3].content), 'Gambar harus masuk ke pesan user terakhir saja');
        const parts = msgs[3].content as Array<{ type?: string }>;
        assert.equal(parts.some((p) => p.type === 'image_url'), true);
      }

      // Kontrol negatif: tanpa media dan hanya 1 pesan user -> tidak ada bagian image_url dan panjang pesan === 2
      capturedBodies.length = 0;
      const plainReq: LLMRequest = {
        ...multiTurnReq,
        messages: [{ role: 'user', content: 'Satu pesan saja' }],
        media: undefined,
      };
      await callOpenRouterChat(plainReq, 'openai/gpt-4.1-mini', stubFetch);
      await callNousChat(plainReq, 'Hermes-4-70B:free', stubFetch);
      for (const body of capturedBodies) {
        const msgs = body.messages as Array<{ role: string; content: unknown }>;
        assert.deepEqual(
          msgs.map((m) => m.role),
          ['system', 'user']
        );
        assert.equal(msgs[1].content, 'Satu pesan saja');
      }
    }
  );
});

test('V-05: HTTP 402 pada OpenRouter & Nous memicu fallback gratis sekali (dan menghormati kontrol negatif 400/401/AUTO_FREE_FALLBACK=false/402 kedua)', async () => {
  const baseReq: LLMRequest = {
    system: 'sys',
    messages: [{ role: 'user', content: 'hi' }],
    jsonMode: 'json_object',
    maxTokens: 256,
    temperature: 0.2,
    timeoutMs: 5000,
    useSearch: false,
    schemaId: 'researcher',
  };

  for (const pid of ['openrouter', 'nous'] as const) {
    const fallbackModel = AUTO_FREE_FALLBACK_MODELS[pid];
    await withEnv(
      {
        OPENROUTER_API_KEY: 'test-or-key',
        NOUS_API_KEY: 'test-nous-key',
        AUTO_FREE_FALLBACK: 'true',
      },
      async () => {
        // 1. Sukses fallback 402 -> model gratis default (1x peralihan)
        const calledModels: string[] = [];
        const provider: LLMProvider = {
          id: pid,
          name: pid,
          capabilities: { jsonSchema: true, jsonObject: true, search: false, video: false, image: true },
          isAvailable: () => true,
          isTested: () => true,
          statusNote: () => 'ok',
          testConnection: async () => ({ ok: true, message: 'ok', latencyMs: 1 }),
          generate: async (req, model) => {
            calledModels.push(model);
            const stubFetch = (async () => {
              if (model === 'paid/model-x') {
                return new Response(JSON.stringify({ error: { message: 'Insufficient credits' } }), {
                  status: 402,
                });
              }
              return new Response(
                JSON.stringify({
                  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(FIXTURES.researcher) } }],
                  usage: { total_tokens: 10 },
                }),
                { status: 200 }
              );
            }) as typeof fetch;
            return pid === 'openrouter'
              ? callOpenRouterChat(req, model, stubFetch)
              : callNousChat(req, model, stubFetch);
          },
        };

        const okRes = await withRetryAndFallback(provider, baseReq, 'paid/model-x', [], () => {});
        assert.equal(okRes.modelUsed, fallbackModel);
        assert.deepEqual(calledModels, ['paid/model-x', fallbackModel]);

        // 2. Kontrol negatif: HTTP 402 kedua pada model fallback -> berhenti bersih (tidak loop)
        const loopModels: string[] = [];
        const double402Provider: LLMProvider = {
          ...provider,
          generate: async (req, model) => {
            loopModels.push(model);
            const stubFetch = (async () =>
              new Response(JSON.stringify({ error: { message: 'Still no credit' } }), {
                status: 402,
              })) as typeof fetch;
            return pid === 'openrouter'
              ? callOpenRouterChat(req, model, stubFetch)
              : callNousChat(req, model, stubFetch);
          },
        };
        await assert.rejects(
          () => withRetryAndFallback(double402Provider, baseReq, 'paid/model-x', [], () => {}),
          (err: unknown) => (err as { meta?: { errorKind?: string; upstreamStatus?: number } })?.meta?.errorKind === 'insufficient_balance'
        );
        assert.deepEqual(loopModels, ['paid/model-x', fallbackModel]);

        // 3. Kontrol negatif: HTTP 400 dan HTTP 401 tidak pernah memicu fallback gratis
        for (const errStatus of [400, 401] as const) {
          const non402Calls: string[] = [];
          const errProvider: LLMProvider = {
            ...provider,
            generate: async (req, model) => {
              non402Calls.push(model);
              const stubFetch = (async () =>
                new Response(JSON.stringify({ error: { message: 'bad' } }), {
                  status: errStatus,
                })) as typeof fetch;
              return pid === 'openrouter'
                ? callOpenRouterChat(req, model, stubFetch)
                : callNousChat(req, model, stubFetch);
            },
          };
          await assert.rejects(() =>
            withRetryAndFallback(errProvider, baseReq, 'paid/model-x', [], () => {})
          );
          assert.deepEqual(non402Calls, ['paid/model-x']);
        }
      }
    );

    // 4. Kontrol negatif: AUTO_FREE_FALLBACK=false -> 402 langsung berhenti tanpa mencoba model gratis
    await withEnv(
      {
        OPENROUTER_API_KEY: 'test-or-key',
        NOUS_API_KEY: 'test-nous-key',
        AUTO_FREE_FALLBACK: 'false',
      },
      async () => {
        const disabledCalls: string[] = [];
        const disabledProvider: LLMProvider = {
          id: pid,
          name: pid,
          capabilities: { jsonSchema: true, jsonObject: true, search: false, video: false, image: true },
          isAvailable: () => true,
          isTested: () => true,
          statusNote: () => 'ok',
          testConnection: async () => ({ ok: true, message: 'ok', latencyMs: 1 }),
          generate: async (req, model) => {
            disabledCalls.push(model);
            const stubFetch = (async () =>
              new Response(JSON.stringify({ error: { message: 'Insufficient balance' } }), {
                status: 402,
              })) as typeof fetch;
            return pid === 'openrouter'
              ? callOpenRouterChat(req, model, stubFetch)
              : callNousChat(req, model, stubFetch);
          },
        };
        await assert.rejects(
          () => withRetryAndFallback(disabledProvider, baseReq, 'paid/model-x', [], () => {}),
          (err: unknown) =>
            (err as { meta?: { errorKind?: string; upstreamStatus?: number } })?.meta?.errorKind ===
              'insufficient_balance' &&
            (err as { meta?: { upstreamStatus?: number } })?.meta?.upstreamStatus === 402
        );
        assert.deepEqual(disabledCalls, ['paid/model-x']);
      }
    );
  }
});

test('V-08: sumber kebenaran tunggal ID model default hanya dideklarasikan sekali di shared/defaults.ts', () => {
  const roots = ['shared', 'server', 'src'];
  const declarationMatches: string[] = [];

  const scanFile = (filePath: string) => {
    const content = fs.readFileSync(filePath, 'utf8');
    if (/(?:export\s+)?const\s+DEFAULT_GEMINI_MODEL\b/.test(content)) {
      declarationMatches.push(path.relative(process.cwd(), filePath).replace(/\\/g, '/'));
    }
  };

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        walk(full);
      } else if (
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.test.tsx')
      ) {
        scanFile(full);
      }
    }
  };

  for (const r of roots) walk(path.resolve(r));
  scanFile(path.resolve('server.ts'));

  assert.deepEqual(declarationMatches, ['shared/defaults.ts']);

  const constantsSrc = fs.readFileSync(path.resolve('shared/constants.ts'), 'utf8');
  assert.ok(
    constantsSrc.includes("from './defaults'"),
    'shared/constants.ts harus me-re-export dari ./defaults tanpa duplikasi'
  );
  assert.equal(/(?:export\s+)?const\s+AUTO_FREE_FALLBACK_MODELS\b/.test(constantsSrc), false);
});
