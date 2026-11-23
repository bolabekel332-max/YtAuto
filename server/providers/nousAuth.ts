import crypto from 'node:crypto';
import type {
  NousDevicePollResponse,
  NousDeviceStartResponse,
  NousModelsResponse,
  NousOAuthStatusResponse,
} from '../../shared/api';
import { getEnv } from '../config';
import { ProviderCallError, sanitizeErrorMessage } from './types';

export const NOUS_PORTAL_BASE = 'https://portal.nousresearch.com';
export const NOUS_DEVICE_CODE_URL = `${NOUS_PORTAL_BASE}/api/oauth/device/code`;
export const NOUS_TOKEN_URL = `${NOUS_PORTAL_BASE}/api/oauth/token`;
export const NOUS_INFERENCE_BASE = 'https://inference-api.nousresearch.com/v1';

const DEFAULT_NOUS_SCOPE = 'inference:mint_agent_key';
const OAUTH_HTTP_TIMEOUT_MS = 12_000;
const MAX_PENDING_FLOWS = 20;

interface NousTokenSession {
  accessToken: string;
  refreshToken?: string;
  expiresAtMs?: number;
  tokenType: string;
  scope?: string;
  connectedAtMs: number;
}

interface PendingDeviceFlow {
  flowId: string;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresAtMs: number;
  intervalSec: number;
  lastPollAtMs: number;
}

let oauthSession: NousTokenSession | null = null;
let nousTestedFlag = false;
let refreshInFlight: Promise<boolean> | null = null;
const pendingFlows = new Map<string, PendingDeviceFlow>();

function validatePortalUrl(raw: unknown, fallbackPath: string): string {
  if (typeof raw === 'string' && raw.trim().length > 0) {
    try {
      const parsed = new URL(raw.trim());
      if (parsed.protocol === 'https:' && parsed.hostname === 'portal.nousresearch.com') {
        return parsed.toString();
      }
    } catch {
      // Gunakan fallback aman bila format URL tidak valid
    }
  }
  return `${NOUS_PORTAL_BASE}${fallbackPath}`;
}

function pruneExpiredFlows(now = Date.now()): void {
  for (const [id, flow] of pendingFlows.entries()) {
    if (now >= flow.expiresAtMs) {
      pendingFlows.delete(id);
    }
  }
  while (pendingFlows.size >= MAX_PENDING_FLOWS) {
    const oldestKey = pendingFlows.keys().next().value;
    if (!oldestKey) break;
    pendingFlows.delete(oldestKey);
  }
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = OAUTH_HTTP_TIMEOUT_MS,
  fetchFn: typeof fetch = fetch
): Promise<{ status: number; ok: boolean; data: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      ...init,
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    if (text.trim().length > 0) {
      try {
        const json = JSON.parse(text) as unknown;
        if (json && typeof json === 'object') {
          parsed = json as Record<string, unknown>;
        }
      } catch {
        parsed = { rawText: sanitizeErrorMessage(text) };
      }
    }
    return { status: res.status, ok: res.ok, data: parsed };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ProviderCallError(
        'timeout',
        504,
        'Permintaan OAuth ke Nous Portal melewati batas waktu (timeout). [local_timeout]',
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
  } finally {
    clearTimeout(timer);
  }
}

export function isNousTested(): boolean {
  return nousTestedFlag;
}

export function markNousTested(value: boolean): void {
  nousTestedFlag = value;
}

export function hasNousCredentials(): boolean {
  if (getEnv().nousApiKey.length > 0) return true;
  if (!oauthSession) return false;
  if (oauthSession.expiresAtMs && Date.now() >= oauthSession.expiresAtMs && !oauthSession.refreshToken) {
    return false;
  }
  return oauthSession.accessToken.length > 0;
}

export function getNousOAuthStatus(): NousOAuthStatusResponse {
  const envKey = getEnv().nousApiKey;
  if (oauthSession && oauthSession.accessToken.length > 0) {
    const expiredWithoutRefresh =
      Boolean(oauthSession.expiresAtMs && Date.now() >= oauthSession.expiresAtMs) &&
      !oauthSession.refreshToken;
    if (!expiredWithoutRefresh) {
      return {
        connected: true,
        authMethod: 'oauth',
        expiresAt: oauthSession.expiresAtMs
          ? new Date(oauthSession.expiresAtMs).toISOString()
          : undefined,
        hasRefreshToken: Boolean(oauthSession.refreshToken),
      };
    }
  }

  if (envKey.length > 0) {
    return {
      connected: true,
      authMethod: 'api_key',
      hasRefreshToken: false,
    };
  }

  return {
    connected: false,
    authMethod: 'none',
    hasRefreshToken: false,
  };
}

