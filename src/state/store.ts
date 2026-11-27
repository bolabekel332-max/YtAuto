import React, { createContext, useCallback, useContext, useEffect, useReducer, useRef } from 'react';
import { HISTORY_MAX } from '../../shared/constants';
import type {
  AgentModelConfig,
  AgentResult,
  ChannelProfile,
  ExportFile,
  HistoryEntry,
  KnowledgeBlock,
  PipelineRun,
  PipelineStepId,
  RunInput,
  StepState,
  StyleProfile,
  StyleReference,
} from '../../shared/schemas';
import { isPipelineLocked } from '../agents/pipeline';
import { PROFILE_PRESETS } from '../config/presets';
import { DEFAULT_KNOWLEDGE } from '../knowledge/blocks';
import { DEFAULT_MODEL_CONFIGS } from './defaults';
import {
  clearLocalData,
  load,
  mergeKnowledgeBlocks,
  mergeModelConfigs,
  mergeModelConfigsWithReport,
  save,
  STORAGE_KEY,
  type PersistedAppData,
} from './persistence';

export type ScreenId =
  | 'setup'
  | 'style'
  | 'ideas'
  | 'studio'
  | 'audit'
  | 'analytics'
  | 'knowledge'
  | 'models';

export interface AppState extends PersistedAppData {
  currentScreen: ScreenId;
  draftRunInput: RunInput | null;
  storageWarning?: string;
  storageConflict?: boolean;
}

export function normalizeInterruptedRun(run: PipelineRun | null | undefined): PipelineRun | null {
  if (!run) return null;
  if (run.status !== 'running') return run;

  const updatedSteps = { ...run.steps };
  (Object.keys(updatedSteps) as PipelineStepId[]).forEach((stepId) => {
    if (updatedSteps[stepId].status === 'running') {
      updatedSteps[stepId] = {
        ...updatedSteps[stepId],
        status: 'failed',
        error:
          'Eksekusi langkah terputus saat tab ditutup atau dimuat ulang. Klik Lanjutkan untuk meneruskan dari langkah ini.',
      };
    }
  });

  return {
    ...run,
    steps: updatedSteps,
    status: 'interrupted',
  };
}

export function buildDefaultState(): AppState {
  const fallbackProfile = structuredClone(PROFILE_PRESETS[0].profile);
  return {
    currentScreen: 'setup',
    draftRunInput: null,
    profile: fallbackProfile,
    profileConfigured: false,
    styleProfiles: [],
    styleReferences: [],
    modelConfigs: structuredClone(DEFAULT_MODEL_CONFIGS),
    knowledge: structuredClone(DEFAULT_KNOWLEDGE),
    history: [],
    activeRun: null,
    lastIdeas: undefined,
    lastAudit: undefined,
    lastAnalysis: undefined,
    lastExportedAt: undefined,
    changesSinceExport: 0,
    storageWarning: undefined,
    storageConflict: false,
  };
}

export function buildInitialState(): AppState {
  const loaded = load();
  const saved = loaded.data;
  const fallbackProfile = structuredClone(PROFILE_PRESETS[0].profile);
  const mergedModels = mergeModelConfigsWithReport(saved?.modelConfigs, DEFAULT_MODEL_CONFIGS);

  if (
    mergedModels.warnings.length > 0 &&
    saved?.modelConfigs &&
    typeof window !== 'undefined' &&
    window.localStorage
  ) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          (parsed as Record<string, unknown>).modelConfigs = mergedModels.configs;
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        }
      }
    } catch {
      // Abaikan error penyimpanan saat menyimpan hasil migrasi timeout
    }
  }

  const warningParts: string[] = [];
  if (loaded.warning) warningParts.push(loaded.warning);
  if (mergedModels.warnings.length > 0) {
    warningParts.push(mergedModels.warnings.join(' '));
  }

  return {
    currentScreen: saved?.profileConfigured ? 'studio' : 'setup',
    draftRunInput: null,
    profile: saved?.profile ?? fallbackProfile,
    profileConfigured: saved?.profileConfigured ?? false,
    styleProfiles: saved?.styleProfiles ?? [],
    styleReferences: saved?.styleReferences ?? [],
    modelConfigs: mergedModels.configs,
    knowledge: mergeKnowledgeBlocks(saved?.knowledge, DEFAULT_KNOWLEDGE),
    history: saved?.history ?? [],
    activeRun: normalizeInterruptedRun(saved?.activeRun),
    lastIdeas: saved?.lastIdeas,
    lastAudit: saved?.lastAudit,
    lastAnalysis: saved?.lastAnalysis,
    lastExportedAt: saved?.lastExportedAt,
    changesSinceExport: saved?.changesSinceExport ?? 0,
    storageWarning: warningParts.length > 0 ? warningParts.join(' ') : undefined,
    storageConflict: false,
  };
}

