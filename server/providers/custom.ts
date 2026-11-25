import { CUSTOM_PROVIDER_BASE_URL, getEnv } from '../config';
import {
  combineAbortSignals,
  parseRetryAfterMs,
  ProviderCallError,
  sanitizeErrorMessage,
  type LLMProvider,
  type LLMRequest,
  type LLMResponse,
} from './types';

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

export async function callCustomChat(
  req: LLMRequest,
  model: string,
  fetchFn: typeof fetch = fetch,
  baseUrlOverride: string = CUSTOM_PROVIDER_BASE_URL
): Promise<LLMResponse> {
  if (!baseUrlOverride) {
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

  const endpoint = `${baseUrlOverride.replace(/\/+$/, '')}/chat/completions`;
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

    if (req.signal?.aborted) {
      throw new ProviderCallError('timeout', 499, 'Permintaan ke provider kustom dibatalkan.', false, {
        errorKind: 'local_timeout',
        errorName: 'AbortError',
      });
    }

    const { signal, cleanup, isCallerAborted } = combineAbortSignals(req.signal, req.timeoutMs);

    try {
      const res = await fetchFn(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (res.status === 401) {
        throw new ProviderCallError(
          'provider_error',
          502,
          'Autentikasi provider kustom gagal (401).',
          false,
          { errorKind: 'authentication_error', upstreamStatus: 401 }
        );
      }

      if (res.status === 403) {
        throw new ProviderCallError(
          'provider_error',
          502,
          'Izin akses provider kustom ditolak (403).',
          false,
          { errorKind: 'permission_error', upstreamStatus: 403 }
        );
      }

      if (res.status === 429) {
        throw new ProviderCallError(
          'provider_error',
          429,
          'Provider kustom mengembalikan HTTP 429.',
          true,
          {
            errorKind: 'rate_limit',
            upstreamStatus: 429,
            retryAfterMs: parseRetryAfterMs(res.headers.get('retry-after')),
          }
        );
      }

      const rawText = await res.text();
      let data: OpenAICompatibleResponse | null = null;
      if (rawText.trim().length > 0) {
        try {
          data = JSON.parse(rawText) as OpenAICompatibleResponse;
        } catch {
          data = null;
        }
      }

      if (!res.ok || data?.error) {
        const snippet = sanitizeErrorMessage(data?.error?.message || rawText || 'Permintaan gagal.', 200);
        throw new ProviderCallError(
          'provider_error',
          502,
          `Provider kustom error (${res.status}): ${snippet}`,
          res.status >= 500,
          { upstreamStatus: res.status, sanitizedMessage: snippet }
        );
      }

      if (!data) {
        const snippet = sanitizeErrorMessage(rawText, 200);
        throw new ProviderCallError(
          'provider_error',
          502,
          `Respons provider kustom bukan JSON yang valid (HTTP ${res.status}): ${snippet || 'kosong'}`,
          false,
          { upstreamStatus: res.status, sanitizedMessage: snippet }
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
      if (isCallerAborted()) {
        throw new ProviderCallError('timeout', 499, 'Permintaan ke provider kustom dibatalkan.', false, {
          errorKind: 'local_timeout',
          errorName: 'AbortError',
        });
      }
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
        `Gagal menghubungi provider kustom: ${sanitizeErrorMessage(err)}`,
        false
      );
    } finally {
      cleanup();
    }
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
    return callCustomChat(req, model);
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
