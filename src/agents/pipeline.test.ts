import test from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURES } from '../../server/providers/mockFixtures';
import { SAMPLE_PROFILE_FOR_TEST } from '../../shared/agentInputs';
import type { AgentRunRequest } from '../../shared/api';
import type { AgentResult, HistoryEntry, PipelineRun } from '../../shared/schemas';
import { DEFAULT_KNOWLEDGE } from '../knowledge/blocks';
import { DEFAULT_MODEL_CONFIGS } from '../state/defaults';
import {
  getInvalidatedDownstreamSteps,
  isPipelineLocked,
  resumeRun,
  retryStep,
  runPipeline,
  type PipelineContext,
} from './pipeline';

function fixtureFor(agentId: AgentResult['agentId']): unknown {
  return agentId === 'style_analyst' ? FIXTURES.styleAnalyst : FIXTURES[agentId];
}

function makeResult(agentId: AgentResult['agentId'], output: unknown): AgentResult {
  return {
    agentId,
    output,
    model: 'mock-sim-v1',
    providerId: 'mock',
    isMock: true,
    searchUsed: false,
    groundedSourceCount: 0,
    fallbackUsed: false,
    latencyMs: 5,
    tokens: 100,
  };
}

function makeBaseCtx(
  runAgentFn: PipelineContext['runAgentFn'],
  history: HistoryEntry[] = []
): {
  ctx: PipelineContext;
  savedHistory: HistoryEntry[];
  updates: PipelineRun[];
} {
  const updates: PipelineRun[] = [];
  const savedHistory: HistoryEntry[] = [...history];
  const ctx: PipelineContext = {
    profile: SAMPLE_PROFILE_FOR_TEST,
    styleProfiles: [],
    modelConfigs: DEFAULT_MODEL_CONFIGS,
    knowledge: DEFAULT_KNOWLEDGE,
    history: savedHistory,
    onRunUpdate: (r) => {
      updates.push(structuredClone(r));
    },
    onHistorySave: (entry) => {
      const idx = savedHistory.findIndex((h) => h.id === entry.id);
      if (idx >= 0) savedHistory[idx] = entry;
      else savedHistory.unshift(entry);
    },
    runAgentFn,
  };
  return { ctx, savedHistory, updates };
}

test('runPipeline mengirim researchSummary ke Compliance dan menyelesaikan alur deterministik (F-12)', async () => {
  const seenRequests: AgentRunRequest[] = [];
  const { ctx, savedHistory } = makeBaseCtx(async (req) => {
    seenRequests.push(req);
    return makeResult(req.agentId, fixtureFor(req.agentId));
  });

  const completed = await runPipeline(
    { topic: 'Cara kerja jam atom', targetPlatform: 'youtube_shorts', includeResearch: true },
    ctx
  );

  assert.equal(completed.status, 'completed');
  assert.deepEqual(
    seenRequests.map((r) => r.agentId),
    ['researcher', 'scriptwriter', 'visual', 'packaging', 'compliance', 'orchestrator']
  );

  const compReq = seenRequests.find((r) => r.agentId === 'compliance');
  const compInput = compReq?.input as { researchSummary?: string } | undefined;
  assert.ok(compInput?.researchSummary && compInput.researchSummary.length > 0);
  assert.equal(savedHistory.length, 1);
});

