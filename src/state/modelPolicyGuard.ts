import type {
  ProviderModelItem,
  ProvidersStatusResponse,
} from '../../shared/api';
import { validateAgentConfigAgainstPolicy } from '../../shared/modelPolicy';
import type { AgentId, AgentModelConfig, ProviderId } from '../../shared/schemas';
import { label } from '../config/labels';

let cachedStatus: ProvidersStatusResponse | null = null;
let cachedFreeCatalog: Partial<Record<ProviderId, string[]>> = {};
let inflightStatusPromise: Promise<ProvidersStatusResponse | null> | null = null;

export function setCachedProviderStatus(status: ProvidersStatusResponse): void {
  if (status && Array.isArray(status.providers)) {
    cachedStatus = status;
  }
}

export function getCachedProviderStatus(): ProvidersStatusResponse | null {
  return cachedStatus;
}

export function recordClientCatalogFreeModels(
  providerId: ProviderId,
  models: Array<ProviderModelItem | string>
): void {
  const freeIds = models
    .map((m) => (typeof m === 'string' ? m : m.isFree ? m.id : null))
    .filter((id): id is string => Boolean(id && id.trim().length > 0));
  cachedFreeCatalog = {
    ...cachedFreeCatalog,
    [providerId]: Array.from(new Set(freeIds)),
  };
}

export function getClientCatalogFreeModels(
  providerId: ProviderId
): string[] | undefined {
  return cachedFreeCatalog[providerId];
}

export function clearProviderStatusCacheForTests(): void {
  cachedStatus = null;
  cachedFreeCatalog = {};
  inflightStatusPromise = null;
}

export async function ensureProviderStatus(
  forceRefresh = false
): Promise<ProvidersStatusResponse | null> {
  if (!forceRefresh && cachedStatus) {
    return cachedStatus;
  }
  if (!forceRefresh && inflightStatusPromise) {
    return inflightStatusPromise;
  }

  inflightStatusPromise = (async () => {
    try {
      const response = await fetch('/api/providers/status', { method: 'GET' });
      if (!response || !response.ok) return cachedStatus;
      const body = (await response.json()) as Partial<ProvidersStatusResponse> | null;
      if (body && Array.isArray(body.providers)) {
        const normalized = body as ProvidersStatusResponse;
        cachedStatus = normalized;
        return normalized;
      }
      return cachedStatus;
    } catch {
      return cachedStatus;
    } finally {
      inflightStatusPromise = null;
    }
  })();

  return inflightStatusPromise;
}

export async function checkConfigAgainstServerPolicy(
  config: Pick<AgentModelConfig, 'agentId' | 'providerId' | 'model' | 'fallbackModels'>,
  catalogFreeMap?: Partial<Record<ProviderId, string[]>>
): Promise<{ ok: true } | { ok: false; model: string; allowlist: string[]; message: string }> {
  if (config.providerId === 'mock') {
    return { ok: true };
  }
  const status = await ensureProviderStatus();
  const providerInfo = status?.providers.find((p) => p.id === config.providerId);
  if (!providerInfo?.modelPolicy) {
    return { ok: true };
  }

  const freeIds = catalogFreeMap?.[config.providerId] ?? cachedFreeCatalog[config.providerId];
  const check = validateAgentConfigAgainstPolicy(config, providerInfo.modelPolicy, freeIds);
  if (check.ok) {
    return { ok: true };
  }

  const allowedText =
    check.allowlist.length > 0
      ? check.allowlist.join(', ')
      : providerInfo.modelPolicy.allowFreeModels
      ? 'model gratis (:free / free/*) atau allowlist server'
      : 'tidak ada';
  return {
    ok: false,
    model: check.model,
    allowlist: check.allowlist,
    message: `Model ini akan ditolak server pada konfigurasi sekarang (${label(config.agentId)}: "${check.model}"). Model diizinkan: ${allowedText}.`,
  };
}

export async function checkPipelineConfigsAgainstServerPolicy(
  configs: AgentModelConfig[],
  agentIds: AgentId[],
  catalogFreeMap?: Partial<Record<ProviderId, string[]>>
): Promise<
  | { ok: true }
  | { ok: false; agentId: AgentId; model: string; allowlist: string[]; message: string }
> {
  const status = await ensureProviderStatus();
  if (!status) return { ok: true };

  for (const agentId of agentIds) {
    const cfg = configs.find((c) => c.agentId === agentId);
    if (!cfg || cfg.providerId === 'mock') continue;
    const providerInfo = status.providers.find((p) => p.id === cfg.providerId);
    if (!providerInfo?.modelPolicy) continue;
    const freeIds = catalogFreeMap?.[cfg.providerId] ?? cachedFreeCatalog[cfg.providerId];
    const check = validateAgentConfigAgainstPolicy(cfg, providerInfo.modelPolicy, freeIds);
    if (!check.ok) {
      const allowedText =
        check.allowlist.length > 0
          ? check.allowlist.join(', ')
          : providerInfo.modelPolicy.allowFreeModels
          ? 'model gratis (:free / free/*) atau allowlist server'
          : 'tidak ada';
      return {
        ok: false,
        agentId,
        model: check.model,
        allowlist: check.allowlist,
        message: `Model "${check.model}" pada ${label(agentId)} akan ditolak server pada konfigurasi sekarang. Model diizinkan: ${allowedText}.`,
      };
    }
  }
  return { ok: true };
}
