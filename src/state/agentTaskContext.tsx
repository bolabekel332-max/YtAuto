import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import type {
  AgentRunRequest,
  StyleAnalyzeRequest,
  StyleAnalyzeResponse,
} from '../../shared/api';
import type { AgentResult, StyleProfile, StyleReference } from '../../shared/schemas';
import { analyzeStyle, runAgent } from '../api/client';
import { checkConfigAgainstServerPolicy } from './modelPolicyGuard';
import { type ScreenId, useStore } from './store';

export type AgentTaskKind = 'ideas' | 'audit' | 'analytics' | 'style_analysis';

export interface AgentTaskState {
  kind: AgentTaskKind;
  label: string;
  screen: ScreenId;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  statusMessage?: string;
  lastResult?: AgentResult | StyleAnalyzeResponse;
  referenceId?: string;
}

export type TaskStartResult =
  | { started: true }
  | { started: false; reason: 'duplicate' | 'policy_blocked' | 'failed'; message?: string };

const TASK_META: Record<AgentTaskKind, { label: string; screen: ScreenId; cancelMsg: string }> = {
  ideas: {
    label: 'Riset Ide',
    screen: 'ideas',
    cancelMsg: 'Permintaan riset ide dibatalkan oleh pengguna.',
  },
  audit: {
    label: 'Audit Konten',
    screen: 'audit',
    cancelMsg: 'Permintaan audit konten dibatalkan oleh pengguna.',
  },
  analytics: {
    label: 'Analitik Performa',
    screen: 'analytics',
    cancelMsg: 'Permintaan analisis performa dibatalkan oleh pengguna.',
  },
  style_analysis: {
    label: 'Analisis Referensi Gaya',
    screen: 'style',
    cancelMsg: 'Analisis gaya dibatalkan oleh pengguna.',
  },
};

function createInitialTasks(): Record<AgentTaskKind, AgentTaskState> {
  return {
    ideas: { kind: 'ideas', label: TASK_META.ideas.label, screen: 'ideas', status: 'idle' },
    audit: { kind: 'audit', label: TASK_META.audit.label, screen: 'audit', status: 'idle' },
    analytics: {
      kind: 'analytics',
      label: TASK_META.analytics.label,
      screen: 'analytics',
      status: 'idle',
    },
    style_analysis: {
      kind: 'style_analysis',
      label: TASK_META.style_analysis.label,
      screen: 'style',
      status: 'idle',
    },
  };
}

export interface AgentTaskContextValue {
  tasks: Record<AgentTaskKind, AgentTaskState>;
  runningTasks: AgentTaskState[];
  startIdeasTask: (payload: AgentRunRequest) => Promise<TaskStartResult>;
  startAuditTask: (payload: AgentRunRequest) => Promise<TaskStartResult>;
  startAnalyticsTask: (payload: AgentRunRequest) => Promise<TaskStartResult>;
  startStyleAnalysisTask: (params: {
    payload: StyleAnalyzeRequest;
    newReference: StyleReference;
    onProfileCreated?: (profile: StyleProfile) => void;
  }) => Promise<TaskStartResult>;
  cancelTask: (kind: AgentTaskKind) => void;
  clearTaskMessages: (kind: AgentTaskKind) => void;
}

const AgentTaskContext = createContext<AgentTaskContextValue | null>(null);

