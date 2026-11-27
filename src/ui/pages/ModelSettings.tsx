import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  ExternalLink,
  FlaskConical,
  KeyRound,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Zap,
} from 'lucide-react';
import {
  CATALOG_PROVIDER_IDS,
  type CatalogProviderId,
  JSON_MODES,
  MAX_FALLBACKS,
  MAX_TOKENS_LIMIT,
  PROVIDER_IDS,
  SEARCH_MODES,
  TIMEOUT_LIMIT_MS,
} from '../../../shared/constants';
import type {
  NousDeviceStartResponse,
  NousOAuthStatusResponse,
  ProviderModelItem,
  ProviderModelsResponse,
  ProvidersStatusResponse,
} from '../../../shared/api';
import type {
  AgentId,
  AgentModelConfig,
  AgentResult,
  JsonMode,
  ProviderId,
  SearchMode,
} from '../../../shared/schemas';
import {
  disconnectNousOAuth,
  getNousOAuthStatus,
  getProviderModels,
  getProviderStatus,
  pollNousDeviceAuth,
  startNousDeviceAuth,
  testAgent,
  testProvider,
} from '../../api/client';
import { label } from '../../config/labels';
import {
  AUTO_CONFIG_TIERS,
  buildAutoConfigPlan,
  type AutoConfigPlan,
  type AutoConfigTier,
} from '../../config/modelAutoConfig';
import { evaluateModelPolicy } from '../../../shared/modelPolicy';
import {
  defaultModelForProvider,
  detectModelPreset,
  MODEL_PRESETS,
  RECOMMENDED_AGENT_SETTINGS,
} from '../../state/defaults';
import { checkConfigAgainstServerPolicy } from '../../state/modelPolicyGuard';
import { useStore } from '../../state/store';
import { safeExternalUrl } from '../../utils/safeUrl';
import { AutoConfigModal } from '../components/AutoConfigModal';
import { Card } from '../components/Card';
import { Tooltip } from '../components/Tooltip';
import { AgentOutput } from '../renderers/AgentOutput';

