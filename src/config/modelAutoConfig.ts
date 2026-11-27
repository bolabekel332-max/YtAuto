import {
  AGENT_IDS,
  type CatalogProviderId,
  MAX_TOKENS_LIMIT,
  MODEL_ID_REGEX,
  TIMEOUT_LIMIT_MS,
} from '../../shared/constants';
import type {
  ProviderModelItem,
  ProviderModelsResponse,
  ProviderStatus,
} from '../../shared/api';
import type {
  AgentId,
  AgentModelConfig,
  JsonMode,
  ProviderId,
} from '../../shared/schemas';
import { evaluateModelPolicy } from '../../shared/modelPolicy';
import {
  DEFAULT_CUSTOM_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_MOCK_MODEL,
  defaultModelForProvider,
  RECOMMENDED_AGENT_SETTINGS,
} from '../state/defaults';
import { label } from './labels';

export type AutoConfigTier = 'max' | 'balanced' | 'lite';
export type ModelCostClass = 'free' | 'paid' | 'included' | 'mock';

export interface CandidateModel {
  providerId: ProviderId;
  model: string;
  displayName: string;
  costClass: ModelCostClass;
  contextLength?: number;
  contextVerified: boolean;
  supportsSearch: boolean;
  supportsVideo: boolean;
  supportsImage: boolean;
  supportsStructuredOutput: boolean;
  promptPricePerMillion?: number;
  completionPricePerMillion?: number;
  /** 3 = flagship/reasoning, 2 = mid-tier/seimbang, 1 = ringan/cepat/free */
  capabilityClass: 1 | 2 | 3;
  fromFallbackDefault?: boolean;
}

export interface AgentAutoRecommendation {
  agentId: AgentId;
  previousConfig: AgentModelConfig;
  nextConfig: AgentModelConfig;
  changed: boolean;
  costClass: ModelCostClass;
  contextLength?: number;
  contextVerified: boolean;
  promptPricePerMillion?: number;
  reason: string;
  capabilityNote?: string;
}

export interface AutoConfigPlan {
  tier: AutoConfigTier;
  generatedAt: string;
  activeProviders: ProviderId[];
  summary: string;
  warnings: string[];
  items: AgentAutoRecommendation[];
}

export const AUTO_CONFIG_TIERS: Array<{
  id: AutoConfigTier;
  title: string;
  subtitle: string;
  strategy: string;
}> = [
  {
    id: 'max',
    title: 'Pintar Maksimal',
    subtitle: 'Flagship & penalaran mendalam',
    strategy:
      'Memprioritaskan model kelas flagship berdasarkan nama dan harga katalog (termasuk berbayar yang aktif), konteks besar bila tercantum, serta membedakan model Kepatuhan dan Penulis Naskah.',
  },
  {
    id: 'balanced',
    title: 'Menengah',
    subtitle: 'Seimbang kualitas & efisiensi',
    strategy:
      'Menempatkan model kelas menengah/besar untuk Riset, Naskah, & Kepatuhan, serta model cepat/hemat untuk Packaging, Visual, & Orkestrator.',
  },
  {
    id: 'lite',
    title: 'Biasa Aja',
    subtitle: 'Hemat biaya & respons cepat',
    strategy:
      'Mengutamakan model gratis (:free) atau berbiaya paling rendah yang tetap memenuhi syarat tiap peran agent.',
  },
];

const NON_CHAT_MODEL_RE =
  /(embed|embedding|whisper|tts|audio|lyria|moderation|rerank|dall-e|stable-diffusion|flux|midjourney|sora|veo)/i;

const FLAGSHIP_MODEL_RE =
  /(opus|o1\b|o3\b|o4\b|gpt-6|gpt-5|gpt-4\.1|claude-fable|claude-4|claude-3\.7|claude-3-7|sonnet-4|gemini-2\.5-pro|gemini-3\.1-pro|gemini-4|reasoner|deepseek-r1|deepseek-v4-pro|qwen.*max|kimi-k3\.1-pro|nemotron.*ultra|llama-3\.1-405b|405b|671b|550b|pro\b|ultra\b|large\b)/i;

const LIGHTWEIGHT_MODEL_RE =
  /(mini\b|nano\b|lite\b|flash|haiku|instant|3b\b|4b\b|7b\b|8b\b|9b\b|12b\b|small\b|gemma-2-9b)/i;