export function disconnectNousOAuth(): NousOAuthStatusResponse {
  oauthSession = null;
  nousTestedFlag = false;
  refreshInFlight = null;
  pendingFlows.clear();
  return getNousOAuthStatus();
}

export async function startNousDeviceFlow(
  fetchFn: typeof fetch = fetch
): Promise<NousDeviceStartResponse> {
  const { nousOauthClientId } = getEnv();
  const { status, ok, data } = await fetchJsonWithTimeout(
    NOUS_DEVICE_CODE_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: nousOauthClientId,
        scope: DEFAULT_NOUS_SCOPE,
      }),
    },
    OAUTH_HTTP_TIMEOUT_MS,
    fetchFn
  );

  if (!ok) {
    const desc =
      typeof data.error_description === 'string'
        ? data.error_description
        : typeof data.error === 'string'
        ? data.error
        : `HTTP ${status}`;
    throw new ProviderCallError(
      'provider_error',
      502,
      `Gagal memulai sesi OAuth Device Nous Portal: ${sanitizeErrorMessage(desc)}`,
      false,
      {
        errorKind: 'provider_error',
        upstreamStatus: status,
        sanitizedMessage: sanitizeErrorMessage(desc),
      }
    );
  }

  const deviceCode = typeof data.device_code === 'string' ? data.device_code.trim() : '';
  const userCode = typeof data.user_code === 'string' ? data.user_code.trim() : '';
  const expiresIn =
    typeof data.expires_in === 'number' && data.expires_in > 0 ? Math.floor(data.expires_in) : 600;
  const interval =
    typeof data.interval === 'number' && data.interval >= 1 ? Math.floor(data.interval) : 5;

  if (!deviceCode || !userCode) {
    throw new ProviderCallError(
      'provider_error',
      502,
      'Respons OAuth Device Nous Portal tidak lengkap (device_code / user_code kosong).',
      false
    );
  }

  const verificationUri = validatePortalUrl(data.verification_uri, '/manage-subscription');
  const verificationUriComplete = validatePortalUrl(
    data.verification_uri_complete,
    `/manage-subscription?user_code=${encodeURIComponent(userCode)}`
  );

  const now = Date.now();
  pruneExpiredFlows(now);

  const flowId = crypto.randomUUID();
  pendingFlows.set(flowId, {
    flowId,
    deviceCode,
    userCode,
    verificationUri,
    verificationUriComplete,
    expiresAtMs: now + expiresIn * 1000,
    intervalSec: interval,
    lastPollAtMs: 0,
  });

  return {
    flowId,
    userCode,
    verificationUri,
    verificationUriComplete,
    expiresIn,
    interval,
  };
}

function saveTokenResponse(data: Record<string, unknown>, prevRefreshToken?: string): NousTokenSession {
  const accessToken = typeof data.access_token === 'string' ? data.access_token.trim() : '';
  if (!accessToken) {
    throw new ProviderCallError(
      'provider_error',
      502,
      'Respons token Nous Portal tidak menyertakan access_token yang valid.',
      false
    );
  }
  const refreshToken =
    typeof data.refresh_token === 'string' && data.refresh_token.trim().length > 0
      ? data.refresh_token.trim()
      : prevRefreshToken;
  const expiresIn =
    typeof data.expires_in === 'number' && Number.isFinite(data.expires_in) && data.expires_in > 0
      ? data.expires_in
      : undefined;
  const tokenType =
    typeof data.token_type === 'string' && data.token_type.trim().length > 0
      ? data.token_type.trim()
      : 'Bearer';
  const scope = typeof data.scope === 'string' ? data.scope.trim() : undefined;

  const now = Date.now();
  const session: NousTokenSession = {
    accessToken,
    refreshToken,
    expiresAtMs: expiresIn ? now + expiresIn * 1000 : undefined,
    tokenType,
    scope,
    connectedAtMs: now,
  };
  oauthSession = session;
  return session;
}

