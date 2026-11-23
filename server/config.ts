import { PROVIDER_IDS } from '../shared/constants';
import type { ProviderId } from '../shared/schemas';

export interface ServerEnv {
  port: number;
  geminiApiKey: string;
  openrouterApiKey: string;
  nousApiKey: string;
  nousOauthClientId: string;
  customApiKey: string;
  appAccessCode: string;
  rateLimitPerMin: number;
  dailyCallCap: number;
  bodyLimitMb: number;
  authFailLimit: number;
  nodeEnv: string;
}

export const PROVIDER_ALLOWLIST: readonly ProviderId[] = PROVIDER_IDS;

/**
 * Daftar URL dasar tepercaya untuk provider Kustom (OpenAI-compatible).
 * Sengaja dibiarkan kosong hingga pemilik mengisi endpoint tepercaya secara eksplisit di kode server.
 * Browser tidak pernah diperbolehkan mengirim base URL sendiri.
 */
export const BASE_URL_ALLOWLIST: readonly string[] = [];

export const CUSTOM_PROVIDER_BASE_URL: string = BASE_URL_ALLOWLIST[0] ?? '';

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getEnv(): ServerEnv {
  return {
    port: parsePositiveInt(process.env.PORT, 3000),
    geminiApiKey: (process.env.GEMINI_API_KEY ?? '').trim(),
    openrouterApiKey: (process.env.OPENROUTER_API_KEY ?? '').trim(),
    nousApiKey: (process.env.NOUS_API_KEY ?? '').trim(),
    nousOauthClientId: (process.env.NOUS_OAUTH_CLIENT_ID ?? '').trim() || 'hermes-cli',
    customApiKey: (process.env.CUSTOM_API_KEY ?? '').trim(),
    appAccessCode: (process.env.APP_ACCESS_CODE ?? '').trim(),
    rateLimitPerMin: parsePositiveInt(process.env.RATE_LIMIT_PER_MIN, 20),
    dailyCallCap: parsePositiveInt(process.env.DAILY_CALL_CAP, 300),
    bodyLimitMb: parsePositiveInt(process.env.BODY_LIMIT_MB, 10),
    authFailLimit: parsePositiveInt(process.env.AUTH_FAIL_LIMIT, 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
  };
}
