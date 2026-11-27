import type { AgentModelConfig, ProviderId } from './schemas';

export interface ModelPolicyConfig {
  restricted: boolean;
  explicit: boolean;
  allowlist: string[];
  allowFreeModels: boolean;
}

export interface ModelPolicyEvaluation {
  allowed: boolean;
  allowlist: string[];
  reason?: string;
}

export function isPatternFreeModel(providerId: ProviderId, model: string): boolean {
  const lower = model.trim().toLowerCase();
  if (!lower) return false;
  if (providerId === 'apinex') {
    return lower.startsWith('free/');
  }
  if (providerId === 'openrouter' || providerId === 'nous') {
    return lower.endsWith(':free');
  }
  return false;
}

/**
 * Fungsi murni penentu izin model bersama antara server (server/config.ts) dan klien.
 * - mock selalu diizinkan.
 * - Jika policy.restricted === false (loopback dengan allowlist env kosong), semua model diizinkan.
 * - Jika policy.explicit === true (env *_MODEL_ALLOWLIST diisi), hanya allowlist eksplisit yang diizinkan.
 * - Jika policy.restricted && !policy.explicit (non-loopback dengan allowlist env kosong),
 *   diizinkan model di allowlist efektif, pola gratis (free/* atau :free bila allowFreeModels), atau daftar catalogFree.
 */
export function evaluateModelPolicy(
  policy: ModelPolicyConfig | undefined,
  providerId: ProviderId,
  model: string,
  catalogFree?: readonly string[]
): ModelPolicyEvaluation {
  const trimmed = model.trim();

  if (providerId === 'mock') {
    return { allowed: true, allowlist: [] };
  }

  if (!policy) {
    return { allowed: true, allowlist: [] };
  }

  if (!policy.restricted) {
    return { allowed: true, allowlist: policy.allowlist };
  }

  if (policy.explicit) {
    const allowed = trimmed.length > 0 && policy.allowlist.includes(trimmed);
    return {
      allowed,
      allowlist: policy.allowlist,
      reason: allowed
        ? undefined
        : `Model "${trimmed}" untuk provider "${providerId}" tidak termasuk dalam allowlist model server (${policy.allowlist.join(', ')}).`,
    };
  }

  const inAllowlist = trimmed.length > 0 && policy.allowlist.includes(trimmed);
  const inCatalogFree = Boolean(trimmed && catalogFree?.includes(trimmed));
  const matchesFreePattern = policy.allowFreeModels && isPatternFreeModel(providerId, trimmed);
  const allowed = inAllowlist || inCatalogFree || matchesFreePattern;

  return {
    allowed,
    allowlist: policy.allowlist,
    reason: allowed
      ? undefined
      : `Model "${trimmed}" untuk provider "${providerId}" tidak termasuk dalam allowlist model server (${policy.allowlist.join(', ')}).`,
  };
}

export function validateAgentConfigAgainstPolicy(
  config: Pick<AgentModelConfig, 'agentId' | 'providerId' | 'model' | 'fallbackModels'>,
  policy: ModelPolicyConfig | undefined,
  catalogFree?: readonly string[]
): { ok: true } | { ok: false; model: string; allowlist: string[]; message: string } {
  const modelsToCheck = [config.model, ...config.fallbackModels];
  for (const m of modelsToCheck) {
    const res = evaluateModelPolicy(policy, config.providerId, m, catalogFree);
    if (!res.allowed) {
      return {
        ok: false,
        model: m,
        allowlist: res.allowlist,
        message:
          res.reason ??
          `Model "${m}" untuk provider "${config.providerId}" tidak termasuk dalam allowlist model server (${res.allowlist.join(', ')}).`,
      };
    }
  }
  return { ok: true };
}
