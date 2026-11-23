import { MAX_RECENT_VIDEOS, MAX_REVISION_ROUNDS } from '../../shared/constants';
import type {
  ComplianceOutput,
  OrchestratorOutput,
  PackagingOutput,
  ResearcherOutput,
  ScriptwriterOutput,
  VisualOutput,
} from '../../shared/agentSchemas';
import type { RecentVideo } from '../../shared/agentInputs';
import type {
  AgentId,
  AgentModelConfig,
  AgentResult,
  ChannelProfile,
  ComplianceVerdict,
  HistoryEntry,
  KnowledgeBlock,
  PipelineRun,
  PipelineStepId,
  RevisableAgentId,
  RevisionFeedback,
  RunInput,
  StepState,
  StyleProfile,
} from '../../shared/schemas';
import { runAgent } from '../api/client';
import { getDownstream } from './dependencies';

export interface PipelineContext {
  profile: ChannelProfile;
  styleProfiles: StyleProfile[];
  modelConfigs: AgentModelConfig[];
  knowledge: KnowledgeBlock[];
  history: HistoryEntry[];
  signal?: AbortSignal;
  onRunUpdate: (run: PipelineRun) => void;
  onHistorySave: (entry: HistoryEntry) => void;
}

let activePipelineLock = false;

export function isPipelineLocked(): boolean {
  return activePipelineLock;
}

function makeIdleStep(): StepState {
  return { status: 'idle' };
}

export function createInitialRun(input: RunInput): PipelineRun {
  return {
    id: `run_${Date.now()}`,
    input,
    steps: {
      researcher: input.includeResearch ? makeIdleStep() : { status: 'skipped' },
      scriptwriter: makeIdleStep(),
      visual: makeIdleStep(),
      packaging: makeIdleStep(),
      compliance: makeIdleStep(),
      orchestrator: makeIdleStep(),
    },
    round: 0,
    complianceRounds: [],
    status: 'running',
  };
}

function getConfigFor(configs: AgentModelConfig[], agentId: AgentId): AgentModelConfig {
  const found = configs.find((c) => c.agentId === agentId);
  if (!found) {
    throw new Error(`Konfigurasi model untuk agent ${agentId} tidak ditemukan.`);
  }
  return found;
}

function resolveActiveStyleProfile(
  input: RunInput,
  profile: ChannelProfile,
  styleProfiles: StyleProfile[]
): StyleProfile | undefined {
  const targetId = input.styleProfileId ?? profile.visualStyle.defaultStyleProfileId;
  if (!targetId) return undefined;
  return styleProfiles.find((s) => s.id === targetId);
}

function buildRecentVideos(history: HistoryEntry[]): RecentVideo[] {
  return history.slice(0, MAX_RECENT_VIDEOS).map((entry) => {
    const pkg = entry.run.steps.packaging.result?.output as PackagingOutput | undefined;
    const scr = entry.run.steps.scriptwriter.result?.output as ScriptwriterOutput | undefined;
    const title =
      pkg?.titles?.[entry.selection.titleIndex] ??
      pkg?.titles?.[0] ??
      entry.input.topic;
    const hook =
      scr?.hooks?.[entry.selection.hookIndex] ??
      scr?.hooks?.[0] ??
      '';
    const openingPattern = scr?.script?.[0]?.section ?? 'Pembuka standar';
    return { title, hook, openingPattern };
  });
}

function summarizeStyleForScript(styleProfile?: StyleProfile) {
  if (!styleProfile) return undefined;
  const ignored = new Set(styleProfile.ignoredAttributes ?? []);
  return {
    rhythmPattern: ignored.has('rhythm')
      ? undefined
      : styleProfile.attributes.rhythm.value.pattern,
    avgShotSec: ignored.has('rhythm')
      ? undefined
      : styleProfile.attributes.rhythm.value.avgShotSec,
    cutsPerMin: ignored.has('rhythm')
      ? undefined
      : styleProfile.attributes.rhythm.value.cutsPerMin,
    hookVisual: ignored.has('hookVisual')
      ? undefined
      : styleProfile.attributes.hookVisual.value,
  };
}

function summarizeStyleForVisual(styleProfile?: StyleProfile) {
  if (!styleProfile) return undefined;
  const ignored = new Set(styleProfile.ignoredAttributes ?? []);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(styleProfile.attributes)) {
    if (!ignored.has(k)) {
      out[k] = v;
    }
  }
  return out;
}

