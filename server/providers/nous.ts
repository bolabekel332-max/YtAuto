import {
  getNousAccessToken,
  hasNousCredentials,
  isNousTested,
  markNousTested,
  NOUS_INFERENCE_BASE,
  refreshNousAccessToken,
} from './nousAuth';
import {
  combineAbortSignals,
  parseRetryAfterMs,
  ProviderCallError,
  sanitizeErrorMessage,
  type LLMProvider,
  type LLMRequest,
  type LLMResponse,
  type ProviderErrorKind,
  type ProviderErrorMeta,
} from './types';

const NOUS_CHAT_URL = `${NOUS_INFERENCE_BASE}/chat/completions`;

interface NousChatResponseBody {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    total_tokens?: number;
  };
  message?: string;
  error?: {
    message?: string;
    code?: number | string;
    type?: string;
  };
}

function normalizeSchemaForNous(schema: Record<string, unknown>): Record<string, unknown> {
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

function mapNousHttpError(
  status: number,
  rawMsg: string,
  errCode?: string | number,
  retryAfterMs?: number
): ProviderCallError {
  const sanitized = sanitizeErrorMessage(rawMsg);
  let errorKind: ProviderErrorKind = 'provider_error';
  let code: 'invalid_request' | 'provider_error' | 'timeout' = 'provider_error';
  let httpStatus = 502;
  let retryable = false;
  let userMsg = `Nous Portal mengembalikan error (HTTP ${status}): ${sanitized || 'permintaan gagal.'}`;

  if (status === 400) {
    errorKind = 'invalid_request';
    code = 'invalid_request';
    httpStatus = 400;
    userMsg = `Permintaan ke Nous Portal ditolak (HTTP 400): ${sanitized || 'parameter tidak valid.'}`;
  } else if (status === 401) {
    errorKind = 'authentication_error';
    userMsg =
      'Sesi OAuth atau kunci Nous Portal tidak valid/kedaluwarsa (401). Silakan hubungkan ulang akun Nous Anda.';
  } else if (status === 403) {
    errorKind = 'permission_error';
    userMsg = 'Izin akses ke model Nous Portal ditolak (403). Periksa paket atau hak akses akun Nous Anda.';
  } else if (status === 404) {
    errorKind = 'not_found';
    userMsg = sanitized
      ? `Model atau endpoint Nous Portal tidak ditemukan (404): ${sanitized} Pilih model aktif dari Katalog Model Live.`
      : 'Model atau endpoint Nous Portal tidak ditemukan (404). Periksa atau pilih ID model aktif di Katalog Model Live.';
  } else if (status === 429) {
    errorKind = 'rate_limit';
    httpStatus = 429;
    retryable = true;
    userMsg = 'Batas laju atau kuota permintaan Nous Portal tercapai (429). Tunggu sejenak lalu ulangi.';
  } else if (status === 504) {
    errorKind = 'upstream_timeout';
    code = 'timeout';
    httpStatus = 504;
    retryable = true;
    userMsg = 'Server Nous Portal melewati batas waktu pemrosesan (504).';
  } else if (status >= 500) {
    errorKind = status === 503 ? 'upstream_unavailable' : 'upstream_internal_error';
    retryable = true;
    userMsg = `Layanan Nous Portal sedang mengalami gangguan sementara (HTTP ${status}).`;
  }

  const meta: ProviderErrorMeta = {
    errorKind,
    upstreamStatus: status,
    upstreamCode: errCode,
    sanitizedMessage: sanitized,
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  };

  return new ProviderCallError(
    code,
    httpStatus,
    `${userMsg} [${errorKind} · HTTP ${status}]`,
    retryable,
    meta
  );
}

export async function callNousChat(
  req: LLMRequest,
  model: string,
  fetchFn: typeof fetch = fetch
): Promise<LLMResponse> {
  const userContentParts: Array<Record<string, unknown>> = [];
  if (req.media && req.media.length > 0) {
    for (const item of req.media) {
      if (item.type === 'youtube_url') {
        throw new ProviderCallError(
          'capability_missing',
          400,
          'Nous Portal tidak mendukung analisis langsung URL YouTube. Gunakan Gemini atau unggah key frame/screenshot.',
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

  if (req.jsonMode === 'json_schema' && req.jsonSchema) {
    payload.response_format = {
      type: 'json_schema',
      json_schema: {
        name: req.schemaId,
        strict: false,
        schema: normalizeSchemaForNous(req.jsonSchema),
      },
    };
  } else if (req.jsonMode === 'json_object') {
    payload.response_format = { type: 'json_object' };
  }

  if (req.signal?.aborted) {
    throw new ProviderCallError('timeout', 499, 'Permintaan ke Nous Portal dibatalkan.', false, {
      errorKind: 'local_timeout',
      errorName: 'AbortError',
    });
  }

  const readAttempt = async (
    bearer: string
  ): Promise<{ status: number; ok: boolean; rawText: string; retryAfterMs?: number }> => {
    const { signal, cleanup } = combineAbortSignals(req.signal, req.timeoutMs);
    try {
      const res = await fetchFn(NOUS_CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearer}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal,
      });
      const rawText = await res.text();
      return {
        status: res.status,
        ok: res.ok,
        rawText,
        retryAfterMs: parseRetryAfterMs(res.headers.get('retry-after')),
      };
    } finally {
      cleanup();
    }
  };

  try {
    let creds = await getNousAccessToken(fetchFn);
    let attemptRes = await readAttempt(creds.token);

    if (attemptRes.status === 401 && creds.authMethod === 'oauth') {
      const refreshed = await refreshNousAccessToken(fetchFn);
      if (refreshed) {
        creds = await getNousAccessToken(fetchFn);
        attemptRes = await readAttempt(creds.token);
      }
    }

    const rawText = attemptRes.rawText;
    let data: NousChatResponseBody = {};
    if (rawText.trim().length > 0) {
      try {
        data = JSON.parse(rawText) as NousChatResponseBody;
      } catch {
        data = { error: { message: sanitizeErrorMessage(rawText) } };
      }
    }

    if (!attemptRes.ok || data.error) {
      const errMsg =
        data.error?.message ||
        data.message ||
        sanitizeErrorMessage(rawText) ||
        `HTTP ${attemptRes.status}`;
      throw mapNousHttpError(
        attemptRes.status || 502,
        errMsg,
        data.error?.code ?? data.error?.type,
        attemptRes.retryAfterMs
      );
    }

    const choice = data.choices?.[0];
    const text = extractTextFromChoice(choice?.message?.content);
    const truncated = choice?.finish_reason === 'length';

    return {
      text,
      sources: [],
      tokens: data.usage?.total_tokens,
      truncated,
    };
  } catch (err) {
    if (err instanceof ProviderCallError) throw err;
    if (req.signal?.aborted) {
      throw new ProviderCallError('timeout', 499, 'Permintaan ke Nous Portal dibatalkan.', false, {
        errorKind: 'local_timeout',
        errorName: 'AbortError',
      });
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ProviderCallError(
        'timeout',
        504,
        'Permintaan ke Nous Portal melewati batas waktu lokal (timeout). [local_timeout]',
        false,
        { errorKind: 'local_timeout', errorName: 'AbortError' }
      );
    }
    throw new ProviderCallError(
      'provider_error',
      502,
      `Gagal menghubungi Nous Portal: ${sanitizeErrorMessage(err)} [network_error]`,
      false,
      {
        errorKind: 'network_error',
        errorName: err instanceof Error ? err.name : 'Error',
        sanitizedMessage: sanitizeErrorMessage(err),
      }
    );
  }
}

export const nousProvider: LLMProvider = {
  id: 'nous',
  name: 'Nous Portal (OAuth)',
  capabilities: {
    jsonSchema: true,
    jsonObject: true,
    search: false,
    video: false,
    image: true,
  },
  isAvailable: () => hasNousCredentials(),
  isTested: () => isNousTested(),
  statusNote: () => {
    if (!hasNousCredentials()) {
      return 'Belum terhubung. Klik "Hubungkan via OAuth Nous" pada kartu ini atau konfigurasi NOUS_API_KEY di server.';
    }
    return isNousTested()
      ? 'Terhubung ke Nous Portal dan koneksi sudah teruji.'
      : 'Terhubung ke Nous Portal (belum diuji — klik Tes Koneksi untuk verifikasi model).';
  },

  async generate(req: LLMRequest, model: string): Promise<LLMResponse> {
    return callNousChat(req, model);
  },

  async testConnection(model: string): Promise<{ latencyMs: number; message: string }> {
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

    markNousTested(true);
    return {
      latencyMs: Date.now() - start,
      message: `Koneksi Nous Portal (${model}) merespons: "${(res.text ?? '').trim().slice(0, 30)}".`,
    };
  },
};
