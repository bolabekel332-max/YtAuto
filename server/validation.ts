import { ZodError } from 'zod';
import {
  MAX_FALLBACKS,
  MAX_PASTE_CHARS,
  MAX_TOKENS_LIMIT,
  TIMEOUT_LIMIT_MS,
} from '../shared/constants';
import { INPUT_SCHEMAS } from '../shared/agentInputs';
import { OUTPUT_SCHEMAS, type SchemaId } from '../shared/agentSchemas';
import { schemaIdFor } from '../shared/agentRegistry';
import {
  AgentModelConfigSchema,
  type AgentId,
  type AgentModelConfig,
} from '../shared/schemas';
import type { ApiErrorCode } from '../shared/api';
import { CUSTOM_PROVIDER_BASE_URL, PROVIDER_ALLOWLIST } from './config';
import type { LLMMediaItem, LLMProvider } from './providers/types';

export class AppApiError extends Error {
  readonly code: ApiErrorCode;
  readonly httpStatus: number;

  constructor(code: ApiErrorCode, httpStatus: number, message: string) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function validateConfig(
  rawConfig: unknown,
  provider: LLMProvider | undefined,
  media?: LLMMediaItem[]
): AgentModelConfig {
  const parsed = AgentModelConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    throw new AppApiError(
      'invalid_request',
      400,
      `Konfigurasi model tidak valid: ${parsed.error.issues.map((i) => i.message).join('; ')}`
    );
  }

  const config = parsed.data;

  if (!PROVIDER_ALLOWLIST.includes(config.providerId)) {
    throw new AppApiError(
      'invalid_request',
      400,
      `Provider "${config.providerId}" tidak termasuk dalam allowlist server.`
    );
  }

  if (config.providerId === 'custom' && !CUSTOM_PROVIDER_BASE_URL) {
    throw new AppApiError(
      'capability_missing',
      400,
      'Provider Kustom tidak aktif karena belum ada base URL tepercaya di allowlist server (server/config.ts).'
    );
  }

  if (!provider || !provider.isAvailable()) {
    throw new AppApiError(
      'capability_missing',
      400,
      `Provider "${config.providerId}" belum aktif atau kunci API server belum tersedia.`
    );
  }

  if (config.temperature !== null && (config.temperature < 0 || config.temperature > 2)) {
    throw new AppApiError('invalid_request', 400, 'Temperature harus berada di antara 0 dan 2.');
  }

  if (config.maxTokens > MAX_TOKENS_LIMIT) {
    throw new AppApiError(
      'invalid_request',
      400,
      `Max tokens melebihi batas maksimum (${MAX_TOKENS_LIMIT}).`
    );
  }

  if (config.timeoutMs > TIMEOUT_LIMIT_MS) {
    throw new AppApiError(
      'invalid_request',
      400,
      `Timeout melebihi batas maksimum (${TIMEOUT_LIMIT_MS} ms).`
    );
  }

  if (config.fallbackModels.length > MAX_FALLBACKS) {
    throw new AppApiError(
      'invalid_request',
      400,
      `Jumlah model cadangan maksimal ${MAX_FALLBACKS} model pada provider yang sama.`
    );
  }

  if (media && media.length > 0) {
    const needsVideo = media.some((m) => m.type === 'youtube_url');
    const needsImage = media.some((m) => m.type === 'image');

    if (needsVideo && !provider.capabilities.video) {
      throw new AppApiError(
        'capability_missing',
        400,
        `Provider "${provider.name}" tidak mendukung analisis video URL YouTube. Gunakan provider Gemini atau unggah video/screenshot untuk ekstraksi lokal.`
      );
    }

    if (needsImage && !provider.capabilities.image) {
      throw new AppApiError(
        'capability_missing',
        400,
        `Provider "${provider.name}" tidak mendukung input gambar (key frame / screenshot). Gunakan provider dengan dukungan gambar.`
      );
    }
  }

  return config;
}

function checkTextLengths(val: unknown): void {
  if (typeof val === 'string') {
    if (val.length > MAX_PASTE_CHARS) {
      throw new AppApiError(
        'invalid_request',
        400,
        `Teks masukan melebihi batas ${MAX_PASTE_CHARS} karakter.`
      );
    }
    return;
  }
  if (Array.isArray(val)) {
    for (const item of val) {
      checkTextLengths(item);
    }
    return;
  }
  if (val && typeof val === 'object') {
    for (const v of Object.values(val as Record<string, unknown>)) {
      checkTextLengths(v);
    }
  }
}

export function validateInput(agentId: AgentId, mode: string | undefined, rawInput: unknown): unknown {
  const schemaId = schemaIdFor(agentId, mode);
  const schema = INPUT_SCHEMAS[schemaId];
  const parsed = schema.safeParse(rawInput);

  if (!parsed.success) {
    throw new AppApiError(
      'invalid_request',
      400,
      `Input untuk ${agentId} (${schemaId}) tidak valid: ${parsed.error.issues
        .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
        .join('; ')}`
    );
  }

  // Periksa batas karakter pada field teks pengguna (kecuali base64 media)
  if (schemaId !== 'styleAnalyst') {
    checkTextLengths(parsed.data);
  } else {
    const refData = parsed.data as { descriptionText?: string };
    if (refData.descriptionText && refData.descriptionText.length > MAX_PASTE_CHARS) {
      throw new AppApiError(
        'invalid_request',
        400,
        `Deskripsi referensi melebihi batas ${MAX_PASTE_CHARS} karakter.`
      );
    }
  }

  return parsed.data;
}

export function extractJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Coba ekstrak dari blok ```json ... ``` atau kurung kurawal pertama..terakhir
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim());
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Respons teks bukan JSON yang valid.');
  }
}

export function validateOutput<T = unknown>(
  schemaId: SchemaId,
  rawJsonOrText: { json?: unknown; text?: string }
): { ok: true; data: T } | { ok: false; reason: string } {
  let candidate: unknown = rawJsonOrText.json;

  if (candidate === undefined && typeof rawJsonOrText.text === 'string') {
    try {
      candidate = extractJsonFromText(rawJsonOrText.text);
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : 'Gagal mengurai JSON dari respons model.',
      };
    }
  }

  if (candidate === undefined) {
    return {
      ok: false,
      reason: 'Model tidak mengembalikan data JSON maupun teks.',
    };
  }

  const schema = OUTPUT_SCHEMAS[schemaId];
  const result = schema.safeParse(candidate);
  if (!result.success) {
    const zErr = result.error as ZodError;
    return {
      ok: false,
      reason: zErr.issues
        .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
        .join('; '),
    };
  }

  return { ok: true, data: result.data as T };
}