export const AgentTaskProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { dispatch } = useStore();
  const [tasks, setTasks] = useState<Record<AgentTaskKind, AgentTaskState>>(createInitialTasks);

  const controllersRef = useRef<Partial<Record<AgentTaskKind, AbortController>>>({});
  const runTokenRef = useRef<Record<AgentTaskKind, number>>({
    ideas: 0,
    audit: 0,
    analytics: 0,
    style_analysis: 0,
  });

  const cancelTask = useCallback((kind: AgentTaskKind) => {
    const controller = controllersRef.current[kind];
    if (controller) {
      controller.abort();
    }
  }, []);

  const clearTaskMessages = useCallback((kind: AgentTaskKind) => {
    setTasks((prev) => ({
      ...prev,
      [kind]: {
        ...prev[kind],
        error: undefined,
        statusMessage: undefined,
      },
    }));
  }, []);

  const runStandardAgentTask = useCallback(
    async (
      kind: 'ideas' | 'audit' | 'analytics',
      payload: AgentRunRequest,
      onSuccess: (result: AgentResult) => void
    ): Promise<TaskStartResult> => {
      if (controllersRef.current[kind]) {
        return {
          started: false,
          reason: 'duplicate',
          message: `Tugas ${TASK_META[kind].label} masih berjalan.`,
        };
      }

      const guard = await checkConfigAgainstServerPolicy(payload.config);
      if (!guard.ok) {
        setTasks((prev) => ({
          ...prev,
          [kind]: {
            ...prev[kind],
            status: 'failed',
            finishedAt: new Date().toISOString(),
            error: guard.message,
            statusMessage: undefined,
          },
        }));
        return { started: false, reason: 'policy_blocked', message: guard.message };
      }

      const controller = new AbortController();
      controllersRef.current[kind] = controller;
      const token = ++runTokenRef.current[kind];

      setTasks((prev) => ({
        ...prev,
        [kind]: {
          ...prev[kind],
          status: 'running',
          startedAt: new Date().toISOString(),
          finishedAt: undefined,
          error: undefined,
          statusMessage: undefined,
        },
      }));

      try {
        const result = await runAgent(payload, controller.signal);
        if (controller.signal.aborted) {
          throw new DOMException(TASK_META[kind].cancelMsg, 'AbortError');
        }
        onSuccess(result);
        if (runTokenRef.current[kind] === token) {
          setTasks((prev) => ({
            ...prev,
            [kind]: {
              ...prev[kind],
              status: 'completed',
              finishedAt: new Date().toISOString(),
              lastResult: result,
              error: undefined,
              statusMessage: undefined,
            },
          }));
        }
        return { started: true };
      } catch (err) {
        const isAbort =
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.name === 'AbortError');
        const message = isAbort
          ? TASK_META[kind].cancelMsg
          : err instanceof Error
          ? err.message
          : `Gagal menjalankan tugas ${TASK_META[kind].label}.`;

        if (runTokenRef.current[kind] === token) {
          setTasks((prev) => ({
            ...prev,
            [kind]: {
              ...prev[kind],
              status: isAbort ? 'cancelled' : 'failed',
              finishedAt: new Date().toISOString(),
              error: isAbort ? undefined : message,
              statusMessage: isAbort ? message : undefined,
            },
          }));
        }
        return { started: false, reason: 'failed', message };
      } finally {
        if (controllersRef.current[kind] === controller) {
          delete controllersRef.current[kind];
        }
      }
    },
    []
  );

  const startIdeasTask = useCallback(
    (payload: AgentRunRequest) =>
      runStandardAgentTask('ideas', payload, (result) => {
        dispatch({ type: 'SET_LAST_IDEAS', result });
      }),
    [dispatch, runStandardAgentTask]
  );

  const startAuditTask = useCallback(
    (payload: AgentRunRequest) =>
      runStandardAgentTask('audit', payload, (result) => {
        dispatch({ type: 'SET_LAST_AUDIT', result });
      }),
    [dispatch, runStandardAgentTask]
  );

  const startAnalyticsTask = useCallback(
    (payload: AgentRunRequest) =>
      runStandardAgentTask('analytics', payload, (result) => {
        dispatch({ type: 'SET_LAST_ANALYSIS', result });
      }),
    [dispatch, runStandardAgentTask]
  );

  const startStyleAnalysisTask = useCallback(
    async (params: {
      payload: StyleAnalyzeRequest;
      newReference: StyleReference;
      onProfileCreated?: (profile: StyleProfile) => void;
    }): Promise<TaskStartResult> => {
      const kind: AgentTaskKind = 'style_analysis';
      if (controllersRef.current[kind]) {
        return {
          started: false,
          reason: 'duplicate',
          message: `Tugas ${TASK_META[kind].label} masih berjalan.`,
        };
      }

      const guard = await checkConfigAgainstServerPolicy(params.payload.config);
      if (!guard.ok) {
        setTasks((prev) => ({
          ...prev,
          [kind]: {
            ...prev[kind],
            status: 'failed',
            finishedAt: new Date().toISOString(),
            error: guard.message,
            statusMessage: undefined,
          },
        }));
        return { started: false, reason: 'policy_blocked', message: guard.message };
      }

      const controller = new AbortController();
      controllersRef.current[kind] = controller;
      const token = ++runTokenRef.current[kind];
      const refId = params.newReference.id;

      dispatch({ type: 'ADD_STYLE_REFERENCE', reference: params.newReference });
      setTasks((prev) => ({
        ...prev,
        [kind]: {
          ...prev[kind],
          status: 'running',
          startedAt: new Date().toISOString(),
          finishedAt: undefined,
          error: undefined,
          statusMessage: undefined,
          referenceId: refId,
        },
      }));

      try {
        const response = await analyzeStyle(params.payload, controller.signal);
        if (controller.signal.aborted) {
          throw new DOMException(TASK_META[kind].cancelMsg, 'AbortError');
        }
        dispatch({ type: 'UPDATE_STYLE_REFERENCE', id: refId, patch: { status: 'analyzed' } });
        dispatch({ type: 'UPSERT_STYLE_PROFILE', profile: response.profile });
        params.onProfileCreated?.(response.profile);

        if (runTokenRef.current[kind] === token) {
          const msg = `Profil gaya "${response.profile.name}" berhasil dibuat${
            response.result.isMock ? ' (Simulasi Mock)' : ''
          }.`;
          setTasks((prev) => ({
            ...prev,
            [kind]: {
              ...prev[kind],
              status: 'completed',
              finishedAt: new Date().toISOString(),
              lastResult: response,
              error: undefined,
              statusMessage: msg,
              referenceId: refId,
            },
          }));
        }
        return { started: true };
      } catch (err) {
        const isAbort =
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.name === 'AbortError');

        if (isAbort) {
          dispatch({ type: 'REMOVE_STYLE_REFERENCE', id: refId });
        } else {
          dispatch({ type: 'UPDATE_STYLE_REFERENCE', id: refId, patch: { status: 'failed' } });
        }

        const message = isAbort
          ? TASK_META[kind].cancelMsg
          : err instanceof Error
          ? err.message
          : 'Gagal menganalisis referensi gaya.';

        if (runTokenRef.current[kind] === token) {
          setTasks((prev) => ({
            ...prev,
            [kind]: {
              ...prev[kind],
              status: isAbort ? 'cancelled' : 'failed',
              finishedAt: new Date().toISOString(),
              error: isAbort ? undefined : message,
              statusMessage: isAbort ? message : undefined,
              referenceId: refId,
            },
          }));
        }
        return { started: false, reason: 'failed', message };
      } finally {
        if (controllersRef.current[kind] === controller) {
          delete controllersRef.current[kind];
        }
      }
    },
    [dispatch]
  );

  const runningTasks = (Object.values(tasks) as AgentTaskState[]).filter(
    (t) => t.status === 'running'
  );

  return (
    <AgentTaskContext.Provider
      value={{
        tasks,
        runningTasks,
        startIdeasTask,
        startAuditTask,
        startAnalyticsTask,
        startStyleAnalysisTask,
        cancelTask,
        clearTaskMessages,
      }}
    >
      {children}
    </AgentTaskContext.Provider>
  );
};

export function useAgentTask(): AgentTaskContextValue {
  const ctx = useContext(AgentTaskContext);
  if (!ctx) {
    throw new Error('useAgentTask harus dipanggil di dalam <AgentTaskProvider>.');
  }
  return ctx;
}

export function useOptionalAgentTask(): AgentTaskContextValue | null {
  return useContext(AgentTaskContext);
}