export const ModelSettings: React.FC = () => {
  const { state, dispatch } = useStore();
  const [statusData, setStatusData] = useState<ProvidersStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [providerTestMsg, setProviderTestMsg] = useState<Record<string, string>>({});
  const [testingProviderId, setTestingProviderId] = useState<ProviderId | null>(null);

  const [testingAgentId, setTestingAgentId] = useState<AgentId | null>(null);
  const [agentTestResults, setAgentTestResults] = useState<
    Partial<Record<AgentId, AgentResult>>
  >({});
  const [agentTestErrors, setAgentTestErrors] = useState<
    Partial<Record<AgentId, string>>
  >({});

  const [nousOAuth, setNousOAuth] = useState<NousOAuthStatusResponse | null>(null);
  const [nousFlow, setNousFlow] = useState<NousDeviceStartResponse | null>(null);
  const [nousStarting, setNousStarting] = useState(false);
  const [nousPollMsg, setNousPollMsg] = useState<string | null>(null);
  const [nousCopied, setNousCopied] = useState(false);

  const isCatalogProvider = (id: ProviderId): id is CatalogProviderId =>
    id === 'openrouter' || id === 'nous' || id === 'apinex';

  const [providerCatalogs, setProviderCatalogs] = useState<
    Partial<Record<CatalogProviderId, ProviderModelsResponse>>
  >({});
  const [loadingCatalog, setLoadingCatalog] = useState<
    Partial<Record<CatalogProviderId, boolean>>
  >({});
  const [catalogMsg, setCatalogMsg] = useState<Partial<Record<CatalogProviderId, string>>>({});
  const [onlyFreeByProvider, setOnlyFreeByProvider] = useState<
    Record<CatalogProviderId, boolean>
  >({
    openrouter: true,
    nous: true,
    apinex: true,
  });
  const [searchByProvider, setSearchByProvider] = useState<
    Record<CatalogProviderId, string>
  >({
    openrouter: '',
    nous: '',
    apinex: '',
  });
  const [catalogExpanded, setCatalogExpanded] = useState<
    Record<CatalogProviderId, boolean>
  >({
    openrouter: false,
    nous: false,
    apinex: false,
  });

  const [autoConfigLoadingTier, setAutoConfigLoadingTier] = useState<AutoConfigTier | null>(null);
  const [autoConfigPlan, setAutoConfigPlan] = useState<AutoConfigPlan | null>(null);
  const [undoConfigs, setUndoConfigs] = useState<AgentModelConfig[] | null>(null);
  const [lastAppliedTierLabel, setLastAppliedTierLabel] = useState<string | null>(null);
  const [autoConfigBannerMsg, setAutoConfigBannerMsg] = useState<string | null>(null);

  const loadProviderCatalog = useCallback(
    async (
      pid: CatalogProviderId,
      expandAfter = false
    ): Promise<ProviderModelsResponse | null> => {
      setLoadingCatalog((prev) => ({ ...prev, [pid]: true }));
      try {
        const res = await getProviderModels(pid);
        const models = Array.isArray(res?.models) ? res.models : [];
        const normalizedCatalog: ProviderModelsResponse = { ...res, models };
        setProviderCatalogs((prev) => ({ ...prev, [pid]: normalizedCatalog }));
        if (expandAfter) {
          setCatalogExpanded((prev) => ({ ...prev, [pid]: true }));
        }
        const freeCount = models.filter((m) => m.isFree).length;
        const catalogSummary = `${freeCount} model gratis dari ${models.length} total model aktif dimuat.`;
        setCatalogMsg((prev) => ({
          ...prev,
          [pid]: catalogSummary,
        }));
        return normalizedCatalog;
      } catch (err) {
        const catalogErrMsg =
          err instanceof Error
            ? `Gagal memuat katalog model: ${err.message}`
            : 'Gagal memuat katalog model.';
        setCatalogMsg((prev) => ({
          ...prev,
          [pid]: catalogErrMsg,
        }));
        return null;
      } finally {
        setLoadingCatalog((prev) => ({ ...prev, [pid]: false }));
      }
    },
    []
  );

  const fetchStatus = useCallback(
    async (withCatalogs = false) => {
      setLoadingStatus(true);
      setStatusError(null);
      try {
        const res = await getProviderStatus();
        setStatusData(res);
        if (res.nousOAuthEnabled !== false) {
          const oauthRes = await getNousOAuthStatus().catch(() => null);
          if (oauthRes) setNousOAuth(oauthRes);
        } else {
          setNousOAuth(null);
        }

        if (withCatalogs) {
          for (const cid of CATALOG_PROVIDER_IDS) {
            if (res.providers.some((p) => p.id === cid && p.available)) {
              void loadProviderCatalog(cid);
            }
          }
        }
      } catch (err) {
        setStatusError(
          err instanceof Error ? err.message : 'Gagal memuat status provider dari server.'
        );
      } finally {
        setLoadingStatus(false);
      }
    },
    [loadProviderCatalog]
  );

  useEffect(() => {
    void fetchStatus(true);
  }, [fetchStatus]);

  useEffect(() => {
    if (!nousFlow) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const waitMs = Math.max(5000, nousFlow.interval * 1000);

    const schedulePoll = (delayMs: number) => {
      timer = setTimeout(async () => {
        if (cancelled) return;
        try {
          const res = await pollNousDeviceAuth(nousFlow.flowId);
          if (cancelled) return;
          if (!res || typeof res !== 'object') {
            throw new Error('Respons status OAuth Nous tidak valid.');
          }
          if (res.status === 'connected') {
            setNousFlow(null);
            setNousPollMsg(res.message || 'Akun Nous Portal berhasil terhubung via OAuth.');
            void fetchStatus(true);
            return;
          }
          if (res.status === 'expired' || res.status === 'denied') {
            setNousFlow(null);
            setNousPollMsg(res.message || 'Sesi OAuth Nous Portal berakhir.');
            return;
          }
          setNousPollMsg(res.message || 'Menunggu persetujuan di Nous Portal...');
          const nextDelay = Math.max(5000, (res.interval ?? nousFlow.interval) * 1000);
          schedulePoll(nextDelay);
        } catch (err) {
          if (cancelled) return;
          setNousPollMsg(
            err instanceof Error
              ? `Kendala sementara memeriksa OAuth: ${err.message}`
              : 'Kendala memeriksa status OAuth.'
          );
          schedulePoll(waitMs);
        }
      }, delayMs);
    };

    schedulePoll(waitMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [nousFlow, fetchStatus]);

  const handleStartNousOAuth = async () => {
    setNousStarting(true);
    setNousPollMsg(null);
    setNousCopied(false);
    try {
      const started = await startNousDeviceAuth();
      setNousFlow(started);
      setNousPollMsg('Buka tautan login Nous Portal dan masukkan/setujui kode di atas.');
    } catch (err) {
      setNousPollMsg(
        err instanceof Error ? `Gagal memulai OAuth: ${err.message}` : 'Gagal memulai OAuth Nous.'
      );
    } finally {
      setNousStarting(false);
    }
  };

  const handleDisconnectNous = async () => {
    try {
      const next = await disconnectNousOAuth();
      setNousOAuth(next);
      setNousFlow(null);
      setProviderCatalogs((prev) => {
        const copy = { ...prev };
        delete copy.nous;
        return copy;
      });
      setCatalogExpanded((prev) => ({ ...prev, nous: false }));
      setNousPollMsg('Sesi OAuth Nous Portal diputuskan.');
      void fetchStatus();
    } catch (err) {
      setNousPollMsg(
        err instanceof Error ? `Gagal memutus sesi: ${err.message}` : 'Gagal memutus sesi.'
      );
    }
  };

  const applyModelToAllAgents = (providerId: CatalogProviderId, modelId: string) => {
    const nextConfigs = state.modelConfigs.map((c) => ({
      ...c,
      providerId,
      model: modelId,
      fallbackModels: [],
      jsonMode: 'json_schema' as JsonMode,
    }));
    dispatch({ type: 'SET_MODEL_CONFIGS', configs: nextConfigs });
    setCatalogMsg((prev) => ({
      ...prev,
      [providerId]: `Semua 8 agent disetel ke ${label(providerId)} (${modelId}).`,
    }));
  };

  const activePreset = detectModelPreset(state.modelConfigs);
  const geminiStatus = statusData?.providers.find((p) => p.id === 'gemini');
  const geminiMissing = geminiStatus ? !geminiStatus.keyDetected : false;

  const scriptCfg = state.modelConfigs.find((c) => c.agentId === 'scriptwriter');
  const complianceCfg = state.modelConfigs.find((c) => c.agentId === 'compliance');
  const sameCheckerAndWriter =
    scriptCfg &&
    complianceCfg &&
    scriptCfg.providerId !== 'mock' &&
    scriptCfg.providerId === complianceCfg.providerId &&
    scriptCfg.model === complianceCfg.model &&
    scriptCfg.temperature === complianceCfg.temperature;

  const handleTestProvider = async (providerId: ProviderId) => {
    setTestingProviderId(providerId);
    const matchingCfg = state.modelConfigs.find((c) => c.providerId === providerId);
    const catalogList = isCatalogProvider(providerId)
      ? providerCatalogs[providerId]?.models
      : undefined;
    const freeCatalogModel = catalogList?.find((m) => m.isFree)?.id;
    const catalogFallback =
      freeCatalogModel ?? catalogList?.[0]?.id;
    const model =
      isCatalogProvider(providerId)
        ? freeCatalogModel ?? matchingCfg?.model ?? catalogFallback ?? defaultModelForProvider(providerId)
        : matchingCfg?.model ?? catalogFallback ?? defaultModelForProvider(providerId);
    try {
      const res = await testProvider({ providerId, model });
      const msgText =
        res && typeof res.message === 'string' && res.message.length > 0
          ? res.message
          : `Koneksi ${label(providerId)} berhasil.`;
      const latencyText =
        res && typeof res.latencyMs === 'number' && Number.isFinite(res.latencyMs)
          ? ` (${Math.round(res.latencyMs)} ms)`
          : '';
      const finalMsg = `${msgText}${latencyText}`;
      setProviderTestMsg((prev) => ({
        ...prev,
        [providerId]: finalMsg,
      }));
      void fetchStatus();
    } catch (err) {
      const errMsg =
        err instanceof Error ? `Gagal: ${err.message}` : 'Gagal menguji koneksi provider.';
      setProviderTestMsg((prev) => ({
        ...prev,
        [providerId]: errMsg,
      }));
    } finally {
      setTestingProviderId(null);
    }
  };

  const handleTestAgent = async (cfg: AgentModelConfig) => {
    setTestingAgentId(cfg.agentId);
    setAgentTestErrors((prev) => ({ ...prev, [cfg.agentId]: undefined }));
    try {
      const catalogFreeMap: Partial<Record<ProviderId, string[]>> = {};
      for (const cid of CATALOG_PROVIDER_IDS) {
        const list = providerCatalogs[cid]?.models;
        if (list) {
          catalogFreeMap[cid] = list.filter((m) => m.isFree).map((m) => m.id);
        }
      }
      const guard = await checkConfigAgainstServerPolicy(cfg, catalogFreeMap);
      if (!guard.ok) {
        setAgentTestErrors((prev) => ({
          ...prev,
          [cfg.agentId]: guard.message,
        }));
        return;
      }

      const result = await testAgent({
        agentId: cfg.agentId,
        mode: 'default',
        profile: state.profile,
        knowledge: state.knowledge,
        config: cfg,
      });
      if (!result || typeof result !== 'object') {
        throw new Error('Respons hasil tes agent dari server tidak valid.');
      }
      setAgentTestResults((prev) => ({ ...prev, [cfg.agentId]: result }));
      void fetchStatus();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Tes agent gagal.';
      setAgentTestErrors((prev) => ({
        ...prev,
        [cfg.agentId]: errMsg,
      }));
    } finally {
      setTestingAgentId(null);
    }
  };

  const handleOpenAutoConfig = async (tier: AutoConfigTier) => {
    setAutoConfigLoadingTier(tier);
    setAutoConfigBannerMsg(null);
    try {
      let currentStatus = statusData;
      if (!currentStatus) {
        currentStatus = await getProviderStatus();
        setStatusData(currentStatus);
      }

      const latestCatalogs: Partial<Record<CatalogProviderId, ProviderModelsResponse>> = {
        ...providerCatalogs,
      };
      const toFetch = CATALOG_PROVIDER_IDS.filter((pid) => {
        const providerAvailable = currentStatus?.providers.some(
          (p) => p.id === pid && p.available
        );
        return Boolean(providerAvailable && !latestCatalogs[pid]);
      });

      if (toFetch.length > 0) {
        const loaded = await Promise.all(
          toFetch.map(async (pid) => ({
            pid,
            catalog: await loadProviderCatalog(pid, false),
          }))
        );
        for (const entry of loaded) {
          if (entry.catalog) {
            latestCatalogs[entry.pid] = entry.catalog;
          }
        }
      }

      const plan = buildAutoConfigPlan({
        tier,
        currentConfigs: state.modelConfigs,
        providers: currentStatus.providers,
        catalogs: latestCatalogs,
      });
      setAutoConfigPlan(plan);
    } catch (err) {
      setAutoConfigBannerMsg(
        err instanceof Error
          ? `Gagal menyusun pratinjau auto-konfigurasi: ${err.message}`
          : 'Gagal menyusun pratinjau auto-konfigurasi.'
      );
    } finally {
      setAutoConfigLoadingTier(null);
    }
  };

  const handleApplyAutoConfig = (selectedAgentIds: AgentId[]) => {
    if (!autoConfigPlan) return;
    const selectedSet = new Set(selectedAgentIds);
    const recommendationMap = new Map(
      autoConfigPlan.items.map((item) => [item.agentId, item.nextConfig])
    );
    const previousSnapshot = state.modelConfigs.map((cfg) => ({
      ...cfg,
      fallbackModels: [...cfg.fallbackModels],
    }));

    const nextConfigs = state.modelConfigs.map((cfg) => {
      if (!selectedSet.has(cfg.agentId)) return cfg;
      return recommendationMap.get(cfg.agentId) ?? cfg;
    });

    const tierInfo = AUTO_CONFIG_TIERS.find((t) => t.id === autoConfigPlan.tier);
    setUndoConfigs(previousSnapshot);
    setLastAppliedTierLabel(tierInfo?.title ?? autoConfigPlan.tier);
    setAutoConfigBannerMsg(
      `Konfigurasi mode ${tierInfo?.title ?? autoConfigPlan.tier} diterapkan ke ${selectedAgentIds.length} agent.`
    );
    dispatch({ type: 'SET_MODEL_CONFIGS', configs: nextConfigs });
    setAutoConfigPlan(null);
  };

  const handleUndoAutoConfig = () => {
    if (!undoConfigs) return;
    dispatch({ type: 'SET_MODEL_CONFIGS', configs: undoConfigs });
    setAutoConfigBannerMsg(
      `Perubahan auto-konfigurasi (${lastAppliedTierLabel ?? 'terakhir'}) dibatalkan dan setelan sebelumnya dipulihkan.`
    );
    setUndoConfigs(null);
    setLastAppliedTierLabel(null);
  };

  return (
    <div className="space-y-6">
      {/* Rekomendasi Semua Mock saat GEMINI_API_KEY belum ada */}
      {geminiMissing && activePreset !== 'all_mock' && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-950/60 px-4 py-3.5 text-xs text-amber-100"
        >
          <div className="flex items-start gap-2.5 flex-1">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
            <div>
              <p className="font-semibold">Kunci API Gemini Tidak Terdeteksi di Server</p>
              <p className="mt-0.5 opacity-90">
                Aktifkan preset <strong>Semua Mock</strong> untuk mencoba seluruh alur kerja dan simulasi pipeline tanpa kunci API eksternal.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              dispatch({ type: 'SET_MODEL_CONFIGS', configs: MODEL_PRESETS.all_mock() })
            }
            className="rounded-lg bg-amber-400 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-300 shrink-0"
          >
            Aktifkan Preset Semua Mock
          </button>
        </div>
      )}

      {/* Peringatan Pemeriksa Kepatuhan vs Penulis Naskah Identik (BP 7.4) */}
      {sameCheckerAndWriter && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-sky-500/40 bg-sky-950/40 px-4 py-3 text-xs text-sky-100"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
          <p>
            <strong>Catatan Independensi Evaluasi:</strong> Agent <em>Kepatuhan</em> dan <em>Penulis Naskah</em> memakai provider, model, dan temperature yang persis sama. Pertimbangkan membedakan model atau temperature Kepatuhan agar tinjauan lebih kritis.
          </p>
        </div>
      )}

      {/* Ringkasan Status Provider & Kuota Harian */}
      <Card
        title="Status Provider Server & Kuota Harian"
        description="Kunci API dikelola hanya melalui environment server (.env / Secrets) dan tidak pernah dikirim ke browser."
        tooltip="Klik 'Tes Koneksi' pada provider untuk mengirim ping minimal tanpa memanggil pipeline lengkap."
        headerAction={
          <div className="flex items-center gap-3">
            {statusData && (
              <span className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1 font-mono text-xs text-slate-200 tabular-nums">
                Panggilan Hari Ini: {statusData.dailyCallsUsed}/{statusData.dailyCallCap}
              </span>
            )}
            <button
              type="button"
              disabled={loadingStatus}
              onClick={() => void fetchStatus(false)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loadingStatus ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Segarkan</span>
            </button>
          </div>
        }
      >
        {statusError && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-rose-500/40 bg-rose-950/60 px-4 py-3 text-xs text-rose-200"
          >
            {statusError}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {(statusData?.providers ?? []).map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {p.id === 'mock' ? (
                    <FlaskConical className="h-4 w-4 text-amber-400" aria-hidden="true" />
                  ) : (
                    <Cpu className="h-4 w-4 text-sky-400" aria-hidden="true" />
                  )}
                  <h3 className="text-sm font-semibold text-slate-100">{p.name}</h3>
                </div>
                <span
                  className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
                    p.available
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-slate-700 bg-slate-900 text-slate-400'
                  }`}
                >
                  {p.available ? 'Tersedia' : 'Tidak Tersedia'}
                </span>
              </div>

              <p className="text-xs text-slate-300">{p.statusNote}</p>

              <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-400">
                {p.capabilities.jsonSchema && (
                  <span className="rounded bg-slate-900 px-2 py-0.5">Skema JSON</span>
                )}
                {p.capabilities.search && (
                  <span className="rounded bg-slate-900 px-2 py-0.5">Pencarian Web</span>
                )}
                {p.capabilities.image && (
                  <span className="rounded bg-slate-900 px-2 py-0.5">Gambar/Frame</span>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!p.available || testingProviderId === p.id}
                    onClick={() => handleTestProvider(p.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  >
                    {testingProviderId === p.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Zap className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                    )}
                    <span>Tes Koneksi</span>
                  </button>

                  {p.id === 'nous' && !nousFlow && (
                    <button
                      type="button"
                      disabled={nousStarting || statusData?.nousOAuthEnabled === false}
                      onClick={handleStartNousOAuth}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-500/25 disabled:opacity-50"
                    >
                      {nousStarting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span>
                        {nousOAuth?.authMethod === 'oauth'
                          ? 'Login Ulang OAuth'
                          : 'Hubungkan via OAuth Nous'}
                      </span>
                    </button>
                  )}

                  {isCatalogProvider(p.id) && p.available && (() => {
                    const pid = p.id;
                    return (
                      <button
                        type="button"
                        disabled={Boolean(loadingCatalog[pid])}
                        onClick={() => {
                          if (providerCatalogs[pid] && catalogExpanded[pid]) {
                            void loadProviderCatalog(pid, true);
                          } else if (providerCatalogs[pid]) {
                            setCatalogExpanded((prev) => ({ ...prev, [pid]: true }));
                          } else {
                            void loadProviderCatalog(pid, true);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                      >
                        {loadingCatalog[pid] ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                        )}
                        <span>
                          {providerCatalogs[pid]
                            ? catalogExpanded[pid]
                              ? 'Perbarui Model'
                              : 'Pilih Model Gratis'
                            : 'Muat Model Gratis'}
                        </span>
                      </button>
                    );
                  })()}

                  {p.id === 'nous' && nousOAuth?.authMethod === 'oauth' && (
                    <button
                      type="button"
                      onClick={handleDisconnectNous}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-950/70"
                    >
                      <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Putuskan</span>
                    </button>
                  )}
                </div>
              </div>

              {p.id === 'nous' && nousFlow && (
                <div className="rounded-lg border border-sky-500/40 bg-sky-950/40 p-3 space-y-2 text-xs text-sky-100">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">Kode Verifikasi Perangkat:</span>
                    <div className="flex items-center gap-1.5">
                      <code className="rounded border border-sky-400/40 bg-slate-950 px-2.5 py-1 font-mono text-sm font-bold tracking-wider text-sky-200">
                        {nousFlow.userCode}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(nousFlow.userCode);
                          setNousCopied(true);
                        }}
                        className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
                      >
                        {nousCopied ? (
                          <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
                        ) : (
                          <Copy className="h-3 w-3" aria-hidden="true" />
                        )}
                        <span>{nousCopied ? 'Disalin' : 'Salin'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {(() => {
                      const safeNousHref = safeExternalUrl(nousFlow.verificationUriComplete);
                      return safeNousHref ? (
                        <a
                          href={safeNousHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-300"
                        >
                          <span>Buka Login Nous Portal</span>
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="text-xs text-rose-300">
                          URL login Nous tidak valid.
                        </span>
                      );
                    })()}
                    <button
                      type="button"
                      onClick={() => {
                        setNousFlow(null);
                        setNousPollMsg('Proses OAuth Nous dibatalkan.');
                      }}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}

              {p.id === 'nous' && statusData?.nousOAuthEnabled === false && (
                <p className="text-[11px] text-slate-400">
                  OAuth Nous dinonaktifkan sementara pada HOST non-loopback (atur ENABLE_NOUS_OAUTH=true bila server dilindungi gateway akses).
                </p>
              )}

              {p.id === 'nous' && nousPollMsg && (
                <p className="text-[11px] text-amber-200">{nousPollMsg}</p>
              )}

              {isCatalogProvider(p.id) &&
                catalogMsg[p.id] && (
                  <p className="text-[11px] text-emerald-300/90">
                    {catalogMsg[p.id]}
                  </p>
                )}

              {isCatalogProvider(p.id) &&
                catalogExpanded[p.id] &&
                providerCatalogs[p.id] && (() => {
                  const pid = p.id;
                  const cat = providerCatalogs[pid]!;
                  const onlyFree = onlyFreeByProvider[pid];
                  const q = searchByProvider[pid].trim().toLowerCase();
                  const filtered = cat.models.filter((m) => {
                    if (onlyFree && !m.isFree) return false;
                    if (q && !m.id.toLowerCase().includes(q) && !(m.name ?? '').toLowerCase().includes(q)) {
                      return false;
                    }
                    return true;
                  });
                  const freeCount = cat.models.filter((m) => m.isFree).length;

                  return (
                    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-slate-200">
                            Katalog Model Live ({freeCount} Gratis / {cat.models.length} Total)
                          </span>
                          <Tooltip
                            text="Daftar diambil langsung dari server provider sehingga model :free baru muncul otomatis setiap diperbarui."
                            label={`Panduan katalog model ${p.name}`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setCatalogExpanded((prev) => ({ ...prev, [pid]: false }))
                          }
                          className="text-[11px] text-slate-400 hover:text-slate-200"
                        >
                          Tutup
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-200">
                          <input
                            type="checkbox"
                            checked={onlyFree}
                            onChange={(e) =>
                              setOnlyFreeByProvider((prev) => ({
                                ...prev,
                                [pid]: e.target.checked,
                              }))
                            }
                            className="h-3.5 w-3.5 accent-emerald-400"
                          />
                          <span>Hanya Model Gratis (:free)</span>
                        </label>
                        <input
                          type="text"
                          aria-label={`Cari ID model ${label(pid)}`}
                          value={searchByProvider[pid]}
                          onChange={(e) =>
                            setSearchByProvider((prev) => ({ ...prev, [pid]: e.target.value }))
                          }
                          placeholder="Cari ID model..."
                          className="flex-1 min-w-[140px] rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-[11px] text-slate-100"
                        />
                      </div>

                      {filtered.length === 0 ? (
                        <p className="text-[11px] text-slate-400">
                          Tidak ada model yang cocok dengan filter saat ini.
                        </p>
                      ) : (
                        <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                          {filtered.slice(0, 80).map((m: ProviderModelItem) => (
                            <div
                              key={m.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/90 px-2.5 py-1.5"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="truncate font-mono text-[11px] text-slate-100">
                                  {m.id}
                                </span>
                                {m.isFree && (
                                  <span className="shrink-0 rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                                    Gratis
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => applyModelToAllAgents(pid, m.id)}
                                  className="rounded border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-200 hover:bg-sky-500/25"
                                >
                                  Pakai Semua Agent
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void navigator.clipboard?.writeText(m.id);
                                    setCatalogMsg((prev) => ({
                                      ...prev,
                                      [pid]: `ID model "${m.id}" disalin ke clipboard.`,
                                    }));
                                  }}
                                  className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800"
                                >
                                  Salin
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

              {providerTestMsg[p.id] && (
                <p className="text-[11px] text-sky-200 font-mono">
                  {providerTestMsg[p.id]}
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Auto-Konfigurasi Model Cerdas */}
      <Card
        title="Auto-Konfigurasi Model Cerdas"
        description="Pilih tingkat kecerdasan model untuk membagi 8 agent secara otomatis berdasarkan provider aktif (termasuk model berbayar maupun gratis yang relevan), lalu tinjau hasilnya sebelum diterapkan."
        tooltip="Sistem mencocokkan syarat tiap agent (Pencarian Web untuk Periset, multimodal untuk Analis Gaya Visual, serta pemisahan model Kepatuhan vs Penulis Naskah) dengan daftar model aktif di server."
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {AUTO_CONFIG_TIERS.map((tier) => {
              const isLoadingThisTier = autoConfigLoadingTier === tier.id;
              return (
                <button
                  key={tier.id}
                  type="button"
                  disabled={autoConfigLoadingTier !== null}
                  onClick={() => void handleOpenAutoConfig(tier.id)}
                  className="flex flex-col items-start justify-between gap-2 rounded-xl border border-slate-700/90 bg-slate-950/80 p-4 text-left transition-colors hover:border-sky-500/60 hover:bg-slate-900 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-100">{tier.title}</span>
                    {isLoadingThisTier ? (
                      <Loader2 className="h-4 w-4 animate-spin text-sky-400" aria-hidden="true" />
                    ) : (
                      <SlidersHorizontal className="h-4 w-4 text-sky-400" aria-hidden="true" />
                    )}
                  </div>
                  <span className="text-xs font-medium text-sky-300">{tier.subtitle}</span>
                  <p className="text-[11px] leading-relaxed text-slate-400">{tier.strategy}</p>
                  <span className="pt-1 text-[11px] font-semibold text-sky-200">
                    {isLoadingThisTier ? 'Menyusun pratinjau...' : 'Buat Pratinjau Konfigurasi →'}
                  </span>
                </button>
              );
            })}
          </div>

          {autoConfigBannerMsg && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-2.5 text-xs text-emerald-100"
            >
              <span>{autoConfigBannerMsg}</span>
              {undoConfigs && (
                <button
                  type="button"
                  onClick={handleUndoAutoConfig}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/50 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Batalkan Perubahan Terakhir (Undo)</span>
                </button>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Preset Cepat Provider Semua Agent */}
      <Card
        title="Preset Cepat Konfigurasi Model"
        description="Alihkan seluruh 8 agent ke Gemini atau Mode Simulasi Mock dalam satu klik."
        tooltip="Status 'Campuran' muncul secara otomatis bila Anda mengubah provider salah satu agent secara individu."
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                dispatch({ type: 'SET_MODEL_CONFIGS', configs: MODEL_PRESETS.all_gemini() })
              }
              className={`rounded-lg border px-4 py-2 text-xs font-semibold transition-colors ${
                activePreset === 'all_gemini'
                  ? 'border-sky-500/60 bg-sky-500/20 text-sky-200'
                  : 'border-slate-700 bg-slate-950 text-slate-300 hover:text-white'
              }`}
            >
              Semua Gemini
            </button>
            <button
              type="button"
              onClick={() =>
                dispatch({ type: 'SET_MODEL_CONFIGS', configs: MODEL_PRESETS.all_mock() })
              }
              className={`rounded-lg border px-4 py-2 text-xs font-semibold transition-colors ${
                activePreset === 'all_mock'
                  ? 'border-amber-500/60 bg-amber-500/20 text-amber-200'
                  : 'border-slate-700 bg-slate-950 text-slate-300 hover:text-white'
              }`}
            >
              Semua Mock (Simulasi)
            </button>
          </div>

          <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
            <CheckCircle2 className="h-4 w-4 text-sky-400" aria-hidden="true" />
            <span>
              Mode Aktif:{' '}
              <strong>
                {activePreset === 'all_gemini'
                  ? 'Semua Gemini'
                  : activePreset === 'all_mock'
                  ? 'Semua Mock'
                  : 'Campuran'}
              </strong>
            </span>
          </span>
        </div>
      </Card>

      {/* Konfigurasi Per Agent */}
      <div className="space-y-4">
        {state.modelConfigs.map((cfg) => {
          const rec = RECOMMENDED_AGENT_SETTINGS[cfg.agentId];
          const testResult = agentTestResults[cfg.agentId];
          const testErr = agentTestErrors[cfg.agentId];
          const supportsSearch =
            cfg.agentId === 'researcher' || cfg.agentId === 'compliance';
          const providerInfo = statusData?.providers.find((p) => p.id === cfg.providerId);
          const freeCatalogIds = isCatalogProvider(cfg.providerId)
            ? providerCatalogs[cfg.providerId]?.models
                .filter((m) => m.isFree)
                .map((m) => m.id)
            : undefined;
          const agentWarnings: string[] = [];
          if (providerInfo && !providerInfo.available) {
            agentWarnings.push(
              `Provider ${providerInfo.name} belum tersedia di server (${providerInfo.statusNote}). Ubah provider atau lengkapi environment server.`
            );
          }
          if (providerInfo?.modelPolicy) {
            const modelsToVerify = Array.from(
              new Set([cfg.model, ...cfg.fallbackModels].filter((m) => m.trim().length > 0))
            );
            for (const candidateModel of modelsToVerify) {
              const policyEval = evaluateModelPolicy(
                providerInfo.modelPolicy,
                cfg.providerId,
                candidateModel,
                freeCatalogIds
              );
              if (!policyEval.allowed) {
                const allowedText =
                  policyEval.allowlist.length > 0
                    ? policyEval.allowlist.join(', ')
                    : providerInfo.modelPolicy.allowFreeModels
                    ? 'model gratis (:free / free/*)'
                    : 'lihat kebijakan server';
                agentWarnings.push(
                  `Model ini akan ditolak server pada konfigurasi sekarang ("${candidateModel}" tidak diizinkan). Model diizinkan: ${allowedText}.`
                );
              }
            }
          }
          if (supportsSearch && cfg.useSearch && providerInfo && !providerInfo.capabilities.search) {
            agentWarnings.push(
              `Pencarian Web aktif, tetapi ${providerInfo.name} tidak mendukung pencarian web langsung. Nonaktifkan Pencarian Web atau pilih Gemini / OpenRouter / APInex.`
            );
          }
          if (cfg.agentId === 'style_analyst' && providerInfo) {
            if (!providerInfo.capabilities.image) {
              agentWarnings.push(
                `${providerInfo.name} tidak mendukung input Gambar/Frame untuk analisis screenshot atau video lokal. Gunakan Deskripsi Manual atau alihkan ke Gemini / OpenRouter / APInex.`
              );
            } else if (!providerInfo.capabilities.video) {
              agentWarnings.push(
                `${providerInfo.name} mendukung Gambar/Frame, tetapi tidak memproses Link YouTube langsung tanpa catatan teks. Untuk analisis Link YouTube penuh, gunakan Gemini.`
              );
            }
          }

          return (
            <Card
              key={cfg.agentId}
              title={label(cfg.agentId)}
              description={`Provider aktif: ${label(cfg.providerId)} · Model: ${cfg.model}`}
              headerAction={
                <button
                  type="button"
                  disabled={testingAgentId === cfg.agentId}
                  onClick={() => handleTestAgent(cfg)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/20 disabled:opacity-60"
                >
                  {testingAgentId === cfg.agentId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>Tes Agent Ini</span>
                </button>
              }
            >
              <div className="space-y-4">
                {agentWarnings.length > 0 && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-950/40 px-3.5 py-2.5 text-xs text-amber-100"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                    <ul className="space-y-1 list-disc list-inside">
                      {agentWarnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Provider */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label
                        htmlFor={`ms-${cfg.agentId}-provider`}
                        className="text-xs font-medium text-slate-200"
                      >
                        Provider
                      </label>
                      <Tooltip
                        text="Pilih mesin AI untuk agent ini. Gunakan Mock untuk menguji tanpa kunci API."
                        label={`Panduan provider ${label(cfg.agentId)}`}
                      />
                    </div>
                    <select
                      id={`ms-${cfg.agentId}-provider`}
                      value={cfg.providerId}
                      onChange={(e) => {
                        const nextProvider = e.target.value as ProviderId;
                        dispatch({
                          type: 'UPDATE_MODEL_CONFIG',
                          agentId: cfg.agentId,
                          patch: {
                            providerId: nextProvider,
                            model: defaultModelForProvider(nextProvider),
                            fallbackModels: [],
                            jsonMode:
                              nextProvider === 'custom' ? 'json_object' : 'json_schema',
                          },
                        });
                      }}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                    >
                      {PROVIDER_IDS.map((pid) => (
                        <option key={pid} value={pid}>
                          {label(pid)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Model ID */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label
                        htmlFor={`ms-${cfg.agentId}-model`}
                        className="text-xs font-medium text-slate-200"
                      >
                        ID Model
                      </label>
                      <Tooltip
                        text="Ketik ID model atau pilih cepat dari katalog live (model gratis :free otomatis didahulukan)."
                        label={`Panduan model ${label(cfg.agentId)}`}
                      />
                    </div>
                    <input
                      id={`ms-${cfg.agentId}-model`}
                      type="text"
                      value={cfg.model}
                      onChange={(e) =>
                        dispatch({
                          type: 'UPDATE_MODEL_CONFIG',
                          agentId: cfg.agentId,
                          patch: { model: e.target.value },
                        })
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
                    />
                    {isCatalogProvider(cfg.providerId) &&
                      providerCatalogs[cfg.providerId] && (() => {
                        const catalogModels = providerCatalogs[cfg.providerId as CatalogProviderId]!.models;
                        const freeList = catalogModels.filter((m) => m.isFree);
                        const paidList = catalogModels.filter((m) => !m.isFree).slice(0, 60);
                        return (
                          <select
                            aria-label={`Pilih cepat model ${label(cfg.agentId)}`}
                            value={catalogModels.some((m) => m.id === cfg.model) ? cfg.model : ''}
                            onChange={(e) => {
                              if (e.target.value) {
                                dispatch({
                                  type: 'UPDATE_MODEL_CONFIG',
                                  agentId: cfg.agentId,
                                  patch: { model: e.target.value },
                                });
                              }
                            }}
                            className="mt-1.5 w-full rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 font-mono text-[11px] text-slate-200"
                          >
                            <option value="">-- Pilih cepat dari katalog live --</option>
                            {freeList.length > 0 && (
                              <optgroup label={`Model Gratis (${freeList.length})`}>
                                {freeList.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    [GRATIS] {m.id}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {paidList.length > 0 && (
                              <optgroup label="Model Lainnya">
                                {paidList.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.id}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        );
                      })()}
                  </div>

                  {/* Mode JSON */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label
                        htmlFor={`ms-${cfg.agentId}-jsonMode`}
                        className="text-xs font-medium text-slate-200"
                      >
                        Mode JSON
                      </label>
                      <Tooltip
                        text="Skema JSON Ketat paling aman menjaga struktur output tetap valid."
                        label={`Panduan JSON ${label(cfg.agentId)}`}
                      />
                    </div>
                    <select
                      id={`ms-${cfg.agentId}-jsonMode`}
                      value={cfg.jsonMode}
                      onChange={(e) =>
                        dispatch({
                          type: 'UPDATE_MODEL_CONFIG',
                          agentId: cfg.agentId,
                          patch: { jsonMode: e.target.value as JsonMode },
                        })
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                    >
                      {JSON_MODES.map((jm) => (
                        <option key={jm} value={jm}>
                          {label(jm)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Temperature Nullable */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label
                        htmlFor={`ms-${cfg.agentId}-tempNull`}
                        className="text-xs font-medium text-slate-200"
                      >
                        Temperature
                      </label>
                      <Tooltip
                        text={`Usulan referensi non-Gemini: ${rec.suggestedTemp}. Untuk Gemini 4 disarankan dibiarkan 'Bawaan model' (null).`}
                        label={`Panduan temperature ${label(cfg.agentId)}`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 text-[11px] text-slate-300">
                        <input
                          id={`ms-${cfg.agentId}-tempNull`}
                          type="checkbox"
                          checked={cfg.temperature === null}
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_MODEL_CONFIG',
                              agentId: cfg.agentId,
                              patch: {
                                temperature: e.target.checked ? null : rec.suggestedTemp,
                              },
                            })
                          }
                          className="h-3.5 w-3.5 accent-sky-400"
                        />
                        <span>Bawaan model (null)</span>
                      </label>
                      {cfg.temperature !== null && (
                        <input
                          type="number"
                          aria-label={`Nilai temperature ${label(cfg.agentId)}`}
                          min={0}
                          max={2}
                          step={0.1}
                          value={cfg.temperature}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (Number.isFinite(val)) {
                              dispatch({
                                type: 'UPDATE_MODEL_CONFIG',
                                agentId: cfg.agentId,
                                patch: {
                                  temperature: Math.max(0, Math.min(2, val)),
                                },
                              });
                            }
                          }}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-xs text-slate-100 tabular-nums"
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Baris kedua: MaxTokens, Timeout, Pencarian Web */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label
                      htmlFor={`ms-${cfg.agentId}-maxTokens`}
                      className="block text-xs font-medium text-slate-200 mb-1"
                    >
                      Max Tokens (128–{MAX_TOKENS_LIMIT})
                    </label>
                    <input
                      id={`ms-${cfg.agentId}-maxTokens`}
                      type="number"
                      min={128}
                      max={MAX_TOKENS_LIMIT}
                      step={128}
                      value={cfg.maxTokens}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (Number.isFinite(val)) {
                          dispatch({
                            type: 'UPDATE_MODEL_CONFIG',
                            agentId: cfg.agentId,
                            patch: {
                              maxTokens: Math.max(
                                128,
                                Math.min(MAX_TOKENS_LIMIT, Math.round(val))
                              ),
                            },
                          });
                        }
                      }}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-xs text-slate-100 tabular-nums"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`ms-${cfg.agentId}-timeoutMs`}
                      className="block text-xs font-medium text-slate-200 mb-1"
                    >
                      Timeout (ms, maks {TIMEOUT_LIMIT_MS})
                    </label>
                    <input
                      id={`ms-${cfg.agentId}-timeoutMs`}
                      type="number"
                      min={1000}
                      max={TIMEOUT_LIMIT_MS}
                      step={1000}
                      value={cfg.timeoutMs}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (Number.isFinite(val)) {
                          dispatch({
                            type: 'UPDATE_MODEL_CONFIG',
                            agentId: cfg.agentId,
                            patch: {
                              timeoutMs: Math.max(
                                1000,
                                Math.min(TIMEOUT_LIMIT_MS, Math.round(val))
                              ),
                            },
                          });
                        }
                      }}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-xs text-slate-100 tabular-nums"
                    />
                  </div>

                  {supportsSearch && (
                    <>
                      <div className="flex items-center pt-4">
                        <label className="flex items-center gap-2 text-xs text-slate-200">
                          <input
                            type="checkbox"
                            checked={cfg.useSearch}
                            onChange={(e) =>
                              dispatch({
                                type: 'UPDATE_MODEL_CONFIG',
                                agentId: cfg.agentId,
                                patch: { useSearch: e.target.checked },
                              })
                            }
                            className="h-4 w-4 accent-sky-400"
                          />
                          <span>Aktifkan Pencarian Web</span>
                        </label>
                      </div>

                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <label
                            htmlFor={`ms-${cfg.agentId}-searchMode`}
                            className="text-xs font-medium text-slate-200"
                          >
                            Mode Pencarian
                          </label>
                          <Tooltip
                            text="Dua Langkah (disarankan) melakukan pencarian fakta terlebih dahulu lalu menyusun JSON ketat agar tidak gagal validasi."
                            label="Panduan Mode Pencarian"
                          />
                        </div>
                        <select
                          id={`ms-${cfg.agentId}-searchMode`}
                          disabled={!cfg.useSearch}
                          value={cfg.searchMode}
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_MODEL_CONFIG',
                              agentId: cfg.agentId,
                              patch: { searchMode: e.target.value as SearchMode },
                            })
                          }
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 disabled:opacity-50"
                        >
                          {SEARCH_MODES.map((sm) => (
                            <option key={sm} value={sm}>
                              {label(sm)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>

                {/* Fallback Models (Maks 3, provider sama) */}
                <div className="space-y-2 border-t border-slate-800/80 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-slate-300">
                        Model Cadangan Provider Sama ({cfg.fallbackModels.length}/{MAX_FALLBACKS})
                      </span>
                      <Tooltip
                        text="Jika model utama mengalami error sementara atau limit kecepatan, server otomatis mencoba model cadangan berurutan."
                        label="Panduan Model Cadangan"
                      />
                    </div>
                    {cfg.fallbackModels.length < MAX_FALLBACKS && (
                      <button
                        type="button"
                        onClick={() => {
                          const cat = isCatalogProvider(cfg.providerId)
                            ? providerCatalogs[cfg.providerId]?.models
                            : undefined;
                          const nextFree = cat?.find(
                            (m) =>
                              m.isFree &&
                              m.id !== cfg.model &&
                              !cfg.fallbackModels.includes(m.id)
                          );
                          dispatch({
                            type: 'UPDATE_MODEL_CONFIG',
                            agentId: cfg.agentId,
                            patch: {
                              fallbackModels: [
                                ...cfg.fallbackModels,
                                nextFree?.id ?? cfg.model,
                              ],
                            },
                          });
                        }}
                        className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-800"
                      >
                        <Plus className="h-3 w-3" aria-hidden="true" />
                        <span>Tambah Cadangan</span>
                      </button>
                    )}
                  </div>

                  {cfg.fallbackModels.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-3">
                      {cfg.fallbackModels.map((fb, idx) => (
                        <div key={`fb-${idx}`} className="flex items-center gap-1.5">
                          <input
                            type="text"
                            aria-label={`Model cadangan ${idx + 1} untuk ${label(cfg.agentId)}`}
                            value={fb}
                            onChange={(e) => {
                              const next = [...cfg.fallbackModels];
                              next[idx] = e.target.value;
                              dispatch({
                                type: 'UPDATE_MODEL_CONFIG',
                                agentId: cfg.agentId,
                                patch: { fallbackModels: next },
                              });
                            }}
                            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-slate-100"
                          />
                          <button
                            type="button"
                            aria-label={`Hapus model cadangan ${idx + 1}`}
                            onClick={() =>
                              dispatch({
                                type: 'UPDATE_MODEL_CONFIG',
                                agentId: cfg.agentId,
                                patch: {
                                  fallbackModels: cfg.fallbackModels.filter(
                                    (_, i) => i !== idx
                                  ),
                                },
                              })
                            }
                            className="rounded border border-slate-700 bg-slate-900 p-1.5 text-slate-400 hover:text-rose-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {testErr && (
                  <div
                    role="alert"
                    className="rounded-xl border border-rose-500/40 bg-rose-950/60 px-4 py-3 text-xs text-rose-200"
                  >
                    {testErr}
                  </div>
                )}

                {testResult && (
                  <div className="border-t border-slate-800/80 pt-4 space-y-2">
                    <p className="text-xs font-semibold text-emerald-300">
                      Hasil Tes Agent (Menggunakan Input Contoh Uji):
                    </p>
                    <AgentOutput result={testResult} />
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <AutoConfigModal
        plan={autoConfigPlan}
        onClose={() => setAutoConfigPlan(null)}
        onApply={handleApplyAutoConfig}
      />
    </div>
  );
};
