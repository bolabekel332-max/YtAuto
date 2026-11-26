import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server';
import { SAMPLE_PROFILE_FOR_TEST } from '../shared/agentInputs';
import { AUTO_FREE_FALLBACK_MODELS } from '../shared/constants';
import { DEFAULT_KNOWLEDGE } from '../src/knowledge/blocks';
import { DEFAULT_MODEL_CONFIGS } from '../src/state/defaults';
import { runAgent } from './agentRunner';
import { resetAuthStateForTests } from './auth';
import { getEffectiveModelAllowlist } from './config';
import { callApinexChat } from './providers/apinex';
import { FIXTURES } from './providers/mockFixtures';
import { withRetryAndFallback } from './providers/retry';
import {
  ProviderCallError,
  sanitizeErrorMessage,
  type LLMProvider,
  type LLMRequest,
} from './providers/types';
import { AppApiError, validateConfig } from './validation';

function makeDummyProvider(
  id: LLMProvider['id'],
  overrides: Partial<LLMProvider> = {}
): LLMProvider {
  return {
    id,
    name: id,
    capabilities: {
      jsonSchema: true,
      jsonObject: true,
      search: true,
      video: id === 'gemini',
      image: true,
    },
    isAvailable: () => true,
    isTested: () => true,
    statusNote: () => 'ok',
    generate: async () => ({ json: {} }),
    testConnection: async () => ({ latencyMs: 1, message: 'ok' }),
    ...overrides,
  };
}

test('N3-01a: twoStep repair pass mempertahankan output sebelumnya + WEB_SEARCH_NOTES dan mempertahankan sumber', async () => {
  resetAuthStateForTests();
  const capturedCalls: LLMRequest[] = [];

  const fakeTwoStepProvider = makeDummyProvider('openrouter', {
    async generate(req) {
      capturedCalls.push(req);
      if (capturedCalls.length === 1) {
        // Langkah 1 two_step (search)
        return {
          text: 'Fakta terverifikasi: Jam atom optik stronsium memiliki akurasi tinggi.',
          sources: [{ title: 'Riset Jam Atom', url: 'https://example.com/jam-atom' }],
          tokens: 30,
        };
      }
      if (capturedCalls.length === 2) {
        // Langkah 2 two_step menghasilkan JSON melanggar skema agar memicu repair pass
        return {
          text: '{"brokenField": "skema salah"}',
          tokens: 20,
        };
      }
      // Repair pass menerima previous assistant output + WEB_SEARCH_NOTES
      return {
        json: FIXTURES.researcher,
        tokens: 40,
      };
    },
  });

  const res = await runAgent(
    {
      agentId: 'researcher',
      mode: 'default',
      input: {
        targetPlatform: 'youtube_shorts',
        topic: 'Sejarah jam atom optik',
        profile: SAMPLE_PROFILE_FOR_TEST,
      },
      profile: SAMPLE_PROFILE_FOR_TEST,
      knowledge: DEFAULT_KNOWLEDGE,
      config: {
        ...DEFAULT_MODEL_CONFIGS.find((c) => c.agentId === 'researcher')!,
        providerId: 'openrouter',
        model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        searchMode: 'two_step',
        useSearch: true,
      },
    },
    { providerOverride: fakeTwoStepProvider }
  );

  assert.equal(capturedCalls.length, 3, 'Harus melalui step1, step2 (invalid), dan repair pass');
  const repairReq = capturedCalls[2];
  assert.ok(
    repairReq.messages.some(
      (m) => m.role === 'assistant' && m.content.includes('brokenField')
    ),
    'Repair pass harus menyertakan output asisten sebelumnya yang gagal validasi'
  );
  const repairUserMsg = repairReq.messages[repairReq.messages.length - 1];
  assert.equal(repairUserMsg.role, 'user');
  assert.ok(repairUserMsg.content.includes('WEB_SEARCH_NOTES'));
  assert.ok(repairUserMsg.content.includes('Jam atom optik stronsium'));
  assert.ok(repairUserMsg.content.includes('VALIDATION_ERROR_DETAIL'));

  assert.equal(res.repairedWithoutGrounding, undefined);
  assert.equal(res.groundedSourceCount, 1);
  assert.equal(res.sources?.[0]?.url, 'https://example.com/jam-atom');
  resetAuthStateForTests();
});

