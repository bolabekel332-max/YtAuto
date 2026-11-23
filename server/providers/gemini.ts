import { GoogleGenAI, ThinkingLevel, type Part } from '@google/genai';
import { getEnv } from '../config';
import {
  ProviderCallError,
  sanitizeErrorMessage,
  type LLMProvider,
  type LLMRequest,
  type LLMResponse,
  type ProviderErrorKind,
  type ProviderErrorMeta,
} from './types';

function createGeminiClient(): GoogleGenAI {
  const { geminiApiKey } = getEnv();
  return new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Menormalkan JSON Schema ke subset yang didukung Gemini responseSchema.
 */
export function normalizeSchemaForGemini(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(normalizeSchemaForGemini);
  }
  if (!node || typeof node !== 'object') {
    return node;
  }

  const obj = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  // Tangani union nullable seperti anyOf: [{ type: 'number' }, { type: 'null' }]
  if (Array.isArray(obj.anyOf)) {
    const nonNull = obj.anyOf.filter(
      (item) => !(item && typeof item === 'object' && (item as Record<string, unknown>).type === 'null')
    );
    if (nonNull.length === 1 && nonNull[0] && typeof nonNull[0] === 'object') {
      const normalizedInner = normalizeSchemaForGemini(nonNull[0]) as Record<string, unknown>;
      return { ...normalizedInner, nullable: true };
    }
  }

  const blockedKeys = new Set([
    '$schema',
    'additionalProperties',
    'minLength',
    'maxLength',
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'minItems',
    'maxItems',
    'format',
    'default',
    'propertyNames',
    'const',
  ]);

  for (const [key, value] of Object.entries(obj)) {
    if (blockedKeys.has(key)) continue;

    if (key === 'type' && Array.isArray(value)) {
      const nonNullType = value.find((t) => t !== 'null') ?? 'string';
      out.type = String(nonNullType).toUpperCase();
      if (value.includes('null')) {
        out.nullable = true;
      }
      continue;
    }

    if (key === 'type' && typeof value === 'string') {
      out.type = value.toUpperCase();
      continue;
    }

    if (key === 'properties' && value && typeof value === 'object') {
      const propsOut: Record<string, unknown> = {};
      for (const [propKey, propVal] of Object.entries(value as Record<string, unknown>)) {
        propsOut[propKey] = normalizeSchemaForGemini(propVal);
      }
      out.properties = propsOut;
      continue;
    }

    out[key] = normalizeSchemaForGemini(value);
  }

  return out;
}

function buildParts(req: LLMRequest): Part[] {
  const parts: Part[] = [];

  if (req.media && req.media.length > 0) {
    for (const item of req.media) {
      if (item.type === 'youtube_url') {
        parts.push({
          fileData: {
            fileUri: item.ref,
          },
        });
      } else if (item.type === 'image') {
        const cleanBase64 = item.ref.replace(/^data:[^;]+;base64,/, '');
        parts.push({
          inlineData: {
            mimeType: item.mime || 'image/jpeg',
            data: cleanBase64,
          },
        });
      }
    }
  }

  const combinedMessages = req.messages
    .map((m) => `${m.role === 'user' ? 'PENGGUNA' : 'ASISTEN'}:\n${m.content}`)
    .join('\n\n');

  parts.push({ text: combinedMessages });
  return parts;
}

interface ParsedGoogleErrorBody {
  code?: number | string;
  status?: string;
  message?: string;
}

function tryParseGoogleErrorBody(rawMessage: string): ParsedGoogleErrorBody | undefined {
  const trimmed = rawMessage.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as {
      error?: { code?: unknown; status?: unknown; message?: unknown };
      code?: unknown;
      status?: unknown;
      message?: unknown;
    };
    const errObj = parsed.error && typeof parsed.error === 'object' ? parsed.error : parsed;
    const code =
      typeof errObj.code === 'number' || typeof errObj.code === 'string'
        ? errObj.code
        : undefined;
    const status = typeof errObj.status === 'string' ? errObj.status : undefined;
    const message = typeof errObj.message === 'string' ? errObj.message : undefined;
    if (code === undefined && status === undefined && message === undefined) {
      return undefined;
    }
    return { code, status, message };
  } catch {
    return undefined;
  }
}

const NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_SOCKET',
]);

const TIMEOUT_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

function extractCauseCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const direct = (err as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const nested = (cause as { code?: unknown }).code;
    if (typeof nested === 'string') return nested;
  }
  return undefined;
}

function buildDiagnosticTag(meta: ProviderErrorMeta): string {
  const parts: string[] = [];
  if (meta.errorKind) parts.push(meta.errorKind);
  if (meta.upstreamStatus !== undefined) parts.push(`HTTP ${meta.upstreamStatus}`);
  if (meta.upstreamStatusText) parts.push(meta.upstreamStatusText);
  return parts.length > 0 ? ` [${parts.join(' · ')}]` : '';
}

function makeProviderError(
  errorKind: ProviderErrorKind,
  code: 'invalid_request' | 'provider_error' | 'timeout',
  httpStatus: number,
  userMessage: string,
  retryable: boolean,
  baseMeta: Omit<ProviderErrorMeta, 'errorKind'>
): ProviderCallError {
  const meta: ProviderErrorMeta = {
    ...baseMeta,
    errorKind,
  };
  return new ProviderCallError(
    code,
    httpStatus,
    `${userMessage}${buildDiagnosticTag(meta)}`,
    retryable,
    meta
  );
}

export function mapGeminiError(err: unknown, hasYoutubeMedia: boolean): ProviderCallError {
  const errorName = err instanceof Error ? err.name : typeof err;
  const rawMessage = err instanceof Error ? err.message : String(err ?? '');
  const lower = rawMessage.toLowerCase();
  const parsedBody = tryParseGoogleErrorBody(rawMessage);
  const causeCode = extractCauseCode(err);

  const directStatus =
    err && typeof err === 'object' ? (err as { status?: unknown }).status : undefined;
  const bodyCode = parsedBody?.code;

  let upstreamStatus: number | undefined;
  if (typeof directStatus === 'number' && Number.isInteger(directStatus) && directStatus >= 100 && directStatus <= 599) {
    upstreamStatus = directStatus;
  } else if (typeof bodyCode === 'number' && Number.isInteger(bodyCode) && bodyCode >= 400 && bodyCode <= 599) {
    upstreamStatus = bodyCode;
  }

  const upstreamStatusText = parsedBody?.status;
  const sanitizedDetail = sanitizeErrorMessage(parsedBody?.message ?? rawMessage);

  const baseMeta: Omit<ProviderErrorMeta, 'errorKind'> = {
    upstreamStatus,
    upstreamCode: bodyCode ?? causeCode,
    upstreamStatusText,
    errorName,
    sanitizedMessage: sanitizedDetail,
  };

  // 1. Timeout lokal / AbortController (dibedakan dari HTTP upstream 504)
  if (
    errorName === 'AbortError' ||
    (causeCode && TIMEOUT_ERROR_CODES.has(causeCode)) ||
    (upstreamStatus === undefined && /\b(aborted|timed out|timeout)\b/i.test(rawMessage))
  ) {
    return makeProviderError(
      'local_timeout',
      'timeout',
      504,
      'Permintaan ke Gemini melewati batas waktu lokal (timeout). Coba naikkan timeout di Pengaturan Model atau gunakan input yang lebih ringkas.',
      false,
      baseMeta
    );
  }

  // 2. Klasifikasi utama berdasarkan status HTTP numerik asli dari SDK (err.status)
  if (upstreamStatus !== undefined) {
    switch (upstreamStatus) {
      case 400:
        return makeProviderError(
          'invalid_request',
          'invalid_request',
          400,
          'Permintaan ke Gemini ditolak karena parameter atau payload tidak valid.',
          false,
          baseMeta
        );
      case 401:
        return makeProviderError(
          'authentication_error',
          'provider_error',
          502,
          'Autentikasi Gemini gagal (401). Periksa keabsahan GEMINI_API_KEY di panel Secrets server.',
          false,
          baseMeta
        );
      case 403:
        return makeProviderError(
          'permission_error',
          'provider_error',
          502,
          hasYoutubeMedia && /youtube|video/i.test(sanitizedDetail)
            ? 'Akses video YouTube ditolak oleh layanan Gemini (403). Unggah file video langsung atau gunakan screenshot/deskripsi manual.'
            : 'Izin akses API Gemini ditolak (403). Periksa hak akses kunci GEMINI_API_KEY di panel Secrets server.',
          false,
          baseMeta
        );
      case 404:
        return makeProviderError(
          'not_found',
          'provider_error',
          502,
          hasYoutubeMedia && /youtube|video/i.test(sanitizedDetail)
            ? 'Video YouTube tidak ditemukan atau tidak tersedia (404). Unggah file video langsung atau gunakan screenshot/deskripsi manual.'
            : 'Model atau endpoint Gemini yang dipilih tidak ditemukan (404). Periksa nama model di Pengaturan Model.',
          false,
          baseMeta
        );
      case 429:
        return makeProviderError(
          'rate_limit',
          'provider_error',
          429,
          'Kuota atau batas laju permintaan Gemini tercapai (429). Tunggu sejenak atau periksa kuota akun Gemini.',
          true,
          baseMeta
        );
      case 500:
        return makeProviderError(
          'upstream_internal_error',
          'provider_error',
          502,
          'Server Gemini mengalami galat internal (500). Silakan ulangi beberapa saat lagi.',
          true,
          baseMeta
        );
      case 502:
        return makeProviderError(
          'upstream_bad_gateway',
          'provider_error',
          502,
          'Gateway layanan Gemini mengembalikan galat sementara (502). Silakan ulangi beberapa saat lagi.',
          true,
          baseMeta
        );
      case 503:
        return makeProviderError(
          'upstream_unavailable',
          'provider_error',
          502,
          'Layanan Gemini sedang tidak tersedia sementara (503). Silakan ulangi beberapa saat lagi.',
          true,
          baseMeta
        );
      case 504:
        return makeProviderError(
          'upstream_timeout',
          'timeout',
          504,
          'Server Gemini melewati batas waktu pemrosesan (504). Silakan ulangi beberapa saat lagi.',
          true,
          baseMeta
        );
      default:
        if (upstreamStatus >= 400 && upstreamStatus < 500) {
          return makeProviderError(
            'invalid_request',
            'invalid_request',
            400,
            `Permintaan ditolak oleh Gemini (HTTP ${upstreamStatus}).`,
            false,
            baseMeta
          );
        }
        if (upstreamStatus >= 500) {
          return makeProviderError(
            'upstream_internal_error',
            'provider_error',
            502,
            `Server Gemini mengembalikan kesalahan layanan (HTTP ${upstreamStatus}).`,
            true,
            baseMeta
          );
        }
    }
  }

  // 3. Jika status HTTP numerik tidak tersedia, periksa Google API error.status string
  if (upstreamStatusText) {
    const upperStatus = upstreamStatusText.toUpperCase();
    if (upperStatus === 'INVALID_ARGUMENT' || upperStatus === 'FAILED_PRECONDITION') {
      return makeProviderError(
        'invalid_request',
        'invalid_request',
        400,
        'Permintaan ke Gemini ditolak karena argumen atau kondisi permintaan tidak valid.',
        false,
        baseMeta
      );
    }
    if (upperStatus === 'UNAUTHENTICATED') {
      return makeProviderError(
        'authentication_error',
        'provider_error',
        502,
        'Autentikasi Gemini gagal. Periksa GEMINI_API_KEY di panel Secrets server.',
        false,
        baseMeta
      );
    }
    if (upperStatus === 'PERMISSION_DENIED') {
      return makeProviderError(
        'permission_error',
        'provider_error',
        502,
        'Izin akses API Gemini ditolak. Periksa hak akses GEMINI_API_KEY.',
        false,
        baseMeta
      );
    }
    if (upperStatus === 'NOT_FOUND') {
      return makeProviderError(
        'not_found',
        'provider_error',
        502,
        'Model atau sumber daya Gemini tidak ditemukan.',
        false,
        baseMeta
      );
    }
    if (upperStatus === 'RESOURCE_EXHAUSTED') {
      return makeProviderError(
        'rate_limit',
        'provider_error',
        429,
        'Kuota atau batas laju permintaan Gemini tercapai. Tunggu sejenak atau periksa kuota akun Gemini.',
        true,
        baseMeta
      );
    }
    if (upperStatus === 'INTERNAL') {
      return makeProviderError(
        'upstream_internal_error',
        'provider_error',
        502,
        'Server Gemini mengalami galat internal.',
        true,
        baseMeta
      );
    }
    if (upperStatus === 'UNAVAILABLE') {
      return makeProviderError(
        'upstream_unavailable',
        'provider_error',
        502,
        'Layanan Gemini sedang tidak tersedia sementara.',
        true,
        baseMeta
      );
    }
    if (upperStatus === 'DEADLINE_EXCEEDED') {
      return makeProviderError(
        'upstream_timeout',
        'timeout',
        504,
        'Server Gemini melewati batas waktu pemrosesan.',
        true,
        baseMeta
      );
    }
  }

  // 4. Error jaringan (dibedakan dari HTTP upstream)
  if (
    (causeCode && NETWORK_ERROR_CODES.has(causeCode)) ||
    /\b(fetch failed|networkerror|network error|econnreset|econnrefused|enotfound|ehostunreach|enetunreach|eai_again|socket hang up)\b/i.test(
      rawMessage
    )
  ) {
    return makeProviderError(
      'network_error',
      'provider_error',
      502,
      'Gagal terhubung ke endpoint Gemini karena gangguan jaringan.',
      false,
      baseMeta
    );
  }

  // 5. Fallback berbasis pesan hanya jika status numerik & Google status tidak tersedia (tanpa menyimpulkan status HTTP)
  if (lower.includes('api_key_invalid') || lower.includes('invalid api key')) {
    return makeProviderError(
      'authentication_error',
      'provider_error',
      502,
      'Kunci API Gemini ditolak atau belum valid. Periksa GEMINI_API_KEY di panel Secrets server.',
      false,
      baseMeta
    );
  }

  if (lower.includes('permission_denied')) {
    return makeProviderError(
      'permission_error',
      'provider_error',
      502,
      'Izin akses API Gemini ditolak. Periksa GEMINI_API_KEY di panel Secrets server.',
      false,
      baseMeta
    );
  }

  if (lower.includes('resource_exhausted') || lower.includes('quota')) {
    return makeProviderError(
      'rate_limit',
      'provider_error',
      429,
      'Kuota atau batas permintaan Gemini tercapai. Tunggu sejenak atau periksa kuota akun Gemini.',
      true,
      baseMeta
    );
  }

  if (lower.includes('not_found')) {
    return makeProviderError(
      'not_found',
      'provider_error',
      502,
      'Model atau sumber daya Gemini yang dipilih tidak ditemukan.',
      false,
      baseMeta
    );
  }

  if (hasYoutubeMedia && (lower.includes('youtube') || lower.includes('video'))) {
    return makeProviderError(
      'provider_error',
      'provider_error',
      502,
      'Video YouTube tidak dapat diakses. Unggah file video langsung atau gunakan screenshot/deskripsi manual.',
      false,
      baseMeta
    );
  }

  if (lower.includes('unavailable')) {
    return makeProviderError(
      'upstream_unavailable',
      'provider_error',
      502,
      'Layanan Gemini melaporkan status tidak tersedia sementara.',
      true,
      baseMeta
    );
  }

  return makeProviderError(
    'provider_error',
    'provider_error',
    502,
    `Terjadi kesalahan saat memanggil Gemini: ${sanitizedDetail || 'kesalahan tidak diketahui'}`,
    false,
    baseMeta
  );
}