test('F-14: putaran revisi mereset downstream + compliance + orchestrator, menyimpan pendingRevision saat interupsi, lalu resume melanjutkan dengan RevisionFeedback', async () => {
  const calls: Array<{ agentId: string; hasFeedback: boolean; round?: number }> = [];
  let compPass = 0;
  let abortOnRound1Visual = true;

  const { ctx } = makeBaseCtx(async (req) => {
    calls.push({
      agentId: req.agentId,
      hasFeedback: Boolean(req.revisionFeedback),
      round: req.revisionFeedback?.round,
    });

    if (req.agentId === 'visual' && abortOnRound1Visual && calls.filter((c) => c.agentId === 'visual').length === 2) {
      abortOnRound1Visual = false;
      const abortErr = new Error('Aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    if (req.agentId === 'compliance') {
      compPass += 1;
      if (compPass === 1) {
        return makeResult('compliance', {
          ...(FIXTURES.compliance as Record<string, unknown>),
          verdict: 'revise',
          issues: [
            {
              severity: 'high',
              relatedAgent: 'scriptwriter',
              problem: 'Klaim terlalu mutlak',
              fix: 'Gunakan bahasa kehati-hatian',
            },
          ],
        });
      }
      return makeResult('compliance', FIXTURES.compliance);
    }

    return makeResult(req.agentId, fixtureFor(req.agentId));
  });

  const interrupted = await runPipeline(
    { topic: 'Uji revisi terputus', targetPlatform: 'youtube_shorts', includeResearch: false },
    ctx
  );

  assert.equal(interrupted.status, 'interrupted');
  assert.equal(interrupted.round, 1);
  assert.ok(interrupted.pendingRevision);
  assert.deepEqual(interrupted.pendingRevision.remainingAgents, ['visual', 'packaging']);
  assert.equal(interrupted.steps.scriptwriter.status, 'done');
  assert.equal(interrupted.steps.compliance.status, 'idle');
  assert.equal(interrupted.steps.orchestrator.status, 'idle');

  // Scriptwriter di putaran 1 menerima revisionFeedback
  const round1ScriptCall = calls.filter((c) => c.agentId === 'scriptwriter')[1];
  assert.equal(round1ScriptCall.hasFeedback, true);
  assert.equal(round1ScriptCall.round, 1);

  const resumed = await resumeRun(interrupted, ctx);
  assert.equal(resumed.status, 'completed');
  assert.equal(resumed.pendingRevision, undefined);
  assert.equal(resumed.complianceRounds.length, 2);
});

test('F-17, F-19, retryStep: lock berjalan sebelum onRunUpdate, retryStep mereset downstream, dan finalizeRun menjaga selection riwayat lama', async () => {
  assert.deepEqual(getInvalidatedDownstreamSteps('scriptwriter'), [
    'visual',
    'packaging',
    'compliance',
    'orchestrator',
  ]);

  let releaseFirst!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const updates: PipelineRun[] = [];
  const { ctx: slowCtx } = makeBaseCtx(async (req) => {
    if (req.agentId === 'scriptwriter') {
      await gate;
    }
    return makeResult(req.agentId, fixtureFor(req.agentId));
  });
  slowCtx.onRunUpdate = (r) => updates.push(r);

  const firstPromise = runPipeline(
    { topic: 'Run pertama', targetPlatform: 'youtube_shorts', includeResearch: false },
    slowCtx
  );
  assert.equal(isPipelineLocked(), true);

  let secondUpdated = false;
  await assert.rejects(
    () =>
      runPipeline(
        { topic: 'Run tabrakan', targetPlatform: 'youtube_shorts', includeResearch: false },
        {
          ...slowCtx,
          onRunUpdate: () => {
            secondUpdated = true;
          },
        }
      ),
    /sedang berjalan/
  );
  assert.equal(secondUpdated, false);

  releaseFirst();
  const doneRun = await firstPromise;
  assert.equal(isPipelineLocked(), false);
  assert.equal(doneRun.status, 'completed');

  // Preserve selection & createdAt on retryStep
  const preservedHistory: HistoryEntry[] = [
    {
      id: doneRun.id,
      createdAt: '2026-01-01T00:00:00.000Z',
      input: doneRun.input,
      run: doneRun,
      selection: { titleIndex: 2, hookIndex: 1 },
      profileSnapshot: SAMPLE_PROFILE_FOR_TEST,
    },
  ];
  const retryAgents: string[] = [];
  const { ctx: retryCtx, savedHistory } = makeBaseCtx(async (req) => {
    retryAgents.push(req.agentId);
    return makeResult(req.agentId, fixtureFor(req.agentId));
  }, preservedHistory);

  const retried = await retryStep(doneRun, 'packaging', retryCtx);
  assert.deepEqual(retryAgents, ['packaging', 'compliance', 'orchestrator']);
  assert.equal(retried.status, 'completed');
  assert.deepEqual(savedHistory[0].selection, { titleIndex: 2, hookIndex: 1 });
  assert.equal(savedHistory[0].createdAt, '2026-01-01T00:00:00.000Z');
});
