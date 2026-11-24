import type { JsonMode, ProviderId } from '../../shared/schemas';
import type { SchemaId } from '../../shared/agentSchemas';
import type { ApiErrorCode, ProviderCapabilities } from '../../shared/api';

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMMediaItem {
  type: 'youtube_url' | 'image';
  ref: string;
  mime?: string;
}

export interface LLMRequest {
  system: string;
  messages: LLMMessage[];
  schemaId: SchemaId;
  jsonSchema?: Record<string, unknown>;
  jsonMode: JsonMode;
  temperature: number | null;
  maxTokens: number;
  useSearch: boolean;
  timeoutMs: number;
  media?: LLMMediaItem[];
  signal?: AbortSignal;
}

export interface LLMResponse {
  json?: unknown;
  text?: string;
  sources?: Array<{ title: string; url: string }>;
  tokens?: number;
  truncated?: boolean;
}

export interface LLMProvider {
  id: ProviderId;
  name: string;
  capabilities: ProviderCapabilities;
  isAvailable: () => boolean;
  isTested: () => boolean;
  statusNote: () => string;
  generate: (req: LLMRequest, model: string) => Promise<LLMResponse>;
  testConnection: (model: string) => Promise<{ latencyMs: number; message: string }>;
}

export type ProviderErrorKind =
  | 'invalid_request'
  | 'authentication_error'
  | 'insufficient_balance'
  | 'permission_error'
  | 'not_found'
  | 'rate_limit'
  | 'upstream_internal_error'
  | 'upstream_bad_gateway'
  | 'upstream_unavailable'
  | 'upstream_timeout'
  | 'network_error'
  | 'local_timeout'
  | 'provider_error';

export interface ProviderErrorMeta {
  errorKind?: ProviderErrorKind;
  upstreamStatus?: number;
  upstreamCode?: string | number;
  upstreamStatusText?: string;
  errorName?: string;
  sanitizedMessage?: string;
  retryAfterMs?: number;
}

export function parseRetryAfterMs(headerVal: string | null | undefined): number | undefined {
  if (!headerVal) return undefined;
  const trimmed = headerVal.trim();
  if (!trimmed) return undefined;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    const diff = dateMs - Date.now();
    return diff > 0 ? diff : 0;
  }
  return undefined;
}

export function combineAbortSignals(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number
): { signal: AbortSignal; cleanup: () => void; isCallerAborted: () => boolean } {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  const signal = callerSignal
    ? AbortSignal.any([timeoutController.signal, callerSignal])
    : timeoutController.signal;

  return {
    signal,
    cleanup: () => clearTimeout(timer),
    isCallerAborted: () => Boolean(callerSignal?.aborted),
  };
}

export function sanitizeErrorMessage(raw: unknown, maxLen = 280): string {
  const str = typeof raw === 'string' ? raw : raw instanceof Error ? raw.message : String(raw ?? '');
  const redacted = str
    .replace(/([?&](?:key|api_key|token|access_token|secret)=)[^&\s"'`]+/gi, '$1[REDACTED]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [REDACTED]')
    .replace(
      /((?:x-goog-api-key|x-app-access-code|authorization|api[-_]?key|secret)\s*[:=]\s*["']?)[^\s"',;}\]]+/gi,
      '$1[REDACTED]'
    )
    .replace(/\bAIza[0-9A-Za-z_-]{10,}\b/g, '[REDACTED_KEY]')
    .replace(/\bsk-(?:or-v1-|nous-|apx-)?[0-9A-Za-z_-]{10,}\b/g, '[REDACTED_KEY]')
    .replace(/\s+/g, ' ')
    .trim();

  if (redacted.length <= maxLen) return redacted;
  return `${redacted.slice(0, maxLen - 3)}...`;
}

export class ProviderCallError extends Error {
  readonly code: ApiErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly meta?: ProviderErrorMeta;

  constructor(
    code: ApiErrorCode,
    httpStatus: number,
    message: string,
    retryable = false,
    meta?: ProviderErrorMeta
  ) {
    super(message);
    this.name = 'ProviderCallError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
    this.meta = meta;
  }
}