function buildStepInput(
  stepId: PipelineStepId,
  run: PipelineRun,
  ctx: PipelineContext,
  activeStyle: StyleProfile | undefined
): unknown {
  const researchResult = run.steps.researcher.result?.output as ResearcherOutput | undefined;
  const scriptOutput = run.steps.scriptwriter.result?.output as ScriptwriterOutput | undefined;
  const visualOutput = run.steps.visual.result?.output as VisualOutput | undefined;
  const packagingOutput = run.steps.packaging.result?.output as PackagingOutput | undefined;
  const complianceOutput = run.steps.compliance.result?.output as ComplianceOutput | undefined;
  const recentVideos = buildRecentVideos(ctx.history);

  switch (stepId) {
    case 'researcher':
      return {
        targetPlatform: run.input.targetPlatform,
        topic: run.input.topic,
        profile: ctx.profile,
      };

    case 'scriptwriter':
      return {
        topic: run.input.topic,
        targetPlatform: run.input.targetPlatform,
        researchResult,
        styleHints: summarizeStyleForScript(activeStyle),
      };

    case 'visual':
      if (!scriptOutput) {
        throw new Error('Output naskah belum tersedia untuk Pengarah Visual.');
      }
      return {
        script: scriptOutput,
        targetPlatform: run.input.targetPlatform,
        styleSummary: summarizeStyleForVisual(activeStyle),
      };

    case 'packaging': {
      const summaryText = scriptOutput
        ? scriptOutput.script.map((s) => `${s.section}: ${s.narration}`).join(' ').slice(0, 3000)
        : run.input.topic;
      const hooks =
        scriptOutput && scriptOutput.hooks.length > 0
          ? scriptOutput.hooks
          : [run.input.topic];
      const ignored = new Set(activeStyle?.ignoredAttributes ?? []);
      return {
        topic: run.input.topic,
        scriptSummary: summaryText,
        hooks,
        targetPlatform: run.input.targetPlatform,
        thumbnailStylePattern:
          activeStyle && !ignored.has('thumbnail')
            ? activeStyle.attributes.thumbnail.value
            : undefined,
      };
    }

    case 'compliance':
      if (!scriptOutput || !visualOutput || !packagingOutput) {
        throw new Error(
          'Naskah, arahan visual, dan packaging wajib tersedia sebelum pemeriksaan Kepatuhan.'
        );
      }
      return {
        topic: run.input.topic,
        targetPlatform: run.input.targetPlatform,
        script: scriptOutput,
        visual: visualOutput,
        packaging: packagingOutput,
        activeStyleReferenceIds: activeStyle?.referenceIds,
        styleSummary: summarizeStyleForVisual(activeStyle),
        recentVideos,
      };

    case 'orchestrator': {
      const stepStatuses: Record<string, string> = {};
      for (const [k, v] of Object.entries(run.steps)) {
        stepStatuses[k] = v.status;
      }
      return {
        runInput: run.input,
        profile: ctx.profile,
        stepStatuses,
        researchOutput: researchResult,
        scriptOutput,
        visualOutput,
        packagingOutput,
        complianceOutput,
        complianceSkipped: run.steps.compliance.status === 'skipped',
        recentVideos,
      };
    }
  }
}