const VISION_NAME_RE =
  /(vision|\bvl\b|gpt-4o|gpt-4\.1|gpt-5|gpt-6|claude-3|claude-4|claude-opus|claude-fable|gemini|pixtral|qwen.*vl|qwen-3\.8-max|llama-3\.2.*vision|llama-4)/i;

function inferCapabilityClass(item: ProviderModelItem): 1 | 2 | 3 {
  const idAndName = `${item.id} ${item.name ?? ''}`;
  const promptPrice = item.promptPricePerMillion ?? 0;

  if (
    LIGHTWEIGHT_MODEL_RE.test(idAndName) &&
    !FLAGSHIP_MODEL_RE.test(idAndName) &&
    promptPrice < 0.8
  ) {
    return 1;
  }

  if (FLAGSHIP_MODEL_RE.test(idAndName) || promptPrice >= 1.5) {
    return 3;
  }

  if (item.isFree) {
    return (item.contextLength ?? 0) >= 64_000 ? 2 : 1;
  }

  if (promptPrice > 0 && promptPrice < 0.25) {
    return 1;
  }

  return 2;
}

function buildCandidates(
  providers: ProviderStatus[],
  catalogs: Partial<Record<CatalogProviderId, ProviderModelsResponse>>
): {
  candidates: CandidateModel[];
  unfilteredCandidates: CandidateModel[];
  skippedDisallowed: CandidateModel[];
  activeLiveProviders: ProviderId[];
} {
  const liveProviders = providers.filter((p) => p.available && p.id !== 'mock');
  const activeLiveProviders = liveProviders.map((p) => p.id);
  const rawCandidates: Array<{
    candidate: CandidateModel;
    provider: ProviderStatus;
    freeCatalogIds?: string[];
  }> = [];

  for (const p of liveProviders) {
    if (p.id === 'gemini') {
      rawCandidates.push({
        provider: p,
        candidate: {
          providerId: 'gemini',
          model: DEFAULT_GEMINI_MODEL,
          displayName: `Google Gemini (${DEFAULT_GEMINI_MODEL})`,
          costClass: 'included',
          contextLength: undefined,
          contextVerified: false,
          supportsSearch: p.capabilities.search,
          supportsVideo: p.capabilities.video,
          supportsImage: p.capabilities.image,
          supportsStructuredOutput: p.capabilities.jsonSchema,
          capabilityClass: 3,
        },
      });
      continue;
    }

    if (p.id === 'custom') {
      rawCandidates.push({
        provider: p,
        candidate: {
          providerId: 'custom',
          model: DEFAULT_CUSTOM_MODEL,
          displayName: `Provider Kustom (${DEFAULT_CUSTOM_MODEL})`,
          costClass: 'included',
          contextLength: undefined,
          contextVerified: false,
          supportsSearch: p.capabilities.search,
          supportsVideo: p.capabilities.video,
          supportsImage: p.capabilities.image,
          supportsStructuredOutput: p.capabilities.jsonSchema,
          capabilityClass: 2,
        },
      });
      continue;
    }

    if (p.id !== 'openrouter' && p.id !== 'nous' && p.id !== 'apinex') {
      continue;
    }

    const cat = catalogs[p.id];
    const validCatalogItems = (cat?.models ?? []).filter(
      (m: ProviderModelItem) => MODEL_ID_REGEX.test(m.id) && !NON_CHAT_MODEL_RE.test(m.id)
    );
    const freeCatalogIds = validCatalogItems.filter((m) => m.isFree).map((m) => m.id);

    if (validCatalogItems.length === 0) {
      const defModel = defaultModelForProvider(p.id);
      rawCandidates.push({
        provider: p,
        candidate: {
          providerId: p.id,
          model: defModel,
          displayName: `${label(p.id)} (${defModel})`,
          costClass: defModel.endsWith(':free') || defModel.startsWith('free/') ? 'free' : 'paid',
          contextLength: undefined,
          contextVerified: false,
          supportsSearch: p.capabilities.search,
          supportsVideo: p.capabilities.video,
          supportsImage: p.capabilities.image && VISION_NAME_RE.test(defModel),
          supportsStructuredOutput: p.capabilities.jsonSchema,
          capabilityClass: 2,
          fromFallbackDefault: true,
        },
      });
      continue;
    }

    for (const m of validCatalogItems) {
      const hasInputMods = Array.isArray(m.inputModalities) && m.inputModalities.length > 0;
      const supportsImage =
        p.capabilities.image &&
        (hasInputMods
          ? m.inputModalities!.includes('image')
          : VISION_NAME_RE.test(`${m.id} ${m.name ?? ''}`));
      const supportsVideo =
        p.capabilities.video || Boolean(m.inputModalities?.includes('video'));
      const hasVerifiedCtx = typeof m.contextLength === 'number' && m.contextLength > 0;

      rawCandidates.push({
        provider: p,
        freeCatalogIds,
        candidate: {
          providerId: p.id,
          model: m.id,
          displayName: m.name || m.id,
          costClass: m.isFree ? 'free' : 'paid',
          contextLength: hasVerifiedCtx ? m.contextLength : undefined,
          contextVerified: hasVerifiedCtx,
          supportsSearch: p.capabilities.search,
          supportsVideo,
          supportsImage,
          supportsStructuredOutput: m.supportsStructuredOutput ?? p.capabilities.jsonSchema,
          promptPricePerMillion: m.promptPricePerMillion,
          completionPricePerMillion: m.completionPricePerMillion,
          capabilityClass: inferCapabilityClass(m),
        },
      });
    }
  }

  const unfilteredCandidates = rawCandidates.map((entry) => entry.candidate);
  const candidates: CandidateModel[] = [];
  const skippedDisallowed: CandidateModel[] = [];

  for (const entry of rawCandidates) {
    const evalRes = evaluateModelPolicy(
      entry.provider.modelPolicy,
      entry.candidate.providerId,
      entry.candidate.model,
      entry.freeCatalogIds
    );
    if (evalRes.allowed) {
      candidates.push(entry.candidate);
    } else {
      skippedDisallowed.push(entry.candidate);
    }
  }

  if (candidates.length === 0) {
    candidates.push({
      providerId: 'mock',
      model: DEFAULT_MOCK_MODEL,
      displayName: `Simulasi Mock (${DEFAULT_MOCK_MODEL})`,
      costClass: 'mock',
      contextLength: undefined,
      contextVerified: false,
      supportsSearch: false,
      supportsVideo: false,
      supportsImage: false,
      supportsStructuredOutput: true,
      capabilityClass: 1,
    });
  }

  return { candidates, unfilteredCandidates, skippedDisallowed, activeLiveProviders };
}

