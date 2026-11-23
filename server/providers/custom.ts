import { CUSTOM_PROVIDER_BASE_URL, getEnv } from '../config';
import { ProviderCallError, type LLMProvider, type LLMRequest, type LLMResponse } from './types';

interface OpenAICompatibleResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
}

export const customProvider: LLMProvider = {
  id: 'custom',
  name: 'Provider Kustom (OpenAI-Compatible)',
  capabilities: {
    jsonSchema: false,
    jsonObject: true,
    search: false,
    video: false,
    image: false,
  },
  isAvailable: () => {
    const hasKey = getEnv().customApiKey.length > 0;
    const hasAllowlistedUrl = CUSTOM_PROVIDER_BASE_URL.length > 0;
    return hasKey && hasAllowlistedUrl;
  },
  isTested: () => false,
  statusNote: () => {
    if (!CUSTOM_PROVIDER_BASE_URL) {
      return 'Nonaktif: BASE_URL_ALLOWLIST di server/config.ts belum memiliki URL tepercaya.';
    }
    if (!getEnv().customApiKey) {
      return 'Nonaktif: CUSTOM_API_KEY belum tersedia di environment server.';
    }
    return 'Aktif melalui allowlist server, belum teruji.';
  },

  async generate(req: LLMRequest, model: string): Promise<LLMResponse> {
    if (!CUSTOM_PROVIDER_BASE_URL) {
      throw new ProviderCallError(
        'capability_missing',
        400,
        'Provider Kustom tidak tersedia karena belum ada base URL tepercaya pada BASE_URL_ALLOWLIST di server/config.ts.',
        false
      );
    }

    const apiKey = getEnv().customApiKey;
    if (!apiKey) {
      throw new ProviderCallError(
        'capability_missing',
        400,
        'CUSTOM_API_KEY belum terkonfigurasi di server.',
        false
      );
    }

    if (req.media && req.media.length > 0) {
      throw new ProviderCallError(
        'capability_missing',
        400,
        'Provider Kustom tidak mendukung input video atau gambar.',
        false
      );
    }

    const endpoint = `${CUSTOM_PROVIDER_BASE_URL.replace(/\/+$/, '')}/chat/completions`;
    const payload: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: req.system },
        ...req.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      max_tokens: req.maxTokens,
    };

    if (req.temperature !== null) {
      payload.temperature = req.temperature;
    }

    if (req.jsonMode === 'json_object') {
      payload.response_format = { type: 'json_object' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (res.status === 429) {
        throw new ProviderCallError(
          'provider_error',
          429,
          'Provider kustom mengembalikan HTTP 429.',
          true
        );
      }

      if (res.status >= 500) {
        throw new ProviderCallError(
          'provider_error',
          502,
          `Provider kustom mengembalikan error server HTTP ${res.status}.`,
          true
        );
      }

      const data = (await res.json()) as OpenAICompatibleResponse;
      if (!res.ok || data.error) {
        throw new ProviderCallError(
          'provider_error',
          502,
          `Provider kustom error (${res.status}): ${data.error?.message || 'Permintaan gagal.'}`,
          false
        );
      }

      const choice = data.choices?.[0];
      return {
        text: choice?.message?.content ?? '',
        tokens: data.usage?.total_tokens,
        truncated: choice?.finish_reason === 'length',
      };
    } catch (err) {
      if (err instanceof ProviderCallError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ProviderCallError(
          'timeout',
          504,
          'Permintaan ke provider kustom melewati batas waktu (timeout).',
          false
        );
      }
      throw new ProviderCallError(
        'provider_error',
        502,
        `Gagal menghubungi provider kustom: ${err instanceof Error ? err.message : String(err)}`,
        false
      );
    } finally {
      clearTimeout(timer);
    }
  },

  async testConnection(model: string): Promise<{ latencyMs: number; message: string }> {
    const start = Date.now();
    const res = await this.generate(
      {
        system: 'Balas singkat.',
        messages: [{ role: 'user', content: 'Balas OK' }],
        schemaId: 'orchestrator',
        jsonMode: 'prompt_only',
        temperature: null,
        maxTokens: 16,
        useSearch: false,
        timeoutMs: 20_000,
      },
      model
    );
    return {
      latencyMs: Date.now() - start,
      message: `Koneksi provider kustom (${model}) merespons: "${(res.text ?? '').trim().slice(0, 30)}".`,
    };
  },
};