async function executeSingleStep(
  stepId: PipelineStepId,
  run: PipelineRun,
  ctx: PipelineContext,
  activeStyle: StyleProfile | undefined,
  revisionFeedback?: RevisionFeedback
): Promise<{ ok: true; run: PipelineRun; result: AgentResult } | { ok: false; run: PipelineRun }> {
  if (ctx.signal?.aborted) {
    const abortedRun: PipelineRun = {
      ...run,
      status: 'interrupted',
    };
    ctx.onRunUpdate(abortedRun);
    return { ok: false, run: abortedRun };
  }

  let working: PipelineRun = {
    ...run,
    status: 'running',
    steps: {
      ...run.steps,
      [stepId]: {
        ...run.steps[stepId],
        status: 'running',
        error: undefined,
      },
    },
  };
  ctx.onRunUpdate(working);

  try {
    const inputPayload = buildStepInput(stepId, working, ctx, activeStyle);
    const result = await runAgent(
      {
        agentId: stepId,
        mode: 'default',
        input: inputPayload,
        revisionFeedback,
        profile: ctx.profile,
        styleProfile: activeStyle,
        knowledge: ctx.knowledge,
        config: getConfigFor(ctx.modelConfigs, stepId),
      },
      ctx.signal
    );

    working = {
      ...working,
      steps: {
        ...working.steps,
        [stepId]: {
          status: 'done',
          result,
        },
      },
    };
    ctx.onRunUpdate(working);
    return { ok: true, run: working, result };
  } catch (err) {
    const isAborted =
      Boolean(ctx.signal?.aborted) ||
      (err instanceof DOMException && err.name === 'AbortError');
    if (isAborted) {
      working = {
        ...working,
        status: 'interrupted',
        steps: {
          ...working.steps,
          [stepId]: {
            ...working.steps[stepId],
            status: 'idle',
            error: undefined,
          },
        },
      };
      ctx.onRunUpdate(working);
      return { ok: false, run: working };
    }

    const errorMsg =
      err instanceof Error ? err.message : 'Langkah gagal dijalankan karena error tak terduga.';
    working = {
      ...working,
      status: 'paused',
      steps: {
        ...working.steps,
        [stepId]: {
          ...working.steps[stepId],
          status: 'failed',
          error: errorMsg,
        },
      },
    };
    ctx.onRunUpdate(working);
    return { ok: false, run: working };
  }
}

function finalizeRun(
  run: PipelineRun,
  ctx: PipelineContext,
  activeStyle: StyleProfile | undefined
): PipelineRun {
  const lastVerdict = run.complianceRounds[run.complianceRounds.length - 1];
  const complianceSkipped = run.steps.compliance.status === 'skipped';
  const finalStatus: PipelineRun['status'] =
    !complianceSkipped && lastVerdict?.verdict === 'reject' ? 'blocked' : 'completed';

  const completedRun: PipelineRun = {
    ...run,
    status: finalStatus,
  };
  ctx.onRunUpdate(completedRun);

  const entry: HistoryEntry = {
    id: completedRun.id,
    createdAt: new Date().toISOString(),
    input: completedRun.input,
    run: completedRun,
    selection: {
      titleIndex: 0,
      hookIndex: 0,
    },
    profileSnapshot: structuredClone(ctx.profile),
    styleProfileSnapshot: activeStyle ? structuredClone(activeStyle) : undefined,
  };
  ctx.onHistorySave(entry);
  return completedRun;
}