export async function pollNousDeviceFlow(
  flowId: string,
  fetchFn: typeof fetch = fetch
): Promise<NousDevicePollResponse> {
  const flow = pendingFlows.get(flowId);
  if (!flow) {
    return {
      status: 'expired',
      message: 'Sesi otorisasi perangkat tidak ditemukan atau sudah berakhir. Mulai ulang koneksi.',
    };
  }

  const now = Date.now();
  if (now >= flow.expiresAtMs) {
    pendingFlows.delete(flowId);
    return {
      status: 'expired',
      message: 'Kode verifikasi Nous Portal sudah kedaluwarsa. Klik hubungkan ulang untuk kode baru.',
    };
  }

  if (flow.lastPollAtMs > 0 && now - flow.lastPollAtMs < (flow.intervalSec - 1) * 1000) {
    return {
      status: 'pending',
      interval: flow.intervalSec,
      message: 'Menunggu persetujuan pada halaman Nous Portal.',
    };
  }

  flow.lastPollAtMs = now;
  const { nousOauthClientId } = getEnv();

  const { status, ok, data } = await fetchJsonWithTimeout(
    NOUS_TOKEN_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: flow.deviceCode,
        client_id: nousOauthClientId,
      }),
    },
    OAUTH_HTTP_TIMEOUT_MS,
    fetchFn
  );

  if (ok && typeof data.access_token === 'string') {
    const saved = saveTokenResponse(data);
    pendingFlows.delete(flowId);
    nousTestedFlag = false;
    return {
      status: 'connected',
      message: 'Akun Nous Portal berhasil terhubung via OAuth.',
      expiresAt: saved.expiresAtMs ? new Date(saved.expiresAtMs).toISOString() : undefined,
    };
  }

  const errCode = typeof data.error === 'string' ? data.error.trim().toLowerCase() : '';
  if (errCode === 'authorization_pending') {
    return {
      status: 'pending',
      interval: flow.intervalSec,
      message: 'Menunggu persetujuan pada halaman Nous Portal.',
    };
  }

  if (errCode === 'slow_down') {
    flow.intervalSec = Math.min(30, flow.intervalSec + 5);
    return {
      status: 'pending',
      interval: flow.intervalSec,
      message: 'Menunggu persetujuan pada halaman Nous Portal (interval disesuaikan).',
    };
  }

  if (errCode === 'expired_token') {
    pendingFlows.delete(flowId);
    return {
      status: 'expired',
      message: 'Kode otorisasi Nous Portal telah kedaluwarsa. Silakan mulai ulang.',
    };
  }

  if (errCode === 'access_denied') {
    pendingFlows.delete(flowId);
    return {
      status: 'denied',
      message: 'Permintaan otorisasi ditolak oleh pengguna di Nous Portal.',
    };
  }

  const desc =
    typeof data.error_description === 'string'
      ? data.error_description
      : typeof data.error === 'string'
      ? data.error
      : `HTTP ${status}`;

  throw new ProviderCallError(
    'provider_error',
    502,
    `Gagal memeriksa status OAuth Nous Portal: ${sanitizeErrorMessage(desc)}`,
    false,
    {
      errorKind: 'provider_error',
      upstreamStatus: status,
      upstreamCode: errCode || undefined,
      sanitizedMessage: sanitizeErrorMessage(desc),
    }
  );
}

export async function refreshNousAccessToken(fetchFn: typeof fetch = fetch): Promise<boolean> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  const currentRefreshToken = oauthSession?.refreshToken;
  if (!currentRefreshToken) {
    return false;
  }

  refreshInFlight = (async () => {
    const { nousOauthClientId } = getEnv();
    const { ok, data } = await fetchJsonWithTimeout(
      NOUS_TOKEN_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: currentRefreshToken,
          client_id: nousOauthClientId,
        }),
      },
      OAUTH_HTTP_TIMEOUT_MS,
      fetchFn
    );

    if (!ok || typeof data.access_token !== 'string') {
      oauthSession = null;
      nousTestedFlag = false;
      return false;
    }

    saveTokenResponse(data, currentRefreshToken);
    return true;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function getNousAccessToken(
  fetchFn: typeof fetch = fetch
): Promise<{ token: string; authMethod: 'oauth' | 'api_key' }> {
  if (oauthSession && oauthSession.accessToken.length > 0) {
    const nearExpiry =
      oauthSession.expiresAtMs !== undefined && Date.now() >= oauthSession.expiresAtMs - 60_000;
    if (nearExpiry) {
      if (oauthSession.refreshToken) {
        const refreshed = await refreshNousAccessToken(fetchFn);
        if (refreshed && oauthSession) {
          return { token: oauthSession.accessToken, authMethod: 'oauth' };
        }
      } else {
        oauthSession = null;
        nousTestedFlag = false;
      }
    } else {
      return { token: oauthSession.accessToken, authMethod: 'oauth' };
    }
  }

  const envKey = getEnv().nousApiKey;
  if (envKey.length > 0) {
    return { token: envKey, authMethod: 'api_key' };
  }

  throw new ProviderCallError(
    'capability_missing',
    400,
    'Nous Portal belum terhubung. Klik "Hubungkan via OAuth Nous" pada Pengaturan Model atau isi NOUS_API_KEY di server.',
    false
  );
}

