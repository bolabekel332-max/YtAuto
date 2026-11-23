import { EXPORT_SCHEMA_VERSION, HISTORY_MAX } from '../../shared/constants';
import {
  ExportFileSchema,
  type AgentModelConfig,
  type AgentResult,
  type ChannelProfile,
  type ExportFile,
  type HistoryEntry,
  type KnowledgeBlock,
  type PipelineRun,
  type StyleProfile,
  type StyleReference,
} from '../../shared/schemas';

const STORAGE_KEY = 'faceless_studio_state_v1';

export interface PersistedAppData {
  profile: ChannelProfile;
  profileConfigured: boolean;
  styleProfiles: StyleProfile[];
  styleReferences: StyleReference[];
  modelConfigs: AgentModelConfig[];
  knowledge: KnowledgeBlock[];
  history: HistoryEntry[];
  activeRun: PipelineRun | null;
  lastIdeas?: AgentResult;
  lastAudit?: AgentResult;
  lastAnalysis?: AgentResult;
  lastExportedAt?: string;
  changesSinceExport: number;
}

let inMemoryFallback: PersistedAppData | null = null;

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014
  );
}

/**
 * Menyimpan state ke localStorage dengan try/catch.
 * Bila kuota penuh, membuang entri Riwayat tertua secara bertahap (maks HISTORY_MAX = 30).
 * Bila localStorage tidak tersedia, jatuh ke memori sementara dan mengembalikan peringatan.
 */
export function save(data: PersistedAppData): { ok: boolean; warning?: string } {
  const normalized: PersistedAppData = {
    ...data,
    history: data.history.slice(0, HISTORY_MAX),
  };
  inMemoryFallback = normalized;

  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return {
        ok: false,
        warning: 'localStorage tidak tersedia; data hanya disimpan sementara di memori sesi.',
      };
    }

    const working = { ...normalized, history: [...normalized.history] };
    while (true) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(working));
        return {
          ok: true,
          warning:
            working.history.length < normalized.history.length
              ? `Kuota penyimpanan browser penuh; ${
                  normalized.history.length - working.history.length
                } entri Riwayat tertua dihapus otomatis.`
              : undefined,
        };
      } catch (err) {
        if (isQuotaError(err) && working.history.length > 0) {
          working.history.pop(); // Entri terbaru berada di depan, tertua di belakang
          continue;
        }
        throw err;
      }
    }
  } catch (err) {
    return {
      ok: false,
      warning: `Gagal menyimpan ke localStorage (${
        err instanceof Error ? err.message : 'kuota/izin browser'
      }). Data tetap aman di memori sesi; disarankan ekspor JSON.`,
    };
  }
}

export function load(): { data: Partial<PersistedAppData> | null; warning?: string } {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return {
        data: inMemoryFallback,
        warning: 'localStorage tidak tersedia; menggunakan penyimpanan memori sesi.',
      };
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { data: inMemoryFallback };
    const parsed = JSON.parse(raw) as Partial<PersistedAppData>;
    return { data: parsed };
  } catch {
    return {
      data: inMemoryFallback,
      warning: 'Gagal membaca data tersimpan dari localStorage; memuat konfigurasi awal.',
    };
  }
}

/**
 * Mengekspor seluruh data persisten (tanpa kode akses, tanpa kunci API, tanpa frame/video).
 */
export function exportAll(data: PersistedAppData): ExportFile {
  const payload: ExportFile = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    profile: data.profile,
    styleProfiles: data.styleProfiles,
    styleReferences: data.styleReferences,
    modelConfigs: data.modelConfigs,
    knowledge: data.knowledge,
    history: data.history.slice(0, HISTORY_MAX),
    ...(data.lastIdeas ? { lastIdeas: data.lastIdeas } : {}),
    ...(data.lastAudit ? { lastAudit: data.lastAudit } : {}),
    ...(data.lastAnalysis ? { lastAnalysis: data.lastAnalysis } : {}),
  };

  return ExportFileSchema.parse(payload);
}

/**
 * Memvalidasi file JSON impor dengan skema ExportFile secara ketat sebelum menimpa state.
 */
export function importAll(
  rawJsonText: string
): { ok: true; file: ExportFile } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJsonText);
  } catch {
    return { ok: false, error: 'File bukan JSON yang valid.' };
  }

  const checked = ExportFileSchema.safeParse(parsed);
  if (!checked.success) {
    const details = checked.error.issues
      .slice(0, 4)
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    return {
      ok: false,
      error: `Struktur file impor tidak cocok atau versi skema bukan v${EXPORT_SCHEMA_VERSION}: ${details}`,
    };
  }

  return { ok: true, file: checked.data };
}

export function isDirty(data: Pick<PersistedAppData, 'changesSinceExport' | 'lastExportedAt'>): boolean {
  if (data.changesSinceExport > 0) return true;
  if (!data.lastExportedAt) return false;
  return false;
}