test('N3-01b: APInex single-step menyimpan searchNotes sehingga repair pass mendapat catatan pencarian', async () => {
  const prevKey = process.env.APINEX_API_KEY;
  process.env.APINEX_API_KEY = 'sk-apx-n3-01-test';
  resetAuthStateForTests();
  try {
    let chatCallCount = 0;
    const repairBodies: Array<{ messages?: Array<{ role: string; content: string }> }> = [];

    const stubFetch: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/v1/tools/web/search')) {
        return new Response(
          JSON.stringify({
            results: {
              web: [
                {
                  title: 'Fakta APInex',
                  url: 'https://example.com/apinex-fact',
                  snippet: 'Data pencarian APInex untuk repair pass.',
                },
              ],
            },
          }),
          { status: 200 }
        );
      }
      chatCallCount += 1;
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        messages?: Array<{ role: string; content: string }>;
      };
      repairBodies.push(body);
      if (chatCallCount === 1) {
        return new Response(
          JSON.stringify({
            choices: [{ finish_reason: 'stop', message: { content: '{"bad":"schema"}' } }],
            usage: { total_tokens: 25 },
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(FIXTURES.researcher) } }],
          usage: { total_tokens: 35 },
        }),
        { status: 200 }
      );
    };

    const directApinexRes = await callApinexChat(
      {
        system: 'sys',
        messages: [{ role: 'user', content: 'topik: uji apinex' }],
        schemaId: 'researcher',
        jsonMode: 'prompt_only',
        temperature: null,
        maxTokens: 1024,
        useSearch: true,
        timeoutMs: 5000,
      },
      'free/gemini-4-hydrogen',
      stubFetch
    );
    assert.ok(directApinexRes.searchNotes?.includes('Data pencarian APInex'));

    // Jalankan penuh lewat runAgent dengan providerOverride memakai fetch stub
    chatCallCount = 0;
    repairBodies.length = 0;
    const apinexStubProvider = makeDummyProvider('apinex', {
      generate: (req, model) => callApinexChat(req, model, stubFetch),
    });

    const agentRes = await runAgent(
      {
        agentId: 'researcher',
        mode: 'default',
        input: {
          targetPlatform: 'youtube_shorts',
          topic: 'Fakta APInex',
          profile: SAMPLE_PROFILE_FOR_TEST,
        },
        profile: SAMPLE_PROFILE_FOR_TEST,
        knowledge: DEFAULT_KNOWLEDGE,
        config: {
          ...DEFAULT_MODEL_CONFIGS.find((c) => c.agentId === 'researcher')!,
          providerId: 'apinex',
          model: 'free/gemini-4-hydrogen',
          searchMode: 'single',
          useSearch: true,
        },
      },
      { providerOverride: apinexStubProvider }
    );

    assert.equal(repairBodies.length, 2);
    const secondPayloadText = (repairBodies[1].messages ?? [])
      .map((m) => m.content)
      .join('\n');
    assert.ok(secondPayloadText.includes('WEB_SEARCH_NOTES'));
    assert.ok(secondPayloadText.includes('Data pencarian APInex untuk repair pass.'));
    assert.equal(agentRes.repairedWithoutGrounding, undefined);
    assert.equal(agentRes.groundedSourceCount, 1);
  } finally {
    if (prevKey === undefined) delete process.env.APINEX_API_KEY;
    else process.env.APINEX_API_KEY = prevKey;
    resetAuthStateForTests();
  }
});

