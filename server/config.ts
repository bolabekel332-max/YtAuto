import { DEFAULT_GEMINI_MODEL, MAX_TOKENS_LIMIT, PROVIDER_IDS } from '../shared/constants';
import type { ProviderId } from '../shared/schemas';

export interface ServerEnv {
  host: string;
  port: number;
  geminiApiKey: string;
  openrouterApiKey: string;
  nousApiKey: string;
  nousOauthClientId: string;
  enableNousOAuth: boolean;
  apinexApiKey: string;
  customApiKey: string;
  rateLimitPerMin: number;
  strictRateLimitPerMin: number;
  dailyCallCap: number;
  dailyTokenCap: number;
  serverMaxTokensCap: number;
  bodyLimitMb: number;
  nodeEnv: string;
  isProd: boolean;
  trustProxy: boolean | number;
  geminiModelAllowlist: string[];
  autoFreeFallback: boolean;
}

export const PROVIDER_ALLOWLIST: readonly ProviderId[] = PROVIDER_IDS;

/**
 * Daftar URL dasar tepercaya untuk provider Kustom (OpenAI-compatible).
 * Sengaja dibiarkan kosong hingga pemilik mengisi endpoint tepercaya secara eksplisit di kode server.
 * Browser tidak pernah diperbolehkan mengirim base URL sendiri.
 */
export const BASE_URL_ALLOWLIST: readonly string[] = [];

export const CUSTOM_PROVIDER_BASE_URL: string = BASE_URL_ALLOWLIST[0] ?? '';

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

export function getEffectiveGeminiModelAllowlist(
  env: Pick<ServerEnv, 'host' | 'geminiModelAllowlist'> = getEnv()
): string[] {
  if (env.geminiModelAllowlist.length > 0) {
    return env.geminiModelAllowlist;
  }
  if (!isLoopbackHost(env.host)) {
    return [DEFAULT_GEMINI_MODEL];
  }
  return [];
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseTrustProxy(raw: string | undefined): boolean | number {
  const trimmed = (raw ?? '').trim().toLowerCase();
  if (!trimmed || trimmed === 'false' || trimmed === '0') {
    return false;
  }
  if (trimmed === 'true') {
    return true;
  }
  const num = Number.parseInt(trimmed, 10);
  if (Number.isFinite(num) && num > 0) {
    return num;
  }
  return false;
}

export function isProdMode(
  nodeEnv = process.env.NODE_ENV ?? 'development',
  argv: readonly string[] = process.argv
): boolean {
  return nodeEnv.trim().toLowerCase() === 'production' || argv.includes('--prod');
}

export function getEnv(): ServerEnv {
  const nodeEnv = (process.env.NODE_ENV ?? 'development').trim() || 'development';
  const allowlistRaw = process.env.GEMINI_MODEL_ALLOWLIST ?? '';
  const geminiModelAllowlist = allowlistRaw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const rawMaxTokensCap = parsePositiveInt(
    process.env.SERVER_MAX_TOKENS_CAP,
    MAX_TOKENS_LIMIT
  );

  return {
    host: (process.env.HOST ?? '').trim() || '127.0.0.1',
    port: parsePositiveInt(process.env.PORT, 3000),
    geminiApiKey: (process.env.GEMINI_API_KEY ?? '').trim(),
    openrouterApiKey: (process.env.OPENROUTER_API_KEY ?? '').trim(),
    nousApiKey: (process.env.NOUS_API_KEY ?? '').trim(),
    nousOauthClientId: (process.env.NOUS_OAUTH_CLIENT_ID ?? '').trim() || 'hermes-cli',
    enableNousOAuth: (process.env.ENABLE_NOUS_OAUTH ?? '').trim().toLowerCase() === 'true',
    apinexApiKey: (process.env.APINEX_API_KEY ?? '').trim(),
    customApiKey: (process.env.CUSTOM_API_KEY ?? '').trim(),
    rateLimitPerMin: parsePositiveInt(process.env.RATE_LIMIT_PER_MIN, 20),
    strictRateLimitPerMin: parsePositiveInt(process.env.STRICT_RATE_LIMIT_PER_MIN, 6),
    dailyCallCap: parsePositiveInt(process.env.DAILY_CALL_CAP, 300),
    dailyTokenCap: parsePositiveInt(process.env.DAILY_TOKEN_CAP, 2_000_000),
    serverMaxTokensCap: Math.min(MAX_TOKENS_LIMIT, rawMaxTokensCap),
    bodyLimitMb: parsePositiveInt(process.env.BODY_LIMIT_MB, 10),
    nodeEnv,
    isProd: isProdMode(nodeEnv, process.argv),
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    geminiModelAllowlist,
    autoFreeFallback: (process.env.AUTO_FREE_FALLBACK ?? '').trim().toLowerCase() !== 'false',
  };
}
