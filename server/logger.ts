import type { AgentId, ProviderId } from '../shared/schemas';
import { ProviderCallError, sanitizeErrorMessage, type ProviderErrorKind } from './providers/types';

export interface CallLogMeta {
  agentId: AgentId | 'provider_test';
  providerId: ProviderId;
  status: 'ok' | 'error';
  latencyMs: number;
  tokens?: number;
  upstreamStatus?: number;
  upstreamCode?: string | number;
  errorKind?: ProviderErrorKind | string;
  errorName?: string;
  retryable?: boolean;
  errorMessage?: string;
}

export function extractSafeErrorLogMeta(
  err: unknown
): Pick<
  CallLogMeta,
  'upstreamStatus' | 'upstreamCode' | 'errorKind' | 'errorName' | 'retryable' | 'errorMessage'
> {
  if (!err || typeof err !== 'object') {
    return {
      errorName: typeof err,
      retryable: false,
      errorMessage: sanitizeErrorMessage(err),
    };
  }

  if (err instanceof ProviderCallError) {
    return {
      upstreamStatus: err.meta?.upstreamStatus,
      upstreamCode: err.meta?.upstreamCode ?? err.meta?.upstreamStatusText,
      errorKind: err.meta?.errorKind ?? err.code,
      errorName: err.meta?.errorName ?? err.name,
      retryable: err.retryable,
      errorMessage: err.meta?.sanitizedMessage ?? sanitizeErrorMessage(err.message),
    };
  }

  const obj = err as {
    name?: unknown;
    code?: unknown;
    status?: unknown;
    httpStatus?: unknown;
    retryable?: unknown;
    message?: unknown;
  };

  const numericStatus =
    typeof obj.status === 'number' && Number.isFinite(obj.status)
      ? obj.status
      : undefined;

  return {
    upstreamStatus: numericStatus,
    upstreamCode:
      typeof obj.code === 'string' || typeof obj.code === 'number' ? obj.code : undefined,
    errorKind: typeof obj.code === 'string' ? obj.code : undefined,
    errorName: typeof obj.name === 'string' ? obj.name : 'Error',
    retryable: typeof obj.retryable === 'boolean' ? obj.retryable : false,
    errorMessage:
      typeof obj.message === 'string' ? sanitizeErrorMessage(obj.message) : undefined,
  };
}

/**
 * Pencatat aman (P-9 / S-09):
 * Hanya mencatat metadata panggilan (agentId, providerId, status, latensi, token, serta metadata error tersanitasi).
 * Tidak pernah mencatat prompt, input pengguna, respons model mentah, media, kunci API, token OAuth, atau Authorization header.
 */
export function logCall(meta: CallLogMeta): void {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    agentId: meta.agentId,
    providerId: meta.providerId,
    status: meta.status,
    latencyMs: Math.round(meta.latencyMs),
    tokens: meta.tokens ?? null,
  };

  if (meta.status === 'error') {
    entry.upstreamStatus = meta.upstreamStatus ?? null;
    entry.upstreamCode = meta.upstreamCode ?? null;
    entry.errorKind = meta.errorKind ?? null;
    entry.errorName = meta.errorName ?? null;
    entry.retryable = meta.retryable ?? false;
    entry.errorMessage = meta.errorMessage ? sanitizeErrorMessage(meta.errorMessage) : null;
  }

  console.info(JSON.stringify(entry));
}
