import { AGENTS } from '../../shared/agentRegistry';
import { PROVIDER_CAPABILITIES, PROVIDER_IDS } from '../../shared/constants';
import type {
  AgentId,
  AgentModelConfig,
  KnowledgeBlock,
  ProviderId,
} from '../../shared/schemas';
import { label } from '../config/labels';

export type SearchGroundingStatus = 'active' | 'disabled' | 'unsupported' | 'not_used';

export interface ExternalSourceSummaryItem {
  id: 'industry_reports' | 'web_search' | 'trends_api' | 'wikipedia';
  name: string;
  status: 'active' | 'conditional' | 'not_connected';
  statusLabel: string;
  description: string;
}

export interface AgentTransparencyItem {
  agentId: AgentId;
  agentName: string;
  persona: string;
  injectedBlocks: KnowledgeBlock[];
  searchStatus: SearchGroundingStatus;
  searchStatusDetail: string;
  providerId?: ProviderId;
  userInputs: string[];
}

export interface KnowledgeTransparencyReport {
  externalSources: ExternalSourceSummaryItem[];
  agents: AgentTransparencyItem[];
}

const ORDERED_AGENT_IDS: AgentId[] = [
  'researcher',
  'scriptwriter',
  'visual',
  'packaging',
  'compliance',
  'orchestrator',
  'analyst',
  'style_analyst',
];

export function getSearchCapableProviders(
  capabilities: Record<ProviderId, { search: boolean }> = PROVIDER_CAPABILITIES
): Set<ProviderId> {
  const capable = new Set<ProviderId>();
  for (const pid of PROVIDER_IDS) {
    if (capabilities[pid]?.search) {
      capable.add(pid);
    }
  }
  return capable;
}

export const SEARCH_CAPABLE_PROVIDERS: ReadonlySet<ProviderId> = getSearchCapableProviders();

function describeUserInputs(agentId: AgentId): string[] {
  const agent = AGENTS[agentId];
  const inputs: string[] = ['Profil Channel (Setup Channel)'];

  if (agent.usesStyleProfile === 'full') {
    inputs.push('Profil Gaya Visual Aktif (atribut penuh)');
  } else if (agent.usesStyleProfile === 'rhythm_hook') {
    inputs.push('Profil Gaya Visual Aktif (ritme & hook)');
  } else if (agent.usesStyleProfile === 'thumbnail') {
    inputs.push('Profil Gaya Visual Aktif (thumbnail & warna)');
  } else if (agent.usesStyleProfile === 'similarity') {
    inputs.push('Profil Gaya Visual Aktif (cek kemiripan)');
  }

  switch (agentId) {
    case 'researcher':
      inputs.push('Topik Video & Platform Target dari pengguna');
      break;
    case 'scriptwriter':
      inputs.push('Topik Video, Ringkasan Riset (bila aktif), & feedback revisi Kepatuhan');
      break;
    case 'visual':
      inputs.push('Hasil Naskah & feedback revisi Kepatuhan');
      break;
    case 'packaging':
      inputs.push('Hasil Naskah, Arahan Visual, & feedback revisi Kepatuhan');
      break;
    case 'compliance':
      inputs.push('Paket lengkap (Naskah, Visual, Packaging), Riset, & riwayat video (Audit maks 10 video)');
      break;
    case 'orchestrator':
      inputs.push('Seluruh output langkah pipeline & status akhir Kepatuhan');
      break;
    case 'analyst':
      inputs.push('Data metrik tempelan pengguna (teks / CSV)');
      break;
    case 'style_analyst':
      inputs.push('Referensi kreator (deskripsi, 3-8 gambar, key frame & metrik browser, atau URL YouTube)');
      break;
  }

  return inputs;
}

