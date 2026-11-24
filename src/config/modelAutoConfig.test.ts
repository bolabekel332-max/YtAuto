import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProviderModelsResponse, ProviderStatus } from '../../shared/api';
import { DEFAULT_GEMINI_MODEL, DEFAULT_MODEL_CONFIGS } from '../state/defaults';
import { buildAutoConfigPlan } from './modelAutoConfig';

const MOCK_ONLY_PROVIDERS: ProviderStatus[] = [
  {
    id: 'mock',
    name: 'Mock',
    keyDetected: true,
    available: true,
    tested: true,
    statusNote: 'ok',
    capabilities: { jsonSchema: true, jsonObject: true, search: false, video: false, image: false },
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    keyDetected: false,
    available: false,
    tested: false,
    statusNote: 'missing',
    capabilities: { jsonSchema: true, jsonObject: true, search: true, video: true, image: true },
  },
];

const MIXED_PROVIDERS: ProviderStatus[] = [
  ...MOCK_ONLY_PROVIDERS.map((p) =>
    p.id === 'gemini' ? { ...p, keyDetected: true, available: true } : p
  ),
  {
    id: 'openrouter',
    name: 'OpenRouter',
    keyDetected: true,
    available: true,
    tested: false,
    statusNote: 'ok',
    capabilities: { jsonSchema: true, jsonObject: true, search: true, video: false, image: true },
  },
  {
    id: 'nous',
    name: 'Nous',
    keyDetected: true,
    available: true,
    tested: false,
    statusNote: 'ok',
    capabilities: { jsonSchema: true, jsonObject: true, search: false, video: false, image: true },
  },
];

const MIXED_CATALOGS: Partial<Record<'openrouter' | 'nous', ProviderModelsResponse>> = {
  openrouter: {
    providerId: 'openrouter',
    fetchedAt: '2026-11-24T00:00:00.000Z',
    models: [
      {
        id: 'anthropic/claude-4-opus',
        name: 'Claude 4 Opus',
        isFree: false,
        contextLength: 200_000,
        inputModalities: ['text', 'image'],
        supportsStructuredOutput: true,
        promptPricePerMillion: 15,
        completionPricePerMillion: 75,
      },
      {
        id: 'openai/gpt-4.1-mini',
        name: 'GPT-4.1 Mini',
        isFree: false,
        contextLength: 128_000,
        inputModalities: ['text', 'image'],
        supportsStructuredOutput: true,
        promptPricePerMillion: 0.4,
        completionPricePerMillion: 1.6,
      },
      {
        id: 'meta-llama/llama-3.3-70b:free',
        name: 'Llama 3.3 70B Free',
        isFree: true,
        contextLength: 128_000,
        inputModalities: ['text'],
        supportsStructuredOutput: true,
        promptPricePerMillion: 0,
        completionPricePerMillion: 0,
      },
      {
        id: 'qwen/qwen-2.5-vl-7b:free',
        name: 'Qwen 2.5 VL 7B Free',
        isFree: true,
        contextLength: 32_768,
        inputModalities: ['text', 'image'],
        supportsStructuredOutput: true,
        promptPricePerMillion: 0,
        completionPricePerMillion: 0,
      },
    ],
  },
  nous: {
    providerId: 'nous',
    fetchedAt: '2026-11-24T00:00:00.000Z',
    models: [
      {
        id: 'Hermes-4-405B',
        name: 'Hermes 4 405B',
        isFree: false,
        contextLength: 131_072,
        inputModalities: ['text'],
        supportsStructuredOutput: true,
        promptPricePerMillion: 2.5,
      },
      {
        id: 'Hermes-4-70B:free',
        name: 'Hermes 4 70B Free',
        isFree: true,
        contextLength: 65_536,
        inputModalities: ['text'],
        supportsStructuredOutput: true,
        promptPricePerMillion: 0,
      },
    ],
  },
};

test('buildAutoConfigPlan Pintar Maksimal mixes flagship paid/server models and separates Compliance vs Scriptwriter', () => {
  const plan = buildAutoConfigPlan({
    tier: 'max',
    currentConfigs: DEFAULT_MODEL_CONFIGS,
    providers: MIXED_PROVIDERS,
    catalogs: MIXED_CATALOGS,
  });

  const byId = new Map(plan.items.map((item) => [item.agentId, item]));
  const styleAnalyst = byId.get('style_analyst')!;
  const researcher = byId.get('researcher')!;
  const scriptwriter = byId.get('scriptwriter')!;
  const compliance = byId.get('compliance')!;

  // Style Analyst harus memilih Gemini (dukungan video/YouTube URL penuh)
  assert.equal(styleAnalyst.nextConfig.providerId, 'gemini');
  assert.equal(styleAnalyst.nextConfig.model, DEFAULT_GEMINI_MODEL);
  assert.equal(styleAnalyst.nextConfig.temperature, null);

  // Researcher wajib memakai model berkapabilitas Search
  assert.equal(researcher.nextConfig.useSearch, true);
  assert.ok(
    researcher.nextConfig.providerId === 'gemini' ||
      researcher.nextConfig.providerId === 'openrouter'
  );

  // Compliance harus berbeda dari Penulis Naskah saat tersedia kandidat berbeda
  assert.notEqual(
    `${compliance.nextConfig.providerId}:${compliance.nextConfig.model}`,
    `${scriptwriter.nextConfig.providerId}:${scriptwriter.nextConfig.model}`
  );
  // Penulis Naskah memakai flagship berbayar pada mode Pintar Maksimal
  assert.equal(scriptwriter.nextConfig.model, 'anthropic/claude-4-opus');
  assert.equal(scriptwriter.costClass, 'paid');
});