const TOP_TIER_NAME_RE =
  /(claude-4|claude-3\.7|claude-3-7|claude-opus-4|claude-fable|opus|sonnet-4|gpt-6|gpt-5|gpt-4\.1(?!-mini|-nano)|o3\b|o4-mini|gemini-4|gemini-3\.1-pro|gemini-2\.5-pro|deepseek-r1|deepseek-v4-pro|qwen3-max|qwen4-max|qwen-3\.8-max|kimi-k3\.1-pro|nemotron.*ultra|hermes-4-405b|llama-3\.1-405b)/i;

const KNOWN_FAMILY_RE =
  /(anthropic\/claude|openai\/gpt-|openai\/o[134]|google\/gemini|deepseek\/|qwen\/|meta-llama\/llama-3\.[13]|meta-llama\/llama-4|mistralai\/|nousresearch\/|perplexity\/sonar|^(free\/)?(gpt-|claude-|gemini-|deepseek-|qwen-|kimi-|glm-))/i;

function computeRoleAffinityBonus(
  agentId: AgentId,
  candidate: CandidateModel
): number {
  const idAndName = `${candidate.model} ${candidate.displayName}`;
  let bonus = 0;

  // Model keluarga populer berdasarkan prefix/nama model
  if (KNOWN_FAMILY_RE.test(idAndName) || candidate.providerId === 'gemini') {
    bonus += 65;
  }
  if (TOP_TIER_NAME_RE.test(idAndName)) {
    bonus += 75;
  } else if (FLAGSHIP_MODEL_RE.test(idAndName)) {
    bonus += 35;
  }

  // Keunggulan khusus per peran agent
  if (agentId === 'researcher') {
    if (candidate.providerId === 'gemini') bonus += 110;
    if (/sonar/i.test(idAndName)) bonus += 95;
  } else if (agentId === 'style_analyst') {
    if (candidate.providerId === 'gemini') bonus += 180;
  } else if (agentId === 'scriptwriter') {
    if (/(claude|sonnet|opus|fable|gpt-4\.1|gpt-5|gpt-6|gemini-4|gemini-3\.1|qwen.*max)/i.test(idAndName)) {
      bonus += 55;
    }
  } else if (agentId === 'compliance' || agentId === 'analyst') {
    if (/(r1|o3|o4|reason|pro\b|hermes|nemotron|gpt-5|gpt-6|claude)/i.test(idAndName)) {
      bonus += 50;
    }
  } else if (agentId === 'packaging' || agentId === 'orchestrator') {
    if (/(flash|mini|sonnet|gpt-4\.1|llama-3\.3-70b|qwen)/i.test(idAndName)) {
      bonus += 45;
    }
  } else if (agentId === 'visual') {
    if (/(gemini|claude|gpt-4|gpt-5|gpt-6|qwen)/i.test(idAndName)) {
      bonus += 35;
    }
  }

  return bonus;
}

