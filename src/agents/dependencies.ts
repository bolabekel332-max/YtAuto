import type {
  AgentId,
  AgentModelConfig,
  RevisableAgentId,
  RunInput,
} from '../../shared/schemas';

/**
 * Mengembalikan daftar agent revisi terdampak sesuai graf dependensi (BP 8.2):
 * - Jika scriptwriter direvisi -> scriptwriter, visual, packaging diulang.
 * - Jika hanya visual -> hanya visual.
 * - Jika hanya packaging -> hanya packaging.
 */
export function getDownstream(affectedAgents: RevisableAgentId[]): RevisableAgentId[] {
  const set = new Set<RevisableAgentId>(affectedAgents);
  if (set.has('scriptwriter')) {
    set.add('visual');
    set.add('packaging');
  }
  const ordered: RevisableAgentId[] = ['scriptwriter', 'visual', 'packaging'];
  return ordered.filter((id) => set.has(id));
}

function callsForAgent(agentId: AgentId, modelConfigs: AgentModelConfig[]): number {
  const cfg = modelConfigs.find((c) => c.agentId === agentId);
  if (!cfg) return 1;
  // Sesuai rumus BP 8.5, jika searchMode two_step aktif pada konfigurasi compliance/researcher,
  // tampilkan hitungan two_step (2) agar pengguna mengetahui estimasi dua langkahnya secara konsisten.
  if (
    (agentId === 'researcher' || agentId === 'compliance') &&
    cfg.useSearch &&
    cfg.searchMode === 'two_step'
  ) {
    return 2;
  }
  return 1;
}

export interface CallEstimate {
  baselineCalls: number;
  researchCalls: number;
  complianceCallsPerPass: number;
  maxRevisionCallsPerRound: number;
  worstCaseCalls: number;
}

/**
 * Menghitung perkiraan panggilan model sebelum run (BP 8.5).
 * Tidak menghitung retry, model cadangan, atau validasi ulang.
 */
export function estimateCalls(
  input: Pick<RunInput, 'includeResearch'>,
  modelConfigs: AgentModelConfig[]
): CallEstimate {
  const researchCalls = input.includeResearch ? callsForAgent('researcher', modelConfigs) : 0;
  const scriptCalls = callsForAgent('scriptwriter', modelConfigs);
  const visualCalls = callsForAgent('visual', modelConfigs);
  const packagingCalls = callsForAgent('packaging', modelConfigs);
  const complianceCallsPerPass = callsForAgent('compliance', modelConfigs);
  const orchestratorCalls = callsForAgent('orchestrator', modelConfigs);

  const baselineCalls =
    researchCalls +
    scriptCalls +
    visualCalls +
    packagingCalls +
    complianceCallsPerPass +
    orchestratorCalls;

  const maxRevisionCallsPerRound =
    scriptCalls + visualCalls + packagingCalls + complianceCallsPerPass;

  const worstCaseCalls = baselineCalls + maxRevisionCallsPerRound * 2;

  return {
    baselineCalls,
    researchCalls,
    complianceCallsPerPass,
    maxRevisionCallsPerRound,
    worstCaseCalls,
  };
}
