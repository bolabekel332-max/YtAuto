import { ZodError } from 'zod';
import {
  MAX_FALLBACKS,
  MAX_PASTE_CHARS,
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
import {
  CUSTOM_PROVIDER_BASE_URL,
  getEffectiveModelAllowlist,
  getEnv,
  PROVIDER_ALLOWLIST,
} from './config';
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

  const effectiveAllowlist = getEffectiveModelAllowlist(config.providerId, getEnv());
  if (effectiveAllowlist.length > 0) {
    const modelsToCheck = [config.model, ...config.fallbackModels];
    for (const m of modelsToCheck) {
      if (!effectiveAllowlist.includes(m)) {
        throw new AppApiError(
          'invalid_request',
          400,
          `Model "${m}" untuk provider "${config.providerId}" tidak termasuk dalam allowlist model server (${effectiveAllowlist.join(', ')}).`
        );
      }
    }
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

  const { serverMaxTokensCap } = getEnv();
  if (config.maxTokens > serverMaxTokensCap) {
    throw new AppApiError(
      'invalid_request',
      400,
      `Max tokens (${config.maxTokens}) melebihi plafon server (${serverMaxTokensCap}).`
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

export function extractJsonFromText(
  text: string,
  accept?: (parsed: unknown) => boolean
): unknown {
  const trimmed = text.trim();
  let firstValid: unknown = undefined;
  let hasFirstValid = false;

  const tryAccept = (candidate: unknown): { matched: boolean; value?: unknown } => {
    if (!accept || accept(candidate)) {
      return { matched: true, value: candidate };
    }
    if (!hasFirstValid) {
      firstValid = candidate;
      hasFirstValid = true;
    }
    return { matched: false };
  };

  try {
    const direct = JSON.parse(trimmed);
    const res = tryAccept(direct);
    if (res.matched) return res.value;
  } catch {
    // Lanjut ke ekstraksi toleran di bawah
  }

  // Coba semua blok fence ```json ... ``` atau ``` ... ``` secara berurutan
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = fenceRegex.exec(trimmed)) !== null) {
    const inner = fenceMatch[1]?.trim();
    if (!inner) continue;
    try {
      const parsed = JSON.parse(inner);
      const res = tryAccept(parsed);
      if (res.matched) return res.value;
    } catch {
      // Lanjutkan ke blok fence berikutnya
    }
  }

  // Pindai potongan kurung kurawal seimbang {...} sambil mengenali string & escape JSON
  let cursor = 0;
  while (cursor < trimmed.length) {
    const openIdx = trimmed.indexOf('{', cursor);
    if (openIdx === -1) break;

    let depth = 0;
    let inString = false;
    let escaped = false;
    let closedAt = -1;

    for (let i = openIdx; i < trimmed.length; i += 1) {
      const ch = trimmed[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          closedAt = i;
          break;
        }
      }
    }

    if (closedAt !== -1) {
      const slice = trimmed.slice(openIdx, closedAt + 1);
      try {
        const parsed = JSON.parse(slice);
        const res = tryAccept(parsed);
        if (res.matched) return res.value;
        cursor = closedAt + 1;
        continue;
      } catch {
        cursor = openIdx + 1;
        continue;
      }
    }

    cursor = openIdx + 1;
  }

  if (hasFirstValid) {
    return firstValid;
  }

  throw new Error('Respons teks bukan JSON yang valid.');
}

export function validateOutput<T = unknown>(
  schemaId: SchemaId,
  rawJsonOrText: { json?: unknown; text?: string }
): { ok: true; data: T } | { ok: false; reason: string } {
  const schema = OUTPUT_SCHEMAS[schemaId];
  let candidate: unknown = rawJsonOrText.json;

  if (candidate === undefined && typeof rawJsonOrText.text === 'string') {
    try {
      candidate = extractJsonFromText(
        rawJsonOrText.text,
        (parsed) => schema.safeParse(parsed).success
      );
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
