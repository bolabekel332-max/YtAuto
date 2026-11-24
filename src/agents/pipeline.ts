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
import {
  normalizeComplianceVerdict,
  type AgentId,
  type AgentModelConfig,
  type AgentResult,
  type ChannelProfile,
  type ComplianceVerdict,
  type HistoryEntry,
  type KnowledgeBlock,
  type PendingRevision,
  type PipelineRun,
  type PipelineStepId,
  type RevisableAgentId,
  type RevisionFeedback,
  type RunInput,
  type StepState,
  type StyleProfile,
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
  runAgentFn?: typeof runAgent;
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

function summarizeResearchForCompliance(research?: ResearcherOutput): string | undefined {
  if (!research) return undefined;
  const parts: string[] = [];
  if (research.nicheMap) {
    parts.push(`Peta Niche: ${research.nicheMap}`);
  }
  if (research.contentPillars?.length) {
    parts.push(
      `Pilar: ${research.contentPillars.map((p) => `${p.name} (${p.description})`).join('; ')}`
    );
  }
  if (research.ideas?.length) {
    parts.push(`Ide: ${research.ideas.map((i) => i.title).join('; ')}`);
  }
  const combined = parts.join('\n').trim();
  return combined ? combined.slice(0, 6000) : undefined;
}

export function compactPreviousOutputForRevision(val: unknown): unknown {
  if (val === undefined) return undefined;
  try {
    const serialized = JSON.stringify(val);
    if (typeof serialized === 'string' && serialized.length <= 58_000) {
      return val;
    }
    return {
      truncated: true,
      preview: (serialized ?? '').slice(0, 56_000),
    };
  } catch {
    return undefined;
  }
}

export function buildRevisionFeedbackForAgent(
  pending: PendingRevision | undefined,
  agentId: RevisableAgentId
): RevisionFeedback | undefined {
  if (!pending) return undefined;
  const relevantIssues = pending.issues
    .filter((i) => i.relatedAgent === agentId)
    .slice(0, 20)
    .map((i) => ({
      severity: i.severity,
      relatedAgent: i.relatedAgent,
      problem: i.problem.slice(0, 4000),
      fix: i.fix.slice(0, 4000),
    }));
  if (relevantIssues.length === 0) return undefined;
  return {
    round: pending.round,
    issues: relevantIssues,
    previousOutput: compactPreviousOutputForRevision(pending.previousOutputs[agentId]),
  };
}

function toNormalizedComplianceVerdict(compOut: ComplianceOutput): ComplianceVerdict {
  return normalizeComplianceVerdict({
    verdict: compOut.verdict,
    issues: compOut.issues,
    similarityRisks: compOut.similarityRisks,
    notes: compOut.notes,
  });
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
        researchSummary: summarizeResearchForCompliance(researchResult),
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
    const runner = ctx.runAgentFn ?? runAgent;
    const result = await runner(
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
      (err instanceof Error && err.name === 'AbortError') ||
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
    pendingRevision: undefined,
    status: finalStatus,
  };
  ctx.onRunUpdate(completedRun);

  const existingEntry = ctx.history.find((h) => h.id === completedRun.id);
  const entry: HistoryEntry = {
    id: completedRun.id,
    createdAt: existingEntry?.createdAt ?? new Date().toISOString(),
    input: completedRun.input,
    run: completedRun,
    selection: existingEntry?.selection
      ? { ...existingEntry.selection }
      : {
          titleIndex: 0,
          hookIndex: 0,
        },
    profileSnapshot: structuredClone(ctx.profile),
    styleProfileSnapshot: activeStyle ? structuredClone(activeStyle) : undefined,
  };
  ctx.onHistorySave(entry);
  return completedRun;
}

async function runPendingRevisionPass(
  currentRun: PipelineRun,
  ctx: PipelineContext,
  activeStyle: StyleProfile | undefined
): Promise<{ ok: true; run: PipelineRun } | { ok: false; run: PipelineRun }> {
  let run = currentRun;
  if (!run.pendingRevision) {
    return { ok: true, run };
  }

  for (const agentId of [...run.pendingRevision.remainingAgents]) {
    const activePending = run.pendingRevision;
    if (!activePending) break;
    if (run.steps[agentId].status === 'skipped') {
      const remaining = activePending.remainingAgents.filter((id) => id !== agentId);
      run = {
        ...run,
        pendingRevision: {
          ...activePending,
          remainingAgents: remaining,
        },
      };
      ctx.onRunUpdate(run);
      continue;
    }

    const feedback = buildRevisionFeedbackForAgent(activePending, agentId);
    const rerunRes = await executeSingleStep(agentId, run, ctx, activeStyle, feedback);
    if (!rerunRes.ok) {
      return { ok: false, run: rerunRes.run };
    }
    run = {
      ...rerunRes.run,
      pendingRevision: rerunRes.run.pendingRevision
        ? {
            ...rerunRes.run.pendingRevision,
            remainingAgents: rerunRes.run.pendingRevision.remainingAgents.filter(
              (id) => id !== agentId
            ),
          }
        : undefined,
    };
    ctx.onRunUpdate(run);
  }

  // Jalankan ulang Compliance setelah seluruh agent terdampak selesai (kecuali jika di-skip)
  if (run.steps.compliance.status !== 'done' && run.steps.compliance.status !== 'skipped') {
    const compRes = await executeSingleStep('compliance', run, ctx, activeStyle);
    if (!compRes.ok) {
      return { ok: false, run: compRes.run };
    }
    const compOut = compRes.result.output as ComplianceOutput;
    run = {
      ...compRes.run,
      pendingRevision: undefined,
      complianceRounds: [...compRes.run.complianceRounds, toNormalizedComplianceVerdict(compOut)],
    };
    ctx.onRunUpdate(run);
  } else {
    run = {
      ...run,
      pendingRevision: undefined,
    };
    ctx.onRunUpdate(run);
  }

  return { ok: true, run };
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

    // 1. Jika sedang melanjutkan putaran revisi yang terputus/jeda, selesaikan dulu dengan RevisionFeedback tersimpan
    if (run.pendingRevision) {
      const pendingOutcome = await runPendingRevisionPass(run, ctx, activeStyle);
      if (!pendingOutcome.ok) {
        return pendingOutcome.run;
      }
      run = pendingOutcome.run;
    } else {
      // Jalankan langkah inti berurutan yang belum done/skipped
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
          run = {
            ...run,
            complianceRounds: [...run.complianceRounds, toNormalizedComplianceVerdict(compOut)],
          };
          ctx.onRunUpdate(run);
        }
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

      // Simpan output sebelumnya & reset SELURUH langkah terdampak + compliance + orchestrator ke idle (F-14)
      const previousOutputs: Partial<Record<RevisableAgentId, unknown>> = {};
      const updatedSteps = { ...run.steps };
      for (const agentId of toRerun) {
        previousOutputs[agentId] = compactPreviousOutputForRevision(
          run.steps[agentId].result?.output
        );
        if (updatedSteps[agentId].status !== 'skipped') {
          updatedSteps[agentId] = makeIdleStep();
        }
      }
      updatedSteps.compliance = makeIdleStep();
      updatedSteps.orchestrator = makeIdleStep();

      run = {
        ...run,
        round: nextRound,
        pendingRevision: {
          round: nextRound,
          remainingAgents: toRerun,
          issues: latestVerdict.issues.slice(0, 30),
          previousOutputs,
        },
        steps: updatedSteps,
      };
      ctx.onRunUpdate(run);

      const revisionOutcome = await runPendingRevisionPass(run, ctx, activeStyle);
      if (!revisionOutcome.ok) {
        return revisionOutcome.run;
      }
      run = revisionOutcome.run;
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

export function getInvalidatedDownstreamSteps(stepId: PipelineStepId): PipelineStepId[] {
  switch (stepId) {
    case 'researcher':
      return ['scriptwriter', 'visual', 'packaging', 'compliance', 'orchestrator'];
    case 'scriptwriter':
      return ['visual', 'packaging', 'compliance', 'orchestrator'];
    case 'visual':
    case 'packaging':
      return ['compliance', 'orchestrator'];
    case 'compliance':
      return ['orchestrator'];
    case 'orchestrator':
      return [];
  }
}

export function runPipeline(input: RunInput, ctx: PipelineContext): Promise<PipelineRun> {
  if (activePipelineLock) {
    return Promise.reject(new Error('Masih ada satu proses pipeline yang sedang berjalan.'));
  }
  const initial = createInitialRun(input);
  ctx.onRunUpdate(initial);
  return continueDeterministicPipeline(initial, ctx);
}

export function resumeRun(run: PipelineRun, ctx: PipelineContext): Promise<PipelineRun> {
  if (activePipelineLock) {
    return Promise.reject(new Error('Masih ada satu proses pipeline yang sedang berjalan.'));
  }
  return continueDeterministicPipeline(run, ctx);
}

export function retryStep(
  run: PipelineRun,
  stepId: PipelineStepId,
  ctx: PipelineContext
): Promise<PipelineRun> {
  if (activePipelineLock) {
    return Promise.reject(new Error('Masih ada satu proses pipeline yang sedang berjalan.'));
  }

  const downstream = getInvalidatedDownstreamSteps(stepId);
  const updatedSteps = {
    ...run.steps,
    [stepId]: {
      ...run.steps[stepId],
      status: 'idle' as const,
      error: undefined,
    },
  };
  for (const depId of downstream) {
    if (updatedSteps[depId].status !== 'skipped') {
      updatedSteps[depId] = makeIdleStep();
    }
  }

  let updatedPendingRevision = run.pendingRevision;
  if (
    updatedPendingRevision &&
    (stepId === 'scriptwriter' || stepId === 'visual' || stepId === 'packaging')
  ) {
    const affected = getDownstream([stepId]);
    const combined = Array.from(
      new Set([...affected, ...updatedPendingRevision.remainingAgents])
    ) as RevisableAgentId[];
    const ordered: RevisableAgentId[] = ['scriptwriter', 'visual', 'packaging'].filter((id) =>
      combined.includes(id as RevisableAgentId)
    ) as RevisableAgentId[];
    updatedPendingRevision = {
      ...updatedPendingRevision,
      remainingAgents: ordered,
    };
  }

  const resetRun: PipelineRun = {
    ...run,
    status: 'running',
    pendingRevision: updatedPendingRevision,
    steps: updatedSteps,
  };
  ctx.onRunUpdate(resetRun);
  return continueDeterministicPipeline(resetRun, ctx);
}

export function skipStep(
  run: PipelineRun,
  stepId: PipelineStepId,
  ctx: PipelineContext
): Promise<PipelineRun> {
  if (activePipelineLock) {
    return Promise.reject(new Error('Masih ada satu proses pipeline yang sedang berjalan.'));
  }
  if (stepId === 'scriptwriter') {
    return Promise.reject(new Error('Langkah Penulis Naskah tidak dapat dilewati.'));
  }

  const updatedPendingRevision = run.pendingRevision
    ? {
        ...run.pendingRevision,
        remainingAgents: run.pendingRevision.remainingAgents.filter((id) => id !== stepId),
      }
    : undefined;

  const skippedRun: PipelineRun = {
    ...run,
    status: 'running',
    pendingRevision: updatedPendingRevision,
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