export type AppAction =
  | { type: 'SET_SCREEN'; screen: ScreenId }
  | { type: 'SET_PROFILE'; profile: ChannelProfile }
  | { type: 'SET_DRAFT_RUN_INPUT'; input: RunInput | null }
  | { type: 'ADD_STYLE_REFERENCE'; reference: StyleReference }
  | { type: 'UPDATE_STYLE_REFERENCE'; id: string; patch: Partial<StyleReference> }
  | { type: 'REMOVE_STYLE_REFERENCE'; id: string }
  | { type: 'UPSERT_STYLE_PROFILE'; profile: StyleProfile }
  | { type: 'DELETE_STYLE_PROFILE'; id: string }
  | { type: 'UPDATE_MODEL_CONFIG'; agentId: AgentModelConfig['agentId']; patch: Partial<AgentModelConfig> }
  | { type: 'SET_MODEL_CONFIGS'; configs: AgentModelConfig[] }
  | { type: 'UPDATE_KNOWLEDGE_BLOCK'; id: string; patch: Partial<KnowledgeBlock> }
  | { type: 'SET_ACTIVE_RUN'; run: PipelineRun | null }
  | { type: 'UPDATE_ACTIVE_RUN_STEP'; stepId: PipelineStepId; state: StepState }
  | { type: 'UPSERT_HISTORY'; entry: HistoryEntry }
  | { type: 'DELETE_HISTORY'; id: string }
  | { type: 'UPDATE_HISTORY_SELECTION'; id: string; selection: { titleIndex: number; hookIndex: number } }
  | { type: 'SET_LAST_IDEAS'; result: AgentResult }
  | { type: 'SET_LAST_AUDIT'; result: AgentResult }
  | { type: 'SET_LAST_ANALYSIS'; result: AgentResult }
  | { type: 'MARK_EXPORTED'; exportedAt: string }
  | { type: 'IMPORT_ALL'; file: ExportFile }
  | {
      type: 'IMPORT_RECOVERY';
      partialData: Partial<PersistedAppData>;
      keptSections: Array<keyof PersistedAppData>;
    }
  | { type: 'CLEAR_LOCAL_DATA' }
  | { type: 'RELOAD_FROM_STORAGE'; loaded: AppState }
  | { type: 'RESOLVE_STORAGE_CONFLICT_OVERWRITE' }
  | { type: 'SET_STORAGE_WARNING'; warning?: string; conflict?: boolean };

