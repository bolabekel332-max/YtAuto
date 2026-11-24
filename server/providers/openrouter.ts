import type { ProviderModelItem, ProviderModelsResponse } from '../../shared/api';
import { getEnv } from '../config';
import {
  combineAbortSignals,
  parseRetryAfterMs,
  ProviderCallError,
  sanitizeErrorMessage,
  type LLMProvider,
  type LLMRequest,
  type LLMResponse,
} from './types';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

interface OpenRouterResponseBody {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      annotations?: Array<{
        type?: string;
        url_citation?: { url?: string; title?: string };
      }>;
    };
  }>;
  usage?: {
    total_tokens?: number;
  };
  error?: {
    message?: string;
    code?: number | string;
  };
}

function normalizeSchemaForOpenRouter(schema: Record<string, unknown>): Record<string, unknown> {
  const clone = structuredClone(schema);
  delete clone.$schema;
  return clone;
}

function extractTextFromChoice(
  content: string | Array<{ type?: string; text?: string }> | undefined
): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n')
      .trim();
  }
  return '';
}

export const openrouterProvider: LLMProvider = {
  id: 'openrouter',
  name: 'OpenRouter (Belum Teruji)',
  capabilities: {
    // Kemampuan bergantung model pada OpenRouter; penanda konservatif agar user melakukan Tes agent
    jsonSchema: true,
    jsonObject: true,
    search: true,
    video: false,
    image: true,
  },
  isAvailable: () => getEnv().openrouterApiKey.length > 0,
  isTested: () => false,
  statusNote: () =>
    openrouterProvider.isAvailable()
      ? 'Kunci terdeteksi, namun adapter OpenRouter ditandai belum teruji & kemampuan bergantung model.'
      : 'OPENROUTER_API_KEY belum tersedia di environment server (nonaktif & belum teruji).',

  async generate(req: LLMRequest, model: string): Promise<LLMResponse> {
    const apiKey = getEnv().openrouterApiKey;
    if (!apiKey) {
      throw new ProviderCallError(
        'capability_missing',
        400,
        'OPENROUTER_API_KEY belum terkonfigurasi di server.',
        false
      );
    }

    const userContentParts: Array<Record<string, unknown>> = [];
    if (req.media && req.media.length > 0) {
      for (const item of req.media) {
        if (item.type === 'youtube_url') {
          throw new ProviderCallError(
            'capability_missing',
            400,
            'Adapter OpenRouter tidak mendukung analisis langsung URL YouTube. Gunakan Gemini atau unggah file video/screenshot.',
            false
          );
        }
        if (item.type === 'image') {
          const dataUrl = item.ref.startsWith('data:')
            ? item.ref
            : `data:${item.mime || 'image/jpeg'};base64,${item.ref}`;
          userContentParts.push({
            type: 'image_url',
            image_url: { url: dataUrl },
          });
        }
      }
    }

    const combinedText = req.messages.map((m) => m.content).join('\n\n');
    const bodyMessages: Array<Record<string, unknown>> = [
      { role: 'system', content: req.system },
    ];

    if (userContentParts.length > 0) {
      userContentParts.push({ type: 'text', text: combinedText });
      bodyMessages.push({ role: 'user', content: userContentParts });
    } else {
      bodyMessages.push({ role: 'user', content: combinedText });
    }

    const payload: Record<string, unknown> = {
      model,
      messages: bodyMessages,
      max_tokens: req.maxTokens,
    };

    if (req.temperature !== null) {
      payload.temperature = req.temperature;
    }

    // Gunakan alat pencarian server OpenRouter terbaru (openrouter:web_search), bukan plugin lama
    if (req.useSearch) {
      payload.tools = [{ type: 'openrouter:web_search' }];
    } else if (req.jsonMode === 'json_schema' && req.jsonSchema) {
      payload.response_format = {
        type: 'json_schema',
        json_schema: {
          name: req.schemaId,
          strict: false,
          schema: normalizeSchemaForOpenRouter(req.jsonSchema),
        },
      };
    } else if (req.jsonMode === 'json_object') {
      payload.response_format = { type: 'json_object' };
    }

    if (req.signal?.aborted) {
      throw new ProviderCallError('timeout', 499, 'Permintaan ke OpenRouter dibatalkan.', false, {
        errorKind: 'local_timeout',
        errorName: 'AbortError',
      });
    }

    const { signal, cleanup, isCallerAborted } = combineAbortSignals(req.signal, req.timeoutMs);

    try {
      const res = await fetch(OPENROUTER_CHAT_URL, {
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
          'Autentikasi OpenRouter gagal (401). Periksa OPENROUTER_API_KEY di panel Secrets server.',
          false,
          { errorKind: 'authentication_error', upstreamStatus: 401 }
        );
      }

      if (res.status === 403) {
        throw new ProviderCallError(
          'provider_error',
          502,
          'Izin akses OpenRouter ditolak (403). Periksa hak akses kunci OPENROUTER_API_KEY.',
          false,
          { errorKind: 'permission_error', upstreamStatus: 403 }
        );
      }

      if (res.status === 429) {
        throw new ProviderCallError(
          'provider_error',
          429,
          'OpenRouter mengembalikan HTTP 429 (batas permintaan tercapai).',
          true,
          {
            errorKind: 'rate_limit',
            upstreamStatus: 429,
            retryAfterMs: parseRetryAfterMs(res.headers.get('retry-after')),
          }
        );
      }

      if (res.status >= 500) {
        throw new ProviderCallError(
          'provider_error',
          502,
          `OpenRouter mengalami error server (HTTP ${res.status}).`,
          true,
          { errorKind: 'upstream_internal_error', upstreamStatus: res.status }
        );
      }

      const data = (await res.json()) as OpenRouterResponseBody;

      if (!res.ok || data.error) {
        const sanitized = sanitizeErrorMessage(data.error?.message || 'Permintaan ditolak.');
        throw new ProviderCallError(
          'provider_error',
          502,
          `OpenRouter error (${res.status}): ${sanitized}`,
          false,
          { upstreamStatus: res.status, sanitizedMessage: sanitized }
        );
      }

      const choice = data.choices?.[0];
      const text = extractTextFromChoice(choice?.message?.content);
      const truncated = choice?.finish_reason === 'length';
      const sources: Array<{ title: string; url: string }> = [];

      for (const ann of choice?.message?.annotations ?? []) {
        if (ann.type === 'url_citation' && ann.url_citation?.url) {
          sources.push({
            title: ann.url_citation.title || ann.url_citation.url,
            url: ann.url_citation.url,
          });
        }
      }

      return {
        text,
        sources,
        tokens: data.usage?.total_tokens,
        truncated,
      };
    } catch (err) {
      if (err instanceof ProviderCallError) throw err;
      if (isCallerAborted()) {
        throw new ProviderCallError('timeout', 499, 'Permintaan ke OpenRouter dibatalkan.', false, {
          errorKind: 'local_timeout',
          errorName: 'AbortError',
        });
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ProviderCallError(
          'timeout',
          504,
          'Permintaan ke OpenRouter melewati batas waktu (timeout).',
          false
        );
      }
      throw new ProviderCallError(
        'provider_error',
        502,
        `Gagal menghubungi OpenRouter: ${sanitizeErrorMessage(err)}`,
        false
      );
    } finally {
      cleanup();
    }
  },

  async testConnection(model: string): Promise<{ latencyMs: number; message: string }> {
    const apiKey = getEnv().openrouterApiKey;
    if (!apiKey) {
      throw new ProviderCallError(
        'capability_missing',
        400,
        'OPENROUTER_API_KEY belum terkonfigurasi di server.',
        false
      );
    }

    const start = Date.now();
    const res = await this.generate(
      {
        system: 'Balas singkat.',
        messages: [{ role: 'user', content: 'Balas dengan satu kata: OK' }],
        schemaId: 'orchestrator',
        jsonMode: 'prompt_only',
        temperature: null,
        maxTokens: 128,
        useSearch: false,
        timeoutMs: 20_000,
      },
      model
    );

    return {
      latencyMs: Date.now() - start,
      message: `Koneksi OpenRouter (${model}) merespons: "${(res.text ?? '').trim().slice(0, 30)}".`,
    };
  },
};