test('buildAutoConfigPlan Biasa Aja prefers free models while keeping multimodal & search constraints', () => {
  const plan = buildAutoConfigPlan({
    tier: 'lite',
    currentConfigs: DEFAULT_MODEL_CONFIGS,
    providers: MIXED_PROVIDERS,
    catalogs: MIXED_CATALOGS,
  });

  const byId = new Map(plan.items.map((item) => [item.agentId, item]));
  const packaging = byId.get('packaging')!;
  const orchestrator = byId.get('orchestrator')!;
  const styleAnalyst = byId.get('style_analyst')!;

  assert.equal(packaging.costClass, 'free');
  assert.equal(orchestrator.costClass, 'free');
  // Style Analyst tetap memilih multimodal (Gemini video) meski di mode hemat
  assert.equal(styleAnalyst.nextConfig.providerId, 'gemini');
});

test('buildAutoConfigPlan Menengah assigns mid/free for lightweight roles and strong models for core roles', () => {
  const plan = buildAutoConfigPlan({
    tier: 'balanced',
    currentConfigs: DEFAULT_MODEL_CONFIGS,
    providers: MIXED_PROVIDERS,
    catalogs: MIXED_CATALOGS,
  });

  const byId = new Map(plan.items.map((item) => [item.agentId, item]));
  const packaging = byId.get('packaging')!;
  const compliance = byId.get('compliance')!;
  const scriptwriter = byId.get('scriptwriter')!;

  assert.notEqual(packaging.nextConfig.model, 'anthropic/claude-4-opus');
  assert.notEqual(
    `${compliance.nextConfig.providerId}:${compliance.nextConfig.model}`,
    `${scriptwriter.nextConfig.providerId}:${scriptwriter.nextConfig.model}`
  );
});

test('buildAutoConfigPlan falls back gracefully to Mock with explicit warning when no live provider is available', () => {
  const plan = buildAutoConfigPlan({
    tier: 'max',
    currentConfigs: DEFAULT_MODEL_CONFIGS,
    providers: MOCK_ONLY_PROVIDERS,
    catalogs: {},
  });

  assert.equal(plan.items.length, 8);
  assert.ok(plan.items.every((item) => item.nextConfig.providerId === 'mock'));
  assert.ok(plan.warnings.some((w) => w.includes('Simulasi Mock')));
});

test('buildAutoConfigPlan includes APInex free and paid models when APInex is active', () => {
  const providersWithApinex: ProviderStatus[] = [
    ...MOCK_ONLY_PROVIDERS,
    {
      id: 'apinex',
      name: 'APInex',
      keyDetected: true,
      available: true,
      tested: false,
      statusNote: 'ok',
      capabilities: { jsonSchema: true, jsonObject: true, search: true, video: false, image: true },
    },
  ];

  const apinexOnlyCatalog = {
    apinex: {
      providerId: 'apinex' as const,
      fetchedAt: '2026-11-24T00:00:00.000Z',
      models: [
        {
          id: 'free/deepseek-v4.1-flash',
          name: 'Deepseek V4.1 Flash',
          isFree: true,
          contextLength: 1_000_000,
          inputModalities: ['text', 'image'],
          supportsStructuredOutput: true,
          promptPricePerMillion: 0,
          completionPricePerMillion: 0,
        },
        {
          id: 'free/qwen-3.8-max',
          name: 'Qwen 3.8 MAX',
          isFree: true,
          contextLength: 1_000_000,
          inputModalities: ['text', 'image'],
          supportsStructuredOutput: true,
          promptPricePerMillion: 0,
          completionPricePerMillion: 0,
        },
        {
          id: 'claude-fable-5.1',
          name: 'Claude Fable 5.1',
          isFree: false,
          contextLength: 1_000_000,
          inputModalities: ['text', 'image'],
          supportsStructuredOutput: true,
          promptPricePerMillion: 2,
          completionPricePerMillion: 2,
        },
        {
          id: 'gpt-6-astra',
          name: 'GPT 6 Astra',
          isFree: false,
          contextLength: 1_000_000,
          inputModalities: ['text', 'image'],
          supportsStructuredOutput: true,
          promptPricePerMillion: 0.5,
          completionPricePerMillion: 0.5,
        },
      ],
    },
  };

  const maxPlan = buildAutoConfigPlan({
    tier: 'max',
    currentConfigs: DEFAULT_MODEL_CONFIGS,
    providers: providersWithApinex,
    catalogs: apinexOnlyCatalog,
  });

  const maxById = new Map(maxPlan.items.map((i) => [i.agentId, i]));
  assert.equal(maxById.get('scriptwriter')?.nextConfig.providerId, 'apinex');
  assert.equal(maxById.get('scriptwriter')?.nextConfig.model, 'claude-fable-5.1');
  assert.equal(maxById.get('researcher')?.nextConfig.useSearch, true);
  assert.notEqual(
    maxById.get('compliance')?.nextConfig.model,
    maxById.get('scriptwriter')?.nextConfig.model
  );

  const litePlan = buildAutoConfigPlan({
    tier: 'lite',
    currentConfigs: DEFAULT_MODEL_CONFIGS,
    providers: providersWithApinex,
    catalogs: apinexOnlyCatalog,
  });
  assert.ok(litePlan.items.every((i) => i.nextConfig.providerId === 'apinex'));
  assert.ok(litePlan.items.every((i) => i.costClass === 'free'));
});
