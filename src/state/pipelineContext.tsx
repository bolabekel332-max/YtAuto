import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { HistoryEntry, PipelineRun, PipelineStepId, RunInput } from '../../shared/schemas';
import {
  isPipelineLocked,
  resumeRun,
  retryStep,
  runPipeline,
  skipStep,
} from '../agents/pipeline';
import { useStore } from './store';

export interface PipelineContextValue {
  isBusy: boolean;
  pipelineError: string | null;
  startPipeline: (input: RunInput) => Promise<void>;
  resumePipeline: (run: PipelineRun) => Promise<void>;
  retryPipelineStep: (run: PipelineRun, stepId: PipelineStepId) => Promise<void>;
  skipPipelineStep: (run: PipelineRun, stepId: PipelineStepId) => Promise<void>;
  cancelPipeline: () => void;
  dismissPipelineError: () => void;
}

const PipelineContext = createContext<PipelineContextValue | null>(null);

export const PipelineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { state, dispatch } = useStore();
  const [isBusy, setIsBusy] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const makeCtx = useCallback(
    (signal: AbortSignal) => {
      const snap = stateRef.current;
      return {
        profile: snap.profile,
        styleProfiles: snap.styleProfiles,
        modelConfigs: snap.modelConfigs,
        knowledge: snap.knowledge,
        history: snap.history,
        signal,
        onRunUpdate: (run: PipelineRun) => {
          dispatch({ type: 'SET_ACTIVE_RUN', run });
        },
        onHistorySave: (entry: HistoryEntry) => {
          dispatch({ type: 'UPSERT_HISTORY', entry });
        },
      };
    },
    [dispatch]
  );

  const runWithController = useCallback(
    async (task: (signal: AbortSignal) => Promise<PipelineRun>, fallbackMsg: string) => {
      if (isBusy || isPipelineLocked()) {
        setPipelineError('Masih ada satu proses pipeline yang sedang berjalan.');
        return;
      }
      setPipelineError(null);
      const controller = new AbortController();
      abortRef.current = controller;
      setIsBusy(true);
      try {
        await task(controller.signal);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setPipelineError(err instanceof Error ? err.message : fallbackMsg);
        }
      } finally {
        abortRef.current = null;
        setIsBusy(false);
      }
    },
    [isBusy]
  );

  const startPipeline = useCallback(
    (input: RunInput) =>
      runWithController(
        (signal) => runPipeline(input, makeCtx(signal)),
        'Gagal memulai pipeline Studio Video.'
      ),
    [makeCtx, runWithController]
  );

  const resumePipeline = useCallback(
    (run: PipelineRun) =>
      runWithController(
        (signal) => resumeRun(run, makeCtx(signal)),
        'Gagal melanjutkan pipeline.'
      ),
    [makeCtx, runWithController]
  );

  const retryPipelineStep = useCallback(
    (run: PipelineRun, stepId: PipelineStepId) =>
      runWithController(
        (signal) => retryStep(run, stepId, makeCtx(signal)),
        'Gagal mengulangi langkah.'
      ),
    [makeCtx, runWithController]
  );

  const skipPipelineStep = useCallback(
    (run: PipelineRun, stepId: PipelineStepId) =>
      runWithController(
        (signal) => skipStep(run, stepId, makeCtx(signal)),
        'Gagal melewati langkah.'
      ),
    [makeCtx, runWithController]
  );

  const cancelPipeline = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const dismissPipelineError = useCallback(() => {
    setPipelineError(null);
  }, []);

  return React.createElement(
    PipelineContext.Provider,
    {
      value: {
        isBusy,
        pipelineError,
        startPipeline,
        resumePipeline,
        retryPipelineStep,
        skipPipelineStep,
        cancelPipeline,
        dismissPipelineError,
      },
    },
    children
  );
};

export function usePipeline(): PipelineContextValue {
  const ctx = useContext(PipelineContext);
  if (!ctx) {
    throw new Error('usePipeline harus dipakai di dalam PipelineProvider.');
  }
  return ctx;
}