export async function fetchNousModels(
  fetchFn: typeof fetch = fetch
): Promise<{ providerId: 'nous'; fetchedAt: string; models: Array<{ id: string; name?: string; isFree: boolean; ownedBy?: string }> }> {
  const { token, authMethod } = await getNousAccessToken(fetchFn);
  const runFetch = (bearer: string) =>
    fetchJsonWithTimeout(
      `${NOUS_INFERENCE_BASE}/models`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${bearer}`,
          Accept: 'application/json',
        },
      },
      OAUTH_HTTP_TIMEOUT_MS,
      fetchFn
    );

  let res = await runFetch(token);
  if (res.status === 401 && authMethod === 'oauth') {
    const refreshed = await refreshNousAccessToken(fetchFn);
    if (refreshed && oauthSession) {
      res = await runFetch(oauthSession.accessToken);
    }
  }

  if (!res.ok) {
    throw new ProviderCallError(
      'provider_error',
      502,
      `Gagal mengambil daftar model Nous Portal (HTTP ${res.status}).`,
      res.status >= 500 || res.status === 429,
      { errorKind: 'provider_error', upstreamStatus: res.status }
    );
  }

  const isExplicitZero = (val: unknown): boolean => {
    if (typeof val === 'number') return Number.isFinite(val) && val === 0;
    if (typeof val === 'string') {
      const t = val.trim();
      return t.length > 0 && Number.isFinite(Number(t)) && Number(t) === 0;
    }
    return false;
  };

  const rawList = Array.isArray(res.data.data) ? res.data.data : [];
  const models: Array<{ id: string; name?: string; isFree: boolean; ownedBy?: string }> = [];
  for (const item of rawList) {
    if (item && typeof item === 'object') {
      const rec = item as {
        id?: unknown;
        name?: unknown;
        owned_by?: unknown;
        pricing?: { prompt?: unknown; completion?: unknown };
        architecture?: { output_modalities?: unknown };
      };
      if (typeof rec.id === 'string' && rec.id.trim().length > 0) {
        const id = rec.id.trim();
        const isSuffixFree = id.toLowerCase().endsWith(':free');
        const outputMods = Array.isArray(rec.architecture?.output_modalities)
          ? rec.architecture.output_modalities
          : undefined;
        const isTextChatOutput =
          !outputMods || (outputMods.includes('text') && !outputMods.includes('audio'));
        const isZeroPriceText =
          isTextChatOutput &&
          !/embed|tts|audio|lyria|whisper/i.test(id) &&
          isExplicitZero(rec.pricing?.prompt) &&
          isExplicitZero(rec.pricing?.completion);
        const isFree = isSuffixFree || isZeroPriceText;
        models.push({
          id,
          name: typeof rec.name === 'string' ? rec.name.trim() : undefined,
          isFree,
          ownedBy: typeof rec.owned_by === 'string' ? rec.owned_by : undefined,
        });
      }
    }
  }

  models.sort((a, b) => {
    if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  return {
    providerId: 'nous',
    fetchedAt: new Date().toISOString(),
    models,
  };
}

export function resetNousAuthForTests(): void {
  oauthSession = null;
  nousTestedFlag = false;
  refreshInFlight = null;
  pendingFlows.clear();
}

export function setNousSessionForTests(session: {
  accessToken: string;
  refreshToken?: string;
  expiresAtMs?: number;
} | null): void {
  oauthSession = session
    ? {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresAtMs: session.expiresAtMs,
        tokenType: 'Bearer',
        connectedAtMs: Date.now(),
      }
    : null;
}