test('N3-01c: search aktif tanpa searchNotes yang memicu repair mengosongkan sources dan menandai repairedWithoutGrounding (beserta kontrol negatif)', async () => {
  resetAuthStateForTests();
  let calls = 0;
  const geminiNativeMissingNotesProvider = makeDummyProvider('gemini', {
    async generate() {
      calls += 1;
      if (calls === 1) {
        return {
          text: '{"invalid": true}',
          sources: [{ title: 'Sumber Pass 1', url: 'https://example.com/pass1' }],
          tokens: 15,
        };
      }
      return {
        json: FIXTURES.researcher,
        tokens: 20,
      };
    },
  });

  const repairedRes = await runAgent(
    {
      agentId: 'researcher',
      mode: 'default',
      input: {
        targetPlatform: 'youtube_shorts',
        topic: 'Topik uji tanpa notes',
        profile: SAMPLE_PROFILE_FOR_TEST,
      },
      profile: SAMPLE_PROFILE_FOR_TEST,
      knowledge: DEFAULT_KNOWLEDGE,
      config: {
        ...DEFAULT_MODEL_CONFIGS.find((c) => c.agentId === 'researcher')!,
        providerId: 'gemini',
        model: 'gemini-4-hydrogen',
        searchMode: 'single',
        useSearch: true,
      },
    },
    { providerOverride: geminiNativeMissingNotesProvider }
  );

  assert.equal(calls, 2);
  assert.equal(repairedRes.repairedWithoutGrounding, true);
  assert.equal(repairedRes.groundedSourceCount, 0);
  assert.equal(repairedRes.sources, undefined);

  // Kontrol negatif: jika pass 1 langsung valid tanpa repair, sources dan groundedSourceCount tetap dipertahankan
  const validPass1Provider = makeDummyProvider('gemini', {
    async generate() {
      return {
        json: FIXTURES.researcher,
        sources: [{ title: 'Sumber Sehat', url: 'https://example.com/healthy' }],
        tokens: 20,
      };
    },
  });
  const healthyRes = await runAgent(
    {
      agentId: 'researcher',
      mode: 'default',
      input: {
        targetPlatform: 'youtube_shorts',
        topic: 'Topik valid pass 1',
        profile: SAMPLE_PROFILE_FOR_TEST,
      },
      profile: SAMPLE_PROFILE_FOR_TEST,
      knowledge: DEFAULT_KNOWLEDGE,
      config: {
        ...DEFAULT_MODEL_CONFIGS.find((c) => c.agentId === 'researcher')!,
        providerId: 'gemini',
        model: 'gemini-4-hydrogen',
        searchMode: 'single',
        useSearch: true,
      },
    },
    { providerOverride: validPass1Provider }
  );

  assert.equal(healthyRes.repairedWithoutGrounding, undefined);
  assert.equal(healthyRes.groundedSourceCount, 1);
  assert.equal(healthyRes.sources?.[0]?.url, 'https://example.com/healthy');
  resetAuthStateForTests();
});