function scoreCandidateForAgent(params: {
  agentId: AgentId;
  tier: AutoConfigTier;
  candidate: CandidateModel;
  avoidSameAs?: { providerId: ProviderId; model: string };
}): number {
  const { agentId, tier, candidate, avoidSameAs } = params;
  let score = 0;

  // 1. Kesesuaian kapabilitas wajib per peran agent
  if (agentId === 'researcher') {
    score += candidate.supportsSearch ? 600 : -450;
  } else if (agentId === 'compliance') {
    score += candidate.supportsSearch ? 320 : -120;
  } else if (agentId === 'style_analyst') {
    if (candidate.supportsVideo) {
      score += 750;
    } else if (candidate.supportsImage) {
      score += 420;
    } else {
      score -= 600;
    }
  }

  if (candidate.supportsStructuredOutput) {
    score += 90;
  }

  if (candidate.fromFallbackDefault) {
    score -= 40;
  }

  score += computeRoleAffinityBonus(agentId, candidate);

  // 2. Pembobotan kecerdasan vs biaya sesuai Tier dan peran agent
  const isHeavyCreativeOrCritical =
    agentId === 'scriptwriter' ||
    agentId === 'compliance' ||
    agentId === 'researcher' ||
    agentId === 'analyst';
  const isLightweightRole =
    agentId === 'packaging' || agentId === 'orchestrator' || agentId === 'visual';

  if (tier === 'max') {
    score += candidate.capabilityClass * 160;
    if (candidate.costClass === 'paid') score += 90;
    if (candidate.costClass === 'included') score += 85;
    const ctxLen = candidate.contextLength ?? 0;
    if (ctxLen >= 128_000) score += 70;
    else if (ctxLen >= 64_000) score += 35;
    // Pada Pintar Maksimal, hindari model nano/mini untuk peran berat jika flagship tersedia
    if (isHeavyCreativeOrCritical && candidate.capabilityClass === 1) {
      score -= 140;
    }
  } else if (tier === 'balanced') {
    if (isHeavyCreativeOrCritical) {
      score += candidate.capabilityClass === 3 ? 210 : candidate.capabilityClass === 2 ? 190 : 70;
      if (candidate.costClass === 'free' || candidate.costClass === 'included') {
        score += 95;
      } else if ((candidate.promptPricePerMillion ?? 0) <= 1.5) {
        score += 70;
      } else {
        score -= 40;
      }
    } else if (isLightweightRole) {
      score += candidate.capabilityClass <= 2 ? 190 : 120;
      if (candidate.costClass === 'free') score += 160;
      else if (candidate.costClass === 'included') score += 110;
      else if ((candidate.promptPricePerMillion ?? 99) <= 0.6) score += 80;
      else score -= 90;
    } else {
      // style_analyst
      score += candidate.capabilityClass * 90;
    }
  } else {
    // tier === 'lite' (Biasa Aja: hemat biaya & cepat)
    if (candidate.costClass === 'free') score += 360;
    else if (candidate.costClass === 'included') score += 220;
    else if (candidate.costClass === 'paid') {
      const price = candidate.promptPricePerMillion ?? 5;
      score += price <= 0.3 ? 120 : -180;
    }
    score += candidate.capabilityClass === 1 ? 120 : candidate.capabilityClass === 2 ? 90 : 40;
  }

  // 3. Independensi Pemeriksa Kepatuhan vs Penulis Naskah (BP 7.4)
  if (agentId === 'compliance' && avoidSameAs && tier !== 'lite') {
    const sameModel =
      candidate.providerId === avoidSameAs.providerId && candidate.model === avoidSameAs.model;
    if (!sameModel) {
      score += 260;
    }
  }

  return score;
}