function evaluateSearchStatus(
  agentId: AgentId,
  cfg: AgentModelConfig | undefined,
  searchCapable: ReadonlySet<ProviderId>
): { status: SearchGroundingStatus; detail: string } {
  const agent = AGENTS[agentId];
  if (!agent.useSearch) {
    return {
      status: 'not_used',
      detail: 'Agent ini tidak memanggil pencarian web.',
    };
  }

  if (!cfg) {
    return {
      status: 'disabled',
      detail: 'Konfigurasi model agent belum tersedia.',
    };
  }

  if (!searchCapable.has(cfg.providerId)) {
    return {
      status: 'unsupported',
      detail: `Provider aktif (${label(cfg.providerId)}) tidak mendukung pencarian web server (grounding nonaktif).`,
    };
  }

  if (!cfg.useSearch) {
    return {
      status: 'disabled',
      detail: 'Pencarian web dimatikan di Pengaturan Model; agent hanya memakai pengetahuan lokal & input.',
    };
  }

  const engine =
    cfg.providerId === 'gemini'
      ? 'Google Search Grounding'
      : cfg.providerId === 'apinex'
      ? 'APInex Web Search'
      : cfg.providerId === 'openrouter'
      ? 'OpenRouter Web Search'
      : `${label(cfg.providerId)} Web Search`;
  const modeLabel = cfg.searchMode === 'two_step' ? 'dua langkah' : 'satu langkah';
  return {
    status: 'active',
    detail: `Aktif via ${engine} (${modeLabel}). Sumber URL resmi dikumpulkan di metadata grounding server.`,
  };
}

export function buildKnowledgeTransparencyReport(
  blocks: KnowledgeBlock[],
  modelConfigs: AgentModelConfig[],
  capabilities: Record<ProviderId, { search: boolean }> = PROVIDER_CAPABILITIES
): KnowledgeTransparencyReport {
  const searchCapable = getSearchCapableProviders(capabilities);
  const configMap = new Map<AgentId, AgentModelConfig>();
  for (const cfg of modelConfigs) {
    configMap.set(cfg.agentId, cfg);
  }

  const agents: AgentTransparencyItem[] = ORDERED_AGENT_IDS.map((agentId) => {
    const agent = AGENTS[agentId];
    const cfg = configMap.get(agentId);
    const injectedBlocks = blocks.filter(
      (b) => agent.knowledgeIds.includes(b.id) || agent.knowledgeGroups.includes(b.group)
    );
    const searchEval = evaluateSearchStatus(agentId, cfg, searchCapable);

    return {
      agentId,
      agentName: agent.name,
      persona: agent.persona,
      injectedBlocks,
      searchStatus: searchEval.status,
      searchStatusDetail: searchEval.detail,
      providerId: cfg?.providerId,
      userInputs: describeUserInputs(agentId),
    };
  });

  const activeSearchAgents = agents
    .filter((a) => a.searchStatus === 'active')
    .map((a) => a.agentName);

  const capableProviderNames = Array.from(searchCapable).map((pid) => label(pid));
  const unsupportedProviderNames = PROVIDER_IDS.filter((pid) => !searchCapable.has(pid)).map(
    (pid) => label(pid)
  );

  const externalSources: ExternalSourceSummaryItem[] = [
    {
      id: 'industry_reports',
      name: 'Laporan Industri / Sekunder & Aturan Internal (Blok Lokal)',
      status: 'active',
      statusLabel: `Aktif (${blocks.length} blok lokal)`,
      description:
        'Ringkasan awal berbasis publikasi industri, observasi kreator, dan aturan mutu studio yang disimpan statis di browser (bukan feed live). Dapat Anda edit langsung di daftar blok di bawah.',
    },
    {
      id: 'web_search',
      name: `Pencarian Web Server (${capableProviderNames.join(' / ') || 'Tidak Ada'})`,
      status: activeSearchAgents.length > 0 ? 'active' : 'conditional',
      statusLabel:
        activeSearchAgents.length > 0
          ? `Aktif di ${activeSearchAgents.join(' & ')}`
          : 'Nonaktif / Mode Simulasi',
      description: `Hanya digunakan oleh Periset dan Kepatuhan bila Search diaktifkan di Pengaturan Model dengan provider berkapabilitas pencarian (${capableProviderNames.join(', ')}; bukan ${unsupportedProviderNames.join('/')}).`,
    },
    {
      id: 'trends_api',
      name: 'API Tren Khusus (Google Trends / TikTok Trends API)',
      status: 'not_connected',
      statusLabel: 'Tidak Terhubung',
      description:
        'Aplikasi tidak memanggil endpoint API Tren khusus. Analisis topik mengandalkan input pengguna, blok pengetahuan lokal, dan Pencarian Web Server (bila aktif).',
    },
    {
      id: 'wikipedia',
      name: 'Wikipedia API / Ensiklopedia Eksternal',
      status: 'not_connected',
      statusLabel: 'Tidak Terhubung',
      description:
        'Aplikasi tidak memanggil API Wikipedia secara langsung. Artikel ensiklopedia hanya dapat terindeks tidak langsung bila muncul lewat Pencarian Web Server saat aktif.',
    },
  ];

  return { externalSources, agents };
}
