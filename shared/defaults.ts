import type { AgentId, AgentModelConfig, ProviderId } from './schemas';

/**
 * ID model Gemini bawaan mengikuti scaffold AI Studio (gemini-4-hydrogen).
 * Tidak ada ID model yang ditulis di luar berkas konfigurasi ini (P-6).
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';
export const DEFAULT_MOCK_MODEL = 'mock-sim-v1';
export const DEFAULT_OPENROUTER_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';
export const DEFAULT_NOUS_MODEL = 'qwen/qwen4-max:free';
export const DEFAULT_APINEX_MODEL = 'free/gemini-4-hydrogen';
export const DEFAULT_CUSTOM_MODEL = 'default-model';

/**
 * Model gratis bawaan per provider untuk auto-fallback internal saat upstream HTTP 402.
 * Catatan: pemilihan internal ini berjalan saat retry/fallback 402 dan tidak divalidasi ulang
 * terhadap allowlist model eksplisit per provider; matikan via AUTO_FREE_FALLBACK=false bila perlu.
 */
export const AUTO_FREE_FALLBACK_MODELS = {
  apinex: 'free/gemini-4-hydrogen',
  openrouter: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  nous: 'qwen/qwen4-max:free',
} as const;

/**
 * Nilai temperature usulan dari BP 7.5 sebagai panduan referensi di Pengaturan Model.
 * Untuk Gemini nilai awal tetap null (menggunakan bawaan model).
 */
export const RECOMMENDED_AGENT_SETTINGS: Record<
  AgentId,
  { suggestedTemp: number; maxTokens: number; timeoutMs: number; useSearch: boolean }
> = {
  orchestrator: { suggestedTemp: 0.4, maxTokens: 4096, timeoutMs: 120000, useSearch: false },
  researcher: { suggestedTemp: 0.7, maxTokens: 6144, timeoutMs: 120000, useSearch: true },
  scriptwriter: { suggestedTemp: 0.8, maxTokens: 8192, timeoutMs: 120000, useSearch: false },
  visual: { suggestedTemp: 0.7, maxTokens: 8192, timeoutMs: 120000, useSearch: false },
  packaging: { suggestedTemp: 0.8, maxTokens: 3072, timeoutMs: 90000, useSearch: false },
  compliance: { suggestedTemp: 0.2, maxTokens: 6144, timeoutMs: 120000, useSearch: true },
  analyst: { suggestedTemp: 0.3, maxTokens: 4096, timeoutMs: 90000, useSearch: false },
  style_analyst: { suggestedTemp: 0.2, maxTokens: 4096, timeoutMs: 150000, useSearch: false },
};

export function createDefaultModelConfigs(
  providerId: ProviderId = 'gemini'
): AgentModelConfig[] {
  const model =
    providerId === 'mock'
      ? DEFAULT_MOCK_MODEL
      : providerId === 'openrouter'
      ? DEFAULT_OPENROUTER_MODEL
      : providerId === 'nous'
      ? DEFAULT_NOUS_MODEL
      : providerId === 'apinex'
      ? DEFAULT_APINEX_MODEL
      : providerId === 'custom'
      ? DEFAULT_CUSTOM_MODEL
      : DEFAULT_GEMINI_MODEL;

  return (Object.keys(RECOMMENDED_AGENT_SETTINGS) as AgentId[]).map((agentId) => {
    const rec = RECOMMENDED_AGENT_SETTINGS[agentId];
    return {
      agentId,
      providerId,
      model,
      fallbackModels: [],
      temperature: null,
      maxTokens: rec.maxTokens,
      timeoutMs: rec.timeoutMs,
      jsonMode: providerId === 'custom' ? 'json_object' : 'json_schema',
      useSearch: rec.useSearch,
      searchMode: 'two_step',
    };
  });
}

export const DEFAULT_MODEL_CONFIGS: AgentModelConfig[] = createDefaultModelConfigs('gemini');

export type ModelPresetKind = 'all_gemini' | 'all_mock' | 'mixed';

export const MODEL_PRESETS: Record<'all_gemini' | 'all_mock', () => AgentModelConfig[]> = {
  all_gemini: () => createDefaultModelConfigs('gemini'),
  all_mock: () => createDefaultModelConfigs('mock'),
};

export function detectModelPreset(configs: AgentModelConfig[]): ModelPresetKind {
  if (configs.every((c) => c.providerId === 'gemini')) return 'all_gemini';
  if (configs.every((c) => c.providerId === 'mock')) return 'all_mock';
  return 'mixed';
}

export function defaultModelForProvider(providerId: ProviderId): string {
  switch (providerId) {
    case 'gemini':
      return DEFAULT_GEMINI_MODEL;
    case 'mock':
      return DEFAULT_MOCK_MODEL;
    case 'openrouter':
      return DEFAULT_OPENROUTER_MODEL;
    case 'nous':
      return DEFAULT_NOUS_MODEL;
    case 'apinex':
      return DEFAULT_APINEX_MODEL;
    case 'custom':
      return DEFAULT_CUSTOM_MODEL;
  }
}