function buildReasonText(params: {
  agentId: AgentId;
  tier: AutoConfigTier;
  chosen: CandidateModel;
  avoidSameAs?: { providerId: ProviderId; model: string };
}): { reason: string; capabilityNote?: string } {
  const { agentId, tier, chosen, avoidSameAs } = params;
  const parts: string[] = [];
  let capabilityNote: string | undefined;

  if (chosen.providerId === 'mock') {
    return {
      reason: 'Mode simulasi aktif karena belum ada provider live yang terkonfigurasi di server.',
      capabilityNote: 'Hanya menghasilkan keluaran simulasi untuk uji alur kerja.',
    };
  }

  if (agentId === 'researcher') {
    if (chosen.supportsSearch) {
      parts.push('Mendukung pencarian web server dua langkah');
    } else {
      parts.push('Dipilih dari daftar model aktif berdasarkan kapabilitas & kelas harga');
      capabilityNote =
        'Provider terpilih belum mendukung pencarian web langsung; aktifkan Gemini, OpenRouter, atau APInex jika butuh grounding live.';
    }
  } else if (agentId === 'style_analyst') {
    if (chosen.supportsVideo) {
      parts.push('Mendukung analisis URL YouTube & key frame multimodal penuh');
    } else if (chosen.supportsImage) {
      parts.push('Mendukung input gambar/screenshot & key frame lokal');
      capabilityNote =
        'Tidak mendukung analisis langsung URL YouTube (butuh Google Gemini); gunakan screenshot atau upload video lokal.';
    } else {
      parts.push('Model teks dari provider aktif');
      capabilityNote =
        'Model tidak memiliki kapabilitas gambar/video; hanya cocok untuk mode Deskripsi Manual.';
    }
  } else if (agentId === 'compliance') {
    const distinctFromWriter =
      avoidSameAs &&
      (chosen.providerId !== avoidSameAs.providerId || chosen.model !== avoidSameAs.model);
    if (distinctFromWriter) {
      parts.push('Dipilih berbeda dari Penulis Naskah untuk pemisahan peran pemeriksa');
    } else {
      parts.push('Mendukung format JSON terstruktur untuk pemeriksaan kepatuhan & daftar klaim');
    }
  } else if (agentId === 'scriptwriter') {
    parts.push(
      tier === 'max'
        ? 'Dipilih dari kelas flagship/berkonteks besar berdasarkan nama & harga katalog aktif'
        : tier === 'balanced'
        ? 'Menyeimbangkan kelas menengah/besar dan harga katalog untuk penyusunan naskah'
        : 'Efisien & respons cepat untuk penyusunan naskah rutin'
    );
  } else if (agentId === 'packaging' || agentId === 'orchestrator') {
    parts.push(
      tier === 'max'
        ? 'Mendukung format keluaran JSON terstruktur untuk packaging & penggabungan hasil'
        : 'Cepat dan hemat token untuk tugas terstruktur'
    );
  } else if (agentId === 'visual') {
    parts.push('Mendukung konteks arahan visual & storyboard bertahap');
  } else if (agentId === 'analyst') {
    parts.push('Mendukung keluaran JSON terstruktur untuk merangkum tabel metrik & rencana uji');
  }

  if (chosen.costClass === 'free') {
    parts.push('Gratis (:free / $0)');
  } else if (chosen.costClass === 'paid') {
    const priceNote =
      chosen.promptPricePerMillion !== undefined
        ? `berbayar (~$${chosen.promptPricePerMillion}/1M token input)`
        : 'model berbayar dari katalog aktif';
    parts.push(priceNote);
  } else if (chosen.costClass === 'included') {
    parts.push('Menggunakan kunci server aktif');
  }

  return { reason: `${parts.join(' · ')}.`, capabilityNote };
}