async function continueDeterministicPipeline(
  initialRun: PipelineRun,
  ctx: PipelineContext
): Promise<PipelineRun> {
  if (activePipelineLock) {
    throw new Error('Masih ada satu proses pipeline yang sedang berjalan.');
  }

  activePipelineLock = true;
  try {
    let run = structuredClone(initialRun);
    const activeStyle = resolveActiveStyleProfile(run.input, ctx.profile, ctx.styleProfiles);

    const coreSequence: PipelineStepId[] = [
      'researcher',
      'scriptwriter',
      'visual',
      'packaging',
      'compliance',
    ];

    // 1. Jalankan langkah berurutan yang belum done/skipped
    for (const stepId of coreSequence) {
      const state = run.steps[stepId];
      if (state.status === 'done' || state.status === 'skipped') {
        continue;
      }

      const outcome = await executeSingleStep(stepId, run, ctx, activeStyle);
      if (!outcome.ok) {
        return outcome.run;
      }
      run = outcome.run;

      if (stepId === 'compliance') {
        const compOut = outcome.result.output as ComplianceOutput;
        const verdictObj: ComplianceVerdict = {
          verdict: compOut.verdict,
          issues: compOut.issues,
          similarityRisks: compOut.similarityRisks,
          notes: compOut.notes,
        };
        run = {
          ...run,
          complianceRounds: [...run.complianceRounds, verdictObj],
        };
        ctx.onRunUpdate(run);
      }
    }

    // 2. Putaran revisi Kepatuhan (maksimal 2 putaran)
    while (run.steps.compliance.status === 'done' && run.round < MAX_REVISION_ROUNDS) {
      const latestVerdict = run.complianceRounds[run.complianceRounds.length - 1];
      if (!latestVerdict || latestVerdict.verdict === 'pass') {
        break;
      }

      const nextRound = (run.round + 1) as 1 | 2;
      const directlyFlagged = Array.from(
        new Set(latestVerdict.issues.map((i) => i.relatedAgent))
      ) as RevisableAgentId[];

      // Jika model memberi revise/reject namun issues kosong, default ke scriptwriter agar tidak loop kosong
      const targetSeed: RevisableAgentId[] =
        directlyFlagged.length > 0 ? directlyFlagged : ['scriptwriter'];
      const toRerun = getDownstream(targetSeed);

      // Simpan output sebelumnya untuk RevisionFeedback lalu tandai langkah terdampak untuk diulang
      const previousOutputs: Partial<Record<RevisableAgentId, unknown>> = {};
      for (const agentId of toRerun) {
        previousOutputs[agentId] = run.steps[agentId].result?.output;
      }

      run = {
        ...run,
        round: nextRound,
        steps: {
          ...run.steps,
          compliance: makeIdleStep(),
        },
      };
      ctx.onRunUpdate(run);

      for (const agentId of toRerun) {
        const relevantIssues = latestVerdict.issues.filter(
          (i) => i.relatedAgent === agentId
        );
        const feedback: RevisionFeedback | undefined =
          relevantIssues.length > 0
            ? {
                round: nextRound,
                issues: relevantIssues,
                previousOutput: previousOutputs[agentId],
              }
            : undefined;

        const rerunRes = await executeSingleStep(agentId, run, ctx, activeStyle, feedback);
        if (!rerunRes.ok) {
          return rerunRes.run;
        }
        run = rerunRes.run;
      }

      // Jalankan ulang Compliance setelah seluruh agent terdampak selesai
      const compRes = await executeSingleStep('compliance', run, ctx, activeStyle);
      if (!compRes.ok) {
        return compRes.run;
      }
      run = compRes.run;
      const compOut = compRes.result.output as ComplianceOutput;
      run = {
        ...run,
        complianceRounds: [
          ...run.complianceRounds,
          {
            verdict: compOut.verdict,
            issues: compOut.issues,
            similarityRisks: compOut.similarityRisks,
            notes: compOut.notes,
          },
        ],
      };
      ctx.onRunUpdate(run);
    }

    // 3. Orkestrator selalu berjalan di paling akhir sebagai ringkasan QC
    if (run.steps.orchestrator.status !== 'done' && run.steps.orchestrator.status !== 'skipped') {
      const orchOutcome = await executeSingleStep('orchestrator', run, ctx, activeStyle);
      if (!orchOutcome.ok) {
        return orchOutcome.run;
      }
      run = orchOutcome.run;
    }

    return finalizeRun(run, ctx, activeStyle);
  } finally {
    activePipelineLock = false;
  }
}

export function runPipeline(input: RunInput, ctx: PipelineContext): Promise<PipelineRun> {
  const initial = createInitialRun(input);
  ctx.onRunUpdate(initial);
  return continueDeterministicPipeline(initial, ctx);
}

export function resumeRun(run: PipelineRun, ctx: PipelineContext): Promise<PipelineRun> {
  return continueDeterministicPipeline(run, ctx);
}

export function retryStep(
  run: PipelineRun,
  stepId: PipelineStepId,
  ctx: PipelineContext
): Promise<PipelineRun> {
  const resetRun: PipelineRun = {
    ...run,
    status: 'running',
    steps: {
      ...run.steps,
      [stepId]: {
        ...run.steps[stepId],
        status: 'idle',
        error: undefined,
      },
    },
  };
  ctx.onRunUpdate(resetRun);
  return continueDeterministicPipeline(resetRun, ctx);
}

export function skipStep(
  run: PipelineRun,
  stepId: PipelineStepId,
  ctx: PipelineContext
): Promise<PipelineRun> {
  const skippedRun: PipelineRun = {
    ...run,
    status: 'running',
    steps: {
      ...run.steps,
      [stepId]: {
        status: 'skipped',
      },
    },
  };
  ctx.onRunUpdate(skippedRun);
  return continueDeterministicPipeline(skippedRun, ctx);
}

export function extractOrchestratorSummary(run: PipelineRun): OrchestratorOutput | undefined {
  return run.steps.orchestrator.result?.output as OrchestratorOutput | undefined;
}