const NON_MUTATING_ACTIONS = new Set<AppAction['type']>([
  'SET_SCREEN',
  'SET_DRAFT_RUN_INPUT',
  'SET_STORAGE_WARNING',
  'CLEAR_LOCAL_DATA',
  'RELOAD_FROM_STORAGE',
  'RESOLVE_STORAGE_CONFLICT_OVERWRITE',
]);

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_SCREEN':
      return { ...state, currentScreen: action.screen };

    case 'SET_PROFILE':
      return {
        ...state,
        profile: action.profile,
        profileConfigured: true,
        changesSinceExport: state.changesSinceExport + 1,
      };

    case 'SET_DRAFT_RUN_INPUT':
      return { ...state, draftRunInput: action.input };

    case 'ADD_STYLE_REFERENCE':
      return {
        ...state,
        styleReferences: [action.reference, ...state.styleReferences],
        changesSinceExport: state.changesSinceExport + 1,
      };

    case 'UPDATE_STYLE_REFERENCE':
      return {
        ...state,
        styleReferences: state.styleReferences.map((r) =>
          r.id === action.id ? { ...r, ...action.patch } : r
        ),
        changesSinceExport: state.changesSinceExport + 1,
      };

    case 'REMOVE_STYLE_REFERENCE':
      return {
        ...state,
        styleReferences: state.styleReferences.filter((r) => r.id !== action.id),
        changesSinceExport: state.changesSinceExport + 1,
      };

    case 'UPSERT_STYLE_PROFILE': {
      const exists = state.styleProfiles.some((p) => p.id === action.profile.id);
      return {
        ...state,
        styleProfiles: exists
          ? state.styleProfiles.map((p) => (p.id === action.profile.id ? action.profile : p))
          : [action.profile, ...state.styleProfiles],
        changesSinceExport: state.changesSinceExport + 1,
      };
    }

    case 'DELETE_STYLE_PROFILE':
      return {
        ...state,
        styleProfiles: state.styleProfiles.filter((p) => p.id !== action.id),
        changesSinceExport: state.changesSinceExport + 1,
      };

    case 'UPDATE_MODEL_CONFIG':
      return {
        ...state,
        modelConfigs: state.modelConfigs.map((c) =>
          c.agentId === action.agentId ? { ...c, ...action.patch } : c
        ),
        changesSinceExport: state.changesSinceExport + 1,
      };

    case 'SET_MODEL_CONFIGS':
      return {
        ...state,
        modelConfigs: action.configs,
        changesSinceExport: state.changesSinceExport + 1,
      };

    case 'UPDATE_KNOWLEDGE_BLOCK':
      return {
        ...state,
        knowledge: state.knowledge.map((b) =>
          b.id === action.id ? { ...b, ...action.patch } : b
        ),
        changesSinceExport: state.changesSinceExport + 1,
      };

    case 'SET_ACTIVE_RUN':
      return { ...state, activeRun: action.run };

    case 'UPDATE_ACTIVE_RUN_STEP': {
      if (!state.activeRun) return state;
      return {
        ...state,
        activeRun: {
          ...state.activeRun,
          steps: {
            ...state.activeRun.steps,
            [action.stepId]: action.state,
          },
        },
      };
    }

    case 'UPSERT_HISTORY': {
      const filtered = state.history.filter((h) => h.id !== action.entry.id);
      const nextHistory = [action.entry, ...filtered].slice(0, HISTORY_MAX);
      return {
        ...state,
        history: nextHistory,
        changesSinceExport: state.changesSinceExport + 1,
      };
    }

    case 'DELETE_HISTORY':
      return {
        ...state,
        history: state.history.filter((h) => h.id !== action.id),
        activeRun: state.activeRun?.id === action.id ? null : state.activeRun,
        changesSinceExport: state.changesSinceExport + 1,
      };

    case 'UPDATE_HISTORY_SELECTION':
      return {
        ...state,
        history: state.history.map((h) =>
          h.id === action.id ? { ...h, selection: action.selection } : h
        ),
        changesSinceExport: state.changesSinceExport + 1,
      };

    case 'SET_LAST_IDEAS':
      return {
        ...state,
        lastIdeas: action.result,
        changesSinceExport: state.changesSinceExport + 1,
      };

    case 'SET_LAST_AUDIT':
      return {
        ...state,
        lastAudit: action.result,
        changesSinceExport: state.changesSinceExport + 1,
      };

    case 'SET_LAST_ANALYSIS':
      return {
        ...state,
        lastAnalysis: action.result,
        changesSinceExport: state.changesSinceExport + 1,
      };

    case 'MARK_EXPORTED':
      return {
        ...state,
        lastExportedAt: action.exportedAt,
        changesSinceExport: 0,
      };

    case 'IMPORT_ALL':
      return {
        ...state,
        profile: action.file.profile,
        profileConfigured: true,
        styleProfiles: action.file.styleProfiles,
        styleReferences: action.file.styleReferences,
        modelConfigs: mergeModelConfigs(action.file.modelConfigs, DEFAULT_MODEL_CONFIGS),
        knowledge: mergeKnowledgeBlocks(action.file.knowledge, DEFAULT_KNOWLEDGE),
        history: action.file.history.slice(0, HISTORY_MAX),
        lastIdeas: action.file.lastIdeas,
        lastAudit: action.file.lastAudit,
        lastAnalysis: action.file.lastAnalysis,
        activeRun: null,
        changesSinceExport: 0,
        storageConflict: false,
      };

    case 'IMPORT_RECOVERY': {
      const kept = new Set(action.keptSections);
      const partial = action.partialData;
      return {
        ...state,
        ...(kept.has('profile') && partial.profile
          ? { profile: partial.profile, profileConfigured: true }
          : {}),
        ...(kept.has('styleProfiles') && partial.styleProfiles
          ? { styleProfiles: partial.styleProfiles }
          : {}),
        ...(kept.has('styleReferences') && partial.styleReferences
          ? { styleReferences: partial.styleReferences }
          : {}),
        ...(kept.has('modelConfigs') && partial.modelConfigs
          ? { modelConfigs: mergeModelConfigs(partial.modelConfigs, DEFAULT_MODEL_CONFIGS) }
          : {}),
        ...(kept.has('knowledge') && partial.knowledge
          ? { knowledge: mergeKnowledgeBlocks(partial.knowledge, DEFAULT_KNOWLEDGE) }
          : {}),
        ...(kept.has('history') && partial.history
          ? { history: partial.history.slice(0, HISTORY_MAX) }
          : {}),
        ...(kept.has('lastIdeas') ? { lastIdeas: partial.lastIdeas } : {}),
        ...(kept.has('lastAudit') ? { lastAudit: partial.lastAudit } : {}),
        ...(kept.has('lastAnalysis') ? { lastAnalysis: partial.lastAnalysis } : {}),
        changesSinceExport: state.changesSinceExport + 1,
        storageConflict: false,
      };
    }

    case 'CLEAR_LOCAL_DATA':
      return buildDefaultState();

    case 'RELOAD_FROM_STORAGE':
      return {
        ...action.loaded,
        currentScreen: state.currentScreen,
        storageConflict: false,
      };

    case 'RESOLVE_STORAGE_CONFLICT_OVERWRITE':
      return {
        ...state,
        storageConflict: false,
        storageWarning: undefined,
      };

    case 'SET_STORAGE_WARNING':
      return {
        ...state,
        storageWarning: action.warning,
        storageConflict: action.conflict ?? state.storageConflict,
      };

    default:
      return state;
  }
}

