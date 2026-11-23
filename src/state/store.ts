import React, { createContext, useContext, useEffect, useReducer } from 'react';
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
import { PROFILE_PRESETS } from '../config/presets';
import { DEFAULT_KNOWLEDGE } from '../knowledge/blocks';
import { DEFAULT_MODEL_CONFIGS } from './defaults';
import { load, save, type PersistedAppData } from './persistence';

export type ScreenId =
  | 'setup'
  | 'style'
  | 'ideas'
  | 'studio'
  | 'audit'
  | 'analytics'
  | 'knowledge'
  | 'models';

export interface SessionState {
  accessCode: string;
  gateEnabled: boolean;
  authRequiredPrompt: boolean;
  authChecked: boolean;
}

export interface AppState extends PersistedAppData {
  currentScreen: ScreenId;
  draftRunInput: RunInput | null;
  storageWarning?: string;
  session: SessionState;
}

function normalizeInterruptedRun(run: PipelineRun | null | undefined): PipelineRun | null {
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

function buildInitialState(): AppState {
  const loaded = load();
  const saved = loaded.data;
  const fallbackProfile = structuredClone(PROFILE_PRESETS[0].profile);

  return {
    currentScreen: saved?.profileConfigured ? 'studio' : 'setup',
    draftRunInput: null,
    profile: saved?.profile ?? fallbackProfile,
    profileConfigured: saved?.profileConfigured ?? false,
    styleProfiles: saved?.styleProfiles ?? [],
    styleReferences: saved?.styleReferences ?? [],
    modelConfigs:
      saved?.modelConfigs && saved.modelConfigs.length === DEFAULT_MODEL_CONFIGS.length
        ? saved.modelConfigs
        : structuredClone(DEFAULT_MODEL_CONFIGS),
    knowledge:
      saved?.knowledge && saved.knowledge.length > 0
        ? saved.knowledge
        : structuredClone(DEFAULT_KNOWLEDGE),
    history: saved?.history ?? [],
    activeRun: normalizeInterruptedRun(saved?.activeRun),
    lastIdeas: saved?.lastIdeas,
    lastAudit: saved?.lastAudit,
    lastAnalysis: saved?.lastAnalysis,
    lastExportedAt: saved?.lastExportedAt,
    changesSinceExport: saved?.changesSinceExport ?? 0,
    storageWarning: loaded.warning,
    session: {
      accessCode: '',
      gateEnabled: false,
      authRequiredPrompt: false,
      authChecked: false,
    },
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
  | { type: 'UPDATE_HISTORY_SELECTION'; id: string; selection: { titleIndex: number; hookIndex: number } }
  | { type: 'SET_LAST_IDEAS'; result: AgentResult }
  | { type: 'SET_LAST_AUDIT'; result: AgentResult }
  | { type: 'SET_LAST_ANALYSIS'; result: AgentResult }
  | { type: 'MARK_EXPORTED'; exportedAt: string }
  | { type: 'IMPORT_ALL'; file: ExportFile }
  | { type: 'SET_STORAGE_WARNING'; warning?: string }
  | { type: 'SET_SESSION'; patch: Partial<SessionState> };

function reducer(state: AppState, action: AppAction): AppState {
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
        modelConfigs: action.file.modelConfigs,
        knowledge: action.file.knowledge,
        history: action.file.history.slice(0, HISTORY_MAX),
        lastIdeas: action.file.lastIdeas,
        lastAudit: action.file.lastAudit,
        lastAnalysis: action.file.lastAnalysis,
        activeRun: null,
        changesSinceExport: 0,
      };

    case 'SET_STORAGE_WARNING':
      return { ...state, storageWarning: action.warning };

    case 'SET_SESSION':
      return {
        ...state,
        session: { ...state.session, ...action.patch },
      };

    default:
      return state;
  }
}

export interface StoreContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, undefined, buildInitialState);

  useEffect(() => {
    const {
      profile,
      profileConfigured,
      styleProfiles,
      styleReferences,
      modelConfigs,
      knowledge,
      history,
      activeRun,
      lastIdeas,
      lastAudit,
      lastAnalysis,
      lastExportedAt,
      changesSinceExport,
    } = state;

    const result = save({
      profile,
      profileConfigured,
      styleProfiles,
      styleReferences,
      modelConfigs,
      knowledge,
      history,
      activeRun,
      lastIdeas,
      lastAudit,
      lastAnalysis,
      lastExportedAt,
      changesSinceExport,
    });

    if (result.warning && result.warning !== state.storageWarning) {
      dispatch({ type: 'SET_STORAGE_WARNING', warning: result.warning });
    }
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

  return React.createElement(StoreContext.Provider, { value: { state, dispatch } }, children);
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