function resolveJsonModeForCandidate(candidate: CandidateModel): JsonMode {
  if (candidate.providerId === 'custom') return 'json_object';
  return candidate.supportsStructuredOutput ? 'json_schema' : 'json_object';
}

function buildConfigForCandidate(
  agentId: AgentId,
  candidate: CandidateModel,
  fallbackModels: string[]
): AgentModelConfig {
  const rec = RECOMMENDED_AGENT_SETTINGS[agentId];
  const isGemini4 =
    candidate.providerId === 'gemini' && /^gemini-4-/i.test(candidate.model);

  return {
    agentId,
    providerId: candidate.providerId,
    model: candidate.model,
    fallbackModels: fallbackModels.slice(0, 2),
    temperature: isGemini4 ? null : rec.suggestedTemp,
    maxTokens: Math.min(MAX_TOKENS_LIMIT, rec.maxTokens),
    timeoutMs: Math.min(TIMEOUT_LIMIT_MS, rec.timeoutMs),
    jsonMode: resolveJsonModeForCandidate(candidate),
    useSearch: (agentId === 'researcher' || agentId === 'compliance') && candidate.supportsSearch,
    searchMode: 'two_step',
  };
}

function resolvePicksForPool(
  pool: CandidateModel[],
  tier: AutoConfigTier
): Map<AgentId, { chosen: CandidateModel; fallbacks: string[] }> {
  const pickBest = (
    agentId: AgentId,
    avoidSameAs?: { providerId: ProviderId; model: string }
  ): { chosen: CandidateModel; fallbacks: string[] } => {
    const scored = pool
      .map((candidate) => ({
        candidate,
        score: scoreCandidateForAgent({ agentId, tier, candidate, avoidSameAs }),
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.candidate.model.localeCompare(b.candidate.model);
      });

    const chosen = scored[0].candidate;
    const fallbacks = scored
      .slice(1)
      .map((s) => s.candidate)
      .filter((c) => {
        if (c.providerId !== chosen.providerId || c.model === chosen.model) return false;
        if (agentId === 'style_analyst' && !c.supportsImage && !c.supportsVideo) return false;
        return true;
      })
      .slice(0, 2)
      .map((c) => c.model);

    return { chosen, fallbacks };
  };

  // Pilih Penulis Naskah terlebih dahulu agar Kepatuhan dapat membedakan model bila memungkinkan
  const scriptPick = pickBest('scriptwriter');
  const scriptIdentity = {
    providerId: scriptPick.chosen.providerId,
    model: scriptPick.chosen.model,
  };

  const orderedForPick: AgentId[] = [
    'researcher',
    'scriptwriter',
    'visual',
    'packaging',
    'compliance',
    'orchestrator',
    'analyst',
    'style_analyst',
  ];

  const pickedByAgent = new Map<AgentId, { chosen: CandidateModel; fallbacks: string[] }>();
  pickedByAgent.set('scriptwriter', scriptPick);

  for (const agentId of orderedForPick) {
    if (agentId === 'scriptwriter') continue;
    const avoid = agentId === 'compliance' ? scriptIdentity : undefined;
    pickedByAgent.set(agentId, pickBest(agentId, avoid));
  }

  return pickedByAgent;
}

export function buildAutoConfigPlan(params: {
  tier: AutoConfigTier;
  currentConfigs: AgentModelConfig[];
  providers: ProviderStatus[];
  catalogs: Partial<Record<CatalogProviderId, ProviderModelsResponse>>;
}): AutoConfigPlan {
  const { tier, currentConfigs, providers, catalogs } = params;
  const { candidates, unfilteredCandidates, skippedDisallowed, activeLiveProviders } =
    buildCandidates(providers, catalogs);
  const currentMap = new Map(currentConfigs.map((c) => [c.agentId, c]));

  const pickedByAgent = resolvePicksForPool(candidates, tier);
  const scriptPick = pickedByAgent.get('scriptwriter')!;
  const scriptIdentity = {
    providerId: scriptPick.chosen.providerId,
    model: scriptPick.chosen.model,
  };

  const items: AgentAutoRecommendation[] = AGENT_IDS.map((agentId) => {
    const previousConfig = currentMap.get(agentId) ?? currentConfigs[0];
    const { chosen, fallbacks } = pickedByAgent.get(agentId)!;
    const nextConfig = buildConfigForCandidate(agentId, chosen, fallbacks);
    const { reason, capabilityNote } = buildReasonText({
      agentId,
      tier,
      chosen,
      avoidSameAs: agentId === 'compliance' ? scriptIdentity : undefined,
    });

    const changed =
      previousConfig.providerId !== nextConfig.providerId ||
      previousConfig.model !== nextConfig.model ||
      previousConfig.jsonMode !== nextConfig.jsonMode ||
      previousConfig.useSearch !== nextConfig.useSearch ||
      previousConfig.temperature !== nextConfig.temperature ||
      JSON.stringify(previousConfig.fallbackModels) !== JSON.stringify(nextConfig.fallbackModels);

    return {
      agentId,
      previousConfig,
      nextConfig,
      changed,
      costClass: chosen.costClass,
      contextLength: chosen.contextLength,
      contextVerified: chosen.contextVerified,
      promptPricePerMillion: chosen.promptPricePerMillion,
      reason,
      capabilityNote,
    };
  });

  const warnings: string[] = [];
  if (skippedDisallowed.length > 0) {
    const unfilteredPicks =
      unfilteredCandidates.length > 0 ? resolvePicksForPool(unfilteredCandidates, tier) : null;
    const policyChangedRecommendation = unfilteredPicks
      ? AGENT_IDS.some((agentId) => {
          const filtered = pickedByAgent.get(agentId)!;
          const unfiltered = unfilteredPicks.get(agentId)!;
          return (
            filtered.chosen.providerId !== unfiltered.chosen.providerId ||
            filtered.chosen.model !== unfiltered.chosen.model ||
            JSON.stringify(filtered.fallbacks) !== JSON.stringify(unfiltered.fallbacks)
          );
        })
      : true;

    if (policyChangedRecommendation) {
      const skippedPaidCount = skippedDisallowed.filter((c) => c.costClass === 'paid').length;
      if (skippedPaidCount > 0) {
        warnings.push(`${skippedPaidCount} model berbayar dilewati karena pembatas server.`);
      } else {
        warnings.push(`${skippedDisallowed.length} model dilewati karena pembatas server.`);
      }
    }
  }

  if (activeLiveProviders.length === 0 || candidates.every((c) => c.providerId === 'mock')) {
    warnings.push(
      'Tidak ada provider live yang aktif/diizinkan pembatas server; semua agent diarahkan ke Simulasi Mock.'
    );
  } else {
    const hasPaidCandidates = candidates.some((c) => c.costClass === 'paid');
    if (tier === 'max' && !hasPaidCandidates && !activeLiveProviders.includes('gemini')) {
      warnings.push(
        'Hanya model gratis yang terdeteksi di katalog aktif; Pintar Maksimal memilih dari daftar model gratis yang tersedia.'
      );
    }
    if (!activeLiveProviders.includes('gemini')) {
      warnings.push(
        'Google Gemini sedang nonaktif: analisis langsung URL YouTube pada Analis Gaya Visual tidak tersedia (gunakan upload screenshot/key frame).'
      );
    }
  }

  const paidCount = items.filter((i) => i.costClass === 'paid').length;
  const freeCount = items.filter((i) => i.costClass === 'free').length;
  const changedCount = items.filter((i) => i.changed).length;
  const tierInfo = AUTO_CONFIG_TIERS.find((t) => t.id === tier)!;

  const summary =
    activeLiveProviders.length === 0
      ? `Mode ${tierInfo.title} memakai Simulasi Mock (belum ada provider live aktif).`
      : `Mode ${tierInfo.title}: ${changedCount} dari ${items.length} agent diperbarui (${paidCount} berbayar, ${freeCount} gratis, ${items.length - paidCount - freeCount} bawaan server/simulasi).`;

  return {
    tier,
    generatedAt: new Date().toISOString(),
    activeProviders: activeLiveProviders.length > 0 ? activeLiveProviders : ['mock'],
    summary,
    warnings,
    items,
  };
}