test('N3-05: allowlist model berlaku untuk seluruh provider live pada HOST non-loopback & env eksplisit, sementara loopback & mock terbuka', () => {
  const keys = [
    'HOST',
    'GEMINI_MODEL_ALLOWLIST',
    'OPENROUTER_MODEL_ALLOWLIST',
    'NOUS_MODEL_ALLOWLIST',
    'APINEX_MODEL_ALLOWLIST',
  ] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));

  try {
    // 1. Non-loopback + allowlist kosong -> hanya model default + auto-free fallback masing-masing provider
    process.env.HOST = '0.0.0.0';
    process.env.GEMINI_MODEL_ALLOWLIST = '';
    process.env.OPENROUTER_MODEL_ALLOWLIST = '';
    process.env.NOUS_MODEL_ALLOWLIST = '';
    process.env.APINEX_MODEL_ALLOWLIST = '';

    for (const providerId of ['openrouter', 'nous', 'apinex'] as const) {
      const allowed = getEffectiveModelAllowlist(providerId);
      assert.ok(allowed.includes(AUTO_FREE_FALLBACK_MODELS[providerId]));
      const provider = makeDummyProvider(providerId);

      assert.doesNotThrow(() =>
        validateConfig(
          {
            ...DEFAULT_MODEL_CONFIGS[0],
            providerId,
            model: AUTO_FREE_FALLBACK_MODELS[providerId],
          },
          provider
        )
      );

      assert.throws(
        () =>
          validateConfig(
            {
              ...DEFAULT_MODEL_CONFIGS[0],
              providerId,
              model: 'arbitrary/paid-model-v9',
            },
            provider
          ),
        (err: unknown) => err instanceof AppApiError && err.code === 'invalid_request'
      );
    }

    // Provider mock dikecualikan meski HOST non-loopback
    assert.deepEqual(getEffectiveModelAllowlist('mock'), []);
    assert.doesNotThrow(() =>
      validateConfig(
        { ...DEFAULT_MODEL_CONFIGS[0], providerId: 'mock', model: 'mock-custom-test' },
        makeDummyProvider('mock')
      )
    );

    // 2. Kontrol negatif: loopback + allowlist kosong -> terbuka
    process.env.HOST = '127.0.0.1';
    assert.deepEqual(getEffectiveModelAllowlist('openrouter'), []);
    assert.doesNotThrow(() =>
      validateConfig(
        {
          ...DEFAULT_MODEL_CONFIGS[0],
          providerId: 'openrouter',
          model: 'arbitrary/paid-model-v9',
        },
        makeDummyProvider('openrouter')
      )
    );

    // 3. Env eksplisit OPENROUTER_MODEL_ALLOWLIST berlaku bahkan pada loopback
    process.env.OPENROUTER_MODEL_ALLOWLIST = 'vendor/allowed-a,vendor/allowed-b';
    assert.deepEqual(getEffectiveModelAllowlist('openrouter'), [
      'vendor/allowed-a',
      'vendor/allowed-b',
    ]);
    assert.doesNotThrow(() =>
      validateConfig(
        { ...DEFAULT_MODEL_CONFIGS[0], providerId: 'openrouter', model: 'vendor/allowed-b' },
        makeDummyProvider('openrouter')
      )
    );
    assert.throws(
      () =>
        validateConfig(
          { ...DEFAULT_MODEL_CONFIGS[0], providerId: 'openrouter', model: 'vendor/unlisted' },
          makeDummyProvider('openrouter')
        ),
      (err: unknown) => err instanceof AppApiError && err.code === 'invalid_request'
    );
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

test('N3-06: GET /api/providers/nous/models mengembalikan 404 saat HOST non-loopback & ENABLE_NOUS_OAUTH=false, serta lolos bila diizinkan', async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevHost = process.env.HOST;
  const prevEnableNous = process.env.ENABLE_NOUS_OAUTH;
  const prevWarn = console.warn;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-n3-06-'));
  fs.writeFileSync(path.join(tmpDir, 'index.html'), '<!doctype html><html><body>ok</body></html>');
  console.warn = () => {};

  const servers: Array<ReturnType<Awaited<ReturnType<typeof createApp>>['listen']>> = [];
  const startServer = async () => {
    const app = await createApp({ distDir: tmpDir });
    const s = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    servers.push(s);
    return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  };

  const prevFetch = globalThis.fetch;
  try {
    // 1. Non-loopback & ENABLE_NOUS_OAUTH=false -> Nous models 404, sementara OpenRouter catalog tidak terkena guard Nous
    process.env.NODE_ENV = 'production';
    process.env.HOST = '0.0.0.0';
    process.env.ENABLE_NOUS_OAUTH = 'false';
    resetAuthStateForTests();

    const baseBlocked = await startServer();
    const resNousBlocked = await fetch(`${baseBlocked}/api/providers/nous/models`);
    assert.equal(resNousBlocked.status, 404);
    const bodyBlocked = (await resNousBlocked.json()) as { error?: { code?: string } };
    assert.equal(bodyBlocked.error?.code, 'invalid_request');

    // Kontrol negatif 1: provider lain (/openrouter/models) tidak diblokir 404 oleh guard Nous
    globalThis.fetch = (async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('http://127.0.0.1:')) return prevFetch(input, init);
      return new Response(JSON.stringify({ data: [{ id: 'nvidia/nemotron-3-ultra-550b-a55b:free' }] }), {
        status: 200,
      });
    }) as typeof fetch;
    const resOrOk = await fetch(`${baseBlocked}/api/providers/openrouter/models`);
    assert.equal(resOrOk.status, 200);

    // Kontrol negatif 2: ENABLE_NOUS_OAUTH=true mengizinkan GET /api/providers/nous/models
    process.env.ENABLE_NOUS_OAUTH = 'true';
    resetAuthStateForTests();
    const baseAllowed = await startServer();
    globalThis.fetch = (async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('http://127.0.0.1:')) return prevFetch(input, init);
      return new Response(JSON.stringify({ data: [{ id: 'qwen/qwen4-max:free' }] }), {
        status: 200,
      });
    }) as typeof fetch;
    const resNousAllowed = await fetch(`${baseAllowed}/api/providers/nous/models`);
    assert.notEqual(resNousAllowed.status, 404);
  } finally {
    globalThis.fetch = prevFetch;
    console.warn = prevWarn;
    for (const s of servers) {
      s.closeAllConnections?.();
      await new Promise<void>((resolve) => s.close(() => resolve()));
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevHost === undefined) delete process.env.HOST;
    else process.env.HOST = prevHost;
    if (prevEnableNous === undefined) delete process.env.ENABLE_NOUS_OAUTH;
    else process.env.ENABLE_NOUS_OAUTH = prevEnableNous;
    resetAuthStateForTests();
  }
});