export function shouldFlushPendingSave(flags: {
  hasUserMutations: boolean;
  externalTabConflict: boolean;
}): boolean {
  return flags.hasUserMutations && !flags.externalTabConflict;
}

export interface StoreContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  reloadFromStorage: () => void;
  overwriteStorageFromCurrentTab: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, rawDispatch] = useReducer(appReducer, undefined, buildInitialState);
  const snapshotRef = useRef<PersistedAppData>(extractPersistedSnapshot(state));
  const warningRef = useRef<string | undefined>(state.storageWarning);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipInitialSaveRef = useRef(true);
  const hasUserMutationsRef = useRef(false);
  const externalTabConflictRef = useRef(false);

  snapshotRef.current = extractPersistedSnapshot(state);
  warningRef.current = state.storageWarning;

  const dispatch = useCallback((action: AppAction) => {
    if (
      (action.type === 'RELOAD_FROM_STORAGE' ||
        action.type === 'RESOLVE_STORAGE_CONFLICT_OVERWRITE') &&
      isPipelineLocked()
    ) {
      rawDispatch({
        type: 'SET_STORAGE_WARNING',
        warning: 'Tunggu pipeline selesai sebelum menyinkronkan atau menimpa data tab.',
      });
      return;
    }

    if (action.type === 'CLEAR_LOCAL_DATA') {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      hasUserMutationsRef.current = false;
      externalTabConflictRef.current = false;
      clearLocalData();
      rawDispatch(action);
      return;
    }

    if (action.type === 'RELOAD_FROM_STORAGE') {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      hasUserMutationsRef.current = false;
      externalTabConflictRef.current = false;
      rawDispatch(action);
      return;
    }

    if (action.type === 'RESOLVE_STORAGE_CONFLICT_OVERWRITE') {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      externalTabConflictRef.current = false;
      hasUserMutationsRef.current = true;
      rawDispatch(action);
      const result = save(snapshotRef.current);
      if (result.warning) {
        rawDispatch({ type: 'SET_STORAGE_WARNING', warning: result.warning, conflict: false });
      }
      return;
    }

    if (action.type === 'IMPORT_ALL' || action.type === 'IMPORT_RECOVERY') {
      externalTabConflictRef.current = false;
    }

    if (!NON_MUTATING_ACTIONS.has(action.type)) {
      hasUserMutationsRef.current = true;
    }

    rawDispatch(action);
  }, []);

  const reloadFromStorage = useCallback(() => {
    const next = buildInitialState();
    dispatch({ type: 'RELOAD_FROM_STORAGE', loaded: next });
  }, [dispatch]);

  const overwriteStorageFromCurrentTab = useCallback(() => {
    dispatch({ type: 'RESOLVE_STORAGE_CONFLICT_OVERWRITE' });
  }, [dispatch]);

  useEffect(() => {
    if (skipInitialSaveRef.current) {
      skipInitialSaveRef.current = false;
      return;
    }
    if (
      !shouldFlushPendingSave({
        hasUserMutations: hasUserMutationsRef.current,
        externalTabConflict: externalTabConflictRef.current,
      })
    ) {
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      if (
        !shouldFlushPendingSave({
          hasUserMutations: hasUserMutationsRef.current,
          externalTabConflict: externalTabConflictRef.current,
        })
      ) {
        return;
      }
      const result = save(snapshotRef.current);
      if (result.warning && result.warning !== warningRef.current) {
        rawDispatch({ type: 'SET_STORAGE_WARNING', warning: result.warning });
      }
    }, 500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [
    state.profile,
    state.profileConfigured,
    state.styleProfiles,
    state.styleReferences,
    state.modelConfigs,
    state.knowledge,
    state.history,
    state.activeRun,
    state.lastIdeas,
    state.lastAudit,
    state.lastAnalysis,
    state.lastExportedAt,
    state.changesSinceExport,
  ]);

  useEffect(() => {
    const flushPending = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      // Jangan menimpa data korup yang belum disunting atau data yang baru diubah tab lain (F-21, F-22)
      if (
        !shouldFlushPendingSave({
          hasUserMutations: hasUserMutationsRef.current,
          externalTabConflict: externalTabConflictRef.current,
        })
      ) {
        return;
      }
      save(snapshotRef.current);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPending();
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        externalTabConflictRef.current = true;
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        rawDispatch({
          type: 'SET_STORAGE_WARNING',
          warning:
            'Data diubah di tab lain. Tab ini tidak akan menimpa secara otomatis; muat data terbaru agar perubahan tab lain tetap sinkron.',
          conflict: true,
        });
      }
    };

    window.addEventListener('beforeunload', flushPending);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('beforeunload', flushPending);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return React.createElement(
    StoreContext.Provider,
    { value: { state, dispatch, reloadFromStorage, overwriteStorageFromCurrentTab } },
    children
  );
};

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error('useStore harus dipakai di dalam StoreProvider.');
  }
  return ctx;
}

export function extractPersistedSnapshot(state: AppState): PersistedAppData {
  return {
    profile: state.profile,
    profileConfigured: state.profileConfigured,
    styleProfiles: state.styleProfiles,
    styleReferences: state.styleReferences,
    modelConfigs: state.modelConfigs,
    knowledge: state.knowledge,
    history: state.history,
    activeRun: state.activeRun,
    lastIdeas: state.lastIdeas,
    lastAudit: state.lastAudit,
    lastAnalysis: state.lastAnalysis,
    lastExportedAt: state.lastExportedAt,
    changesSinceExport: state.changesSinceExport,
  };
}