export const geminiProvider: LLMProvider = {
  id: 'gemini',
  name: 'Google Gemini',
  capabilities: {
    jsonSchema: true,
    jsonObject: true,
    search: true,
    video: true,
    image: true,
  },
  isAvailable: () => {
    const key = getEnv().geminiApiKey;
    return key.length > 0 && key !== 'MY_GEMINI_API_KEY';
  },
  isTested: () => true,
  statusNote: () =>
    geminiProvider.isAvailable()
      ? 'Kunci GEMINI_API_KEY terdeteksi di server.'
      : 'GEMINI_API_KEY belum tersedia di environment server.',

  async generate(req: LLMRequest, model: string): Promise<LLMResponse> {
    if (!geminiProvider.isAvailable()) {
      throw new ProviderCallError(
        'capability_missing',
        400,
        'GEMINI_API_KEY belum terkonfigurasi di server.',
        false
      );
    }

    const ai = createGeminiClient();
    const parts = buildParts(req);
    const hasYoutubeMedia = Boolean(req.media?.some((m) => m.type === 'youtube_url'));

    const config: Record<string, unknown> = {
      systemInstruction: req.system,
      maxOutputTokens: req.maxTokens,
    };

    // Jangan kirim parameter temperature ke model seri gemini-4-* sesuai panduan SDK
    const isGemini4 = model.startsWith('gemini-4-') || model.startsWith('models/gemini-4-');
    if (req.temperature !== null && !isGemini4) {
      config.temperature = req.temperature;
    }

    if (req.useSearch) {
      config.tools = [{ googleSearch: {} }];
    } else if (req.jsonMode === 'json_schema' && req.jsonSchema) {
      config.responseMimeType = 'application/json';
      config.responseSchema = normalizeSchemaForGemini(req.jsonSchema);
    } else if (req.jsonMode === 'json_object') {
      config.responseMimeType = 'application/json';
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);

    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          ...config,
          abortSignal: controller.signal,
        },
      });

      const candidate = response.candidates?.[0];
      const finishReason = candidate?.finishReason;
      const tokens = response.usageMetadata?.totalTokenCount;

      const groundingChunks = candidate?.groundingMetadata?.groundingChunks;
      const sources: Array<{ title: string; url: string }> = [];
      if (Array.isArray(groundingChunks)) {
        for (const chunk of groundingChunks) {
          const web = (chunk as { web?: { uri?: string; title?: string } }).web;
          if (web?.uri) {
            sources.push({
              title: web.title || web.uri,
              url: web.uri,
            });
          }
        }
      }

      if (finishReason === 'MAX_TOKENS') {
        return {
          text: response.text,
          sources,
          tokens,
          truncated: true,
        };
      }

      return {
        text: response.text,
        sources,
        tokens,
        truncated: false,
      };
    } catch (err) {
      throw mapGeminiError(err, hasYoutubeMedia);
    } finally {
      clearTimeout(timer);
    }
  },

  async testConnection(model: string): Promise<{ latencyMs: number; message: string }> {
    if (!geminiProvider.isAvailable()) {
      throw new ProviderCallError(
        'capability_missing',
        400,
        'GEMINI_API_KEY belum terkonfigurasi di server.',
        false
      );
    }

    const start = Date.now();
    const ai = createGeminiClient();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);

    const isGemini4 = model.startsWith('gemini-4-') || model.startsWith('models/gemini-4-');
    const isGemini3Text =
      (model.startsWith('gemini-3') || model.startsWith('models/gemini-3')) &&
      !model.includes('image') &&
      !model.includes('tts') &&
      !model.includes('transcribe');
    const supportsThinkingLow = isGemini4 || isGemini3Text;

    const testConfig: Record<string, unknown> = {
      maxOutputTokens: supportsThinkingLow ? 128 : 64,
      abortSignal: controller.signal,
    };

    if (supportsThinkingLow) {
      testConfig.thinkingConfig = {
        thinkingLevel: ThinkingLevel.LOW,
      };
    }

    try {
      const response = await ai.models.generateContent({
        model,
        contents: 'Balas dengan satu kata: OK',
        config: testConfig,
      });
      const latencyMs = Date.now() - start;
      const reply = (response.text ?? '').trim();
      const finishReason = response.candidates?.[0]?.finishReason;

      if (!reply && finishReason === 'MAX_TOKENS') {
        throw new ProviderCallError(
          'output_truncated',
          502,
          `Koneksi Gemini (${model}) tercapai namun respons tes terpotong sebelum menghasilkan teks.`,
          false
        );
      }

      return {
        latencyMs,
        message: `Koneksi Gemini (${model}) berhasil${reply ? ` — respons: "${reply.slice(0, 30)}"` : ''}.`,
      };
    } catch (err) {
      if (err instanceof ProviderCallError) {
        throw err;
      }
      throw mapGeminiError(err, false);
    } finally {
      clearTimeout(timer);
    }
  },
};