test('N3-07: output_truncated menyebut SERVER_MAX_TOKENS_CAP saat mencapai batas & x-app-access-code tidak disensor sementara secret nyata tetap disensor', async () => {
  const prevCap = process.env.SERVER_MAX_TOKENS_CAP;
  process.env.SERVER_MAX_TOKENS_CAP = '4096';

  const truncatedProvider = makeDummyProvider('gemini', {
    async generate() {
      return { text: '{"partial":', truncated: true };
    },
  });

  try {
    const baseReq: LLMRequest = {
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      schemaId: 'orchestrator',
      jsonMode: 'prompt_only',
      temperature: null,
      maxTokens: 4096,
      useSearch: false,
      timeoutMs: 5000,
    };

    // Pada batas cap -> pesan menyebut SERVER_MAX_TOKENS_CAP=4096
    await assert.rejects(
      () => withRetryAndFallback(truncatedProvider, baseReq, 'gemini-4-hydrogen', [], () => {}),
      (err: unknown) =>
        err instanceof ProviderCallError &&
        err.code === 'output_truncated' &&
        err.message.includes('SERVER_MAX_TOKENS_CAP=4096')
    );

    // Kontrol negatif: di bawah batas cap -> saran naikkan Max Tokens tanpa SERVER_MAX_TOKENS_CAP
    await assert.rejects(
      () =>
        withRetryAndFallback(
          truncatedProvider,
          { ...baseReq, maxTokens: 1024 },
          'gemini-4-hydrogen',
          [],
          () => {}
        ),
      (err: unknown) =>
        err instanceof ProviderCallError &&
        err.code === 'output_truncated' &&
        err.message.includes('Naikkan nilai Max Tokens') &&
        !err.message.includes('SERVER_MAX_TOKENS_CAP')
    );

    // sanitizeErrorMessage: header usang x-app-access-code tidak disensor, secret nyata tetap disensor
    const sanitized = sanitizeErrorMessage(
      'x-app-access-code: legacyValue99; Authorization: Bearer topSecretJwt; x-goog-api-key: gKey12345; sk-apx-secretTokenValue123456; ?token=querySec999'
    );
    assert.ok(sanitized.includes('legacyValue99'), 'x-app-access-code tidak lagi perlu disensor');
    assert.equal(sanitized.includes('topSecretJwt'), false);
    assert.equal(sanitized.includes('gKey12345'), false);
    assert.equal(sanitized.includes('sk-apx-secretTokenValue123456'), false);
    assert.equal(sanitized.includes('querySec999'), false);
  } finally {
    if (prevCap === undefined) delete process.env.SERVER_MAX_TOKENS_CAP;
    else process.env.SERVER_MAX_TOKENS_CAP = prevCap;
  }
});