export async function fetchOpenRouterModels(
  fetchFn: typeof fetch = fetch
): Promise<ProviderModelsResponse> {
  const apiKey = getEnv().openrouterApiKey;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const res = await fetchFn(OPENROUTER_MODELS_URL, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new ProviderCallError(
        'provider_error',
        502,
        `Gagal memuat katalog model OpenRouter (HTTP ${res.status}).`,
        res.status >= 500 || res.status === 429
      );
    }

    const body = (await res.json()) as {
      data?: Array<{
        id?: unknown;
        name?: unknown;
        context_length?: unknown;
        supported_parameters?: unknown;
        pricing?: { prompt?: unknown; completion?: unknown };
        architecture?: { input_modalities?: unknown; output_modalities?: unknown };
      }>;
    };

    const isExplicitZero = (val: unknown): boolean => {
      if (typeof val === 'number') return Number.isFinite(val) && val === 0;
      if (typeof val === 'string') {
        const t = val.trim();
        return t.length > 0 && Number.isFinite(Number(t)) && Number(t) === 0;
      }
      return false;
    };

    const parsePricePerMillion = (val: unknown): number | undefined => {
      const n = typeof val === 'number' ? val : typeof val === 'string' && val.trim() ? Number(val.trim()) : NaN;
      if (!Number.isFinite(n) || n < 0) return undefined;
      return Math.round(n * 1_000_000 * 10000) / 10000;
    };

    const models: ProviderModelItem[] = [];
    for (const item of body.data ?? []) {
      if (!item || typeof item.id !== 'string' || item.id.trim().length === 0) continue;
      const id = item.id.trim();
      const isSuffixFree = id.toLowerCase().endsWith(':free');
      const outputMods = Array.isArray(item.architecture?.output_modalities)
        ? item.architecture.output_modalities.filter((m): m is string => typeof m === 'string')
        : undefined;
      const inputMods = Array.isArray(item.architecture?.input_modalities)
        ? item.architecture.input_modalities.filter((m): m is string => typeof m === 'string')
        : undefined;
      const isTextChatOutput =
        !outputMods || (outputMods.includes('text') && !outputMods.includes('audio'));
      const isZeroPriceText =
        isTextChatOutput &&
        !/embed|tts|audio|lyria|whisper/i.test(id) &&
        isExplicitZero(item.pricing?.prompt) &&
        isExplicitZero(item.pricing?.completion);
      const isFree = isSuffixFree || isZeroPriceText;
      const contextLength =
        typeof item.context_length === 'number' && Number.isFinite(item.context_length) && item.context_length > 0
          ? item.context_length
          : undefined;
      const supportedParams = Array.isArray(item.supported_parameters)
        ? item.supported_parameters.filter((p): p is string => typeof p === 'string')
        : undefined;
      const supportsStructuredOutput = supportedParams
        ? supportedParams.includes('structured_outputs') || supportedParams.includes('response_format')
        : undefined;

      models.push({
        id,
        name: typeof item.name === 'string' ? item.name.trim() : undefined,
        isFree,
        ...(contextLength !== undefined ? { contextLength } : {}),
        ...(inputMods && inputMods.length > 0 ? { inputModalities: inputMods } : {}),
        ...(supportsStructuredOutput !== undefined ? { supportsStructuredOutput } : {}),
        ...(parsePricePerMillion(item.pricing?.prompt) !== undefined
          ? { promptPricePerMillion: parsePricePerMillion(item.pricing?.prompt) }
          : {}),
        ...(parsePricePerMillion(item.pricing?.completion) !== undefined
          ? { completionPricePerMillion: parsePricePerMillion(item.pricing?.completion) }
          : {}),
      });
    }

    models.sort((a, b) => {
      if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

    return {
      providerId: 'openrouter',
      fetchedAt: new Date().toISOString(),
      models,
    };
  } catch (err) {
    if (err instanceof ProviderCallError) throw err;
    throw new ProviderCallError(
      'provider_error',
      502,
      `Gagal menghubungi katalog OpenRouter: ${sanitizeErrorMessage(err)}`,
      false
    );
  } finally {
    clearTimeout(timer);
  }
}
