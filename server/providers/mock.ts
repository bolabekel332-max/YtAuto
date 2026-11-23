import { FIXTURES } from './mockFixtures';
import { ProviderCallError, type LLMProvider, type LLMRequest, type LLMResponse } from './types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectSimulatedError(req: LLMRequest): string | null {
  const joined = req.messages.map((m) => m.content).join('\n');
  const match = joined.match(/\[MOCK_ERROR:(429|500|truncated|invalid_json|timeout)\]/i);
  return match ? match[1].toLowerCase() : null;
}

export const mockProvider: LLMProvider = {
  id: 'mock',
  name: 'Mock (Simulasi Lokal)',
  capabilities: {
    jsonSchema: true,
    jsonObject: true,
    search: false,
    video: false,
    image: false,
  },
  isAvailable: () => true,
  isTested: () => true,
  statusNote: () => 'Aktif tanpa biaya & tanpa kunci API. Hanya menghasilkan data simulasi.',

  async generate(req: LLMRequest, model: string): Promise<LLMResponse> {
    const start = Date.now();
    const latency = Math.min(180, Math.max(40, Math.floor(req.timeoutMs / 1000)));
    await sleep(latency);

    const simError = detectSimulatedError(req);
    if (simError === '429') {
      throw new ProviderCallError(
        'provider_error',
        429,
        `[SIMULASI MOCK] Simulasi HTTP 429 terlalu banyak permintaan pada model ${model}.`,
        true
      );
    }
    if (simError === '500') {
      throw new ProviderCallError(
        'provider_error',
        502,
        `[SIMULASI MOCK] Simulasi error server 5xx pada model ${model}.`,
        true
      );
    }
    if (simError === 'timeout') {
      throw new ProviderCallError(
        'timeout',
        504,
        `[SIMULASI MOCK] Simulasi batas waktu habis (${req.timeoutMs} ms).`,
        false
      );
    }
    if (simError === 'truncated') {
      return {
        text: '{"incomplete": true',
        truncated: true,
        tokens: req.maxTokens,
      };
    }
    if (simError === 'invalid_json') {
      return {
        json: { invalidField: 'tidak sesuai skema' },
        tokens: 120,
      };
    }

    const fixture = structuredClone(FIXTURES[req.schemaId]);
    const elapsed = Date.now() - start;

    return {
      json: fixture,
      sources: [],
      tokens: 320 + (elapsed % 80),
      truncated: false,
    };
  },

  async testConnection(model: string): Promise<{ latencyMs: number; message: string }> {
    const start = Date.now();
    await sleep(50);
    return {
      latencyMs: Date.now() - start,
      message: `[SIMULASI MOCK] Koneksi simulasi ke ${model} berhasil (bukan panggilan API nyata).`,
    };
  },
};
