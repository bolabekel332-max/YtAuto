import {
  AUTO_FREE_FALLBACK_MODELS,
  MAX_TOKENS_LIMIT,
  PROVIDER_IDS,
} from '../shared/constants';
import type { ProviderId } from '../shared/schemas';
import { DEFAULT_MODEL_CONFIGS, defaultModelForProvider } from '../shared/defaults';

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
  openrouterModelAllowlist: string[];
  nousModelAllowlist: string[];
  apinexModelAllowlist: string[];
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

function parseCsvEnv(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function getExplicitAllowlistForProvider(
  providerId: ProviderId,
  env: Pick<
    ServerEnv,
    'geminiModelAllowlist' | 'openrouterModelAllowlist' | 'nousModelAllowlist' | 'apinexModelAllowlist'
  >
): string[] {
  switch (providerId) {
    case 'gemini':
      return env.geminiModelAllowlist;
    case 'openrouter':
      return env.openrouterModelAllowlist;
    case 'nous':
      return env.nousModelAllowlist;
    case 'apinex':
      return env.apinexModelAllowlist;
    default:
      return [];
  }
}

function getImplicitModelsForProvider(providerId: ProviderId): string[] {
  const models = new Set<string>();
  for (const cfg of DEFAULT_MODEL_CONFIGS) {
    if (cfg.providerId !== providerId) continue;
    if (cfg.model.trim()) models.add(cfg.model.trim());
    for (const fb of cfg.fallbackModels) {
      if (fb.trim()) models.add(fb.trim());
    }
  }
  const fallbackDefault = defaultModelForProvider(providerId);
  if (fallbackDefault) {
    models.add(fallbackDefault);
  }
  const autoFree = (AUTO_FREE_FALLBACK_MODELS as Record<string, string>)[providerId];
  if (autoFree) {
    models.add(autoFree);
  }
  return Array.from(models);
}

const catalogFreeModels = new Map<ProviderId, Set<string>>();

export function recordCatalogFreeModels(
  providerId: ProviderId,
  modelIds: Iterable<string>
): void {
  const next = new Set<string>();
  for (const id of modelIds) {
    const trimmed = id.trim();
    if (trimmed) next.add(trimmed);
  }
  catalogFreeModels.set(providerId, next);
}

export function clearCatalogFreeModelsForTests(): void {
  catalogFreeModels.clear();
}

export function isImplicitlyAllowedFreeModel(providerId: ProviderId, model: string): boolean {
  const trimmed = model.trim();
  if (!trimmed) return false;
  if (catalogFreeModels.get(providerId)?.has(trimmed)) {
    return true;
  }
  const lower = trimmed.toLowerCase();
  if (providerId === 'apinex') {
    return lower.startsWith('free/');
  }
  if (providerId === 'openrouter' || providerId === 'nous') {
    return lower.endsWith(':free');
  }
  return false;
}

export function getEffectiveModelAllowlist(
  providerId: ProviderId,
  env: Pick<
    ServerEnv,
    | 'host'
    | 'geminiModelAllowlist'
    | 'openrouterModelAllowlist'
    | 'nousModelAllowlist'
    | 'apinexModelAllowlist'
  > = getEnv()
): string[] {
  if (providerId === 'mock') {
    return [];
  }
  const explicit = getExplicitAllowlistForProvider(providerId, env);
  if (explicit.length > 0) {
    return explicit;
  }
  if (!isLoopbackHost(env.host)) {
    const merged = new Set<string>(getImplicitModelsForProvider(providerId));
    const cachedFree = catalogFreeModels.get(providerId);
    if (cachedFree) {
      for (const m of cachedFree) {
        merged.add(m);
      }
    }
    return Array.from(merged);
  }
  return [];
}

export function isModelAllowedByServer(
  providerId: ProviderId,
  model: string,
  env: Pick<
    ServerEnv,
    | 'host'
    | 'geminiModelAllowlist'
    | 'openrouterModelAllowlist'
    | 'nousModelAllowlist'
    | 'apinexModelAllowlist'
  > = getEnv()
): { allowed: boolean; allowlist: string[] } {
  if (providerId === 'mock') {
    return { allowed: true, allowlist: [] };
  }
  const explicit = getExplicitAllowlistForProvider(providerId, env);
  if (explicit.length > 0) {
    return { allowed: explicit.includes(model), allowlist: explicit };
  }
  if (isLoopbackHost(env.host)) {
    return { allowed: true, allowlist: [] };
  }
  const allowlist = getEffectiveModelAllowlist(providerId, env);
  const allowed = allowlist.includes(model) || isImplicitlyAllowedFreeModel(providerId, model);
  return { allowed, allowlist };
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
  const geminiModelAllowlist = parseCsvEnv(process.env.GEMINI_MODEL_ALLOWLIST);
  const openrouterModelAllowlist = parseCsvEnv(process.env.OPENROUTER_MODEL_ALLOWLIST);
  const nousModelAllowlist = parseCsvEnv(process.env.NOUS_MODEL_ALLOWLIST);
  const apinexModelAllowlist = parseCsvEnv(process.env.APINEX_MODEL_ALLOWLIST);
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
    openrouterModelAllowlist,
    nousModelAllowlist,
    apinexModelAllowlist,
    autoFreeFallback: (process.env.AUTO_FREE_FALLBACK ?? '').trim().toLowerCase() !== 'false',
  };
}
