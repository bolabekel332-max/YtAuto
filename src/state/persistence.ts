import { z } from 'zod';
import { EXPORT_SCHEMA_VERSION, HISTORY_MAX } from '../../shared/constants';
import {
  AgentModelConfigSchema,
  AgentResultSchema,
  ChannelProfileSchema,
  ExportFileSchema,
  HistoryEntrySchema,
  KnowledgeBlockSchema,
  normalizeComplianceVerdict,
  PipelineRunSchema,
  StyleProfileSchema,
  StyleReferenceSchema,
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

export const STORAGE_KEY = 'faceless_studio_state_v1';
export const CORRUPT_BACKUP_KEY = 'faceless_studio_state_corrupt_backup_v1';
export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
export const MAX_CORRUPT_BACKUP_BYTES = 2 * 1024 * 1024;

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

interface BackupCorruptResult {
  backedUp: boolean;
  truncated: boolean;
  overwrittenPrevious: boolean;
}

function byteLengthOf(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  return text.length * 2;
}

function extractEntryCounts(raw: string): Record<string, number> | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const counts: Record<string, number> = {};
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(val)) counts[key] = val.length;
      else if (val !== null && val !== undefined) counts[key] = 1;
    }
    return counts;
  } catch {
    return undefined;
  }
}

function backupCorruptRawPayload(raw: string): BackupCorruptResult {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { backedUp: false, truncated: false, overwrittenPrevious: false };
    }
    const overwrittenPrevious = window.localStorage.getItem(CORRUPT_BACKUP_KEY) !== null;
    const rawBytes = byteLengthOf(raw);
    let toStore = raw;
    let truncated = false;

    if (raw.length > MAX_CORRUPT_BACKUP_BYTES || rawBytes > MAX_CORRUPT_BACKUP_BYTES) {
      truncated = true;
      const entryCounts = extractEntryCounts(raw);
      toStore = JSON.stringify({
        truncated: true,
        originalBytes: rawBytes,
        backedUpAt: new Date().toISOString(),
        ...(entryCounts ? { entryCounts } : {}),
        preview: raw.slice(0, 1024),
      });
    }

    window.localStorage.setItem(CORRUPT_BACKUP_KEY, toStore);
    return { backedUp: true, truncated, overwrittenPrevious };
  } catch {
    // Abaikan jika kuota penyimpanan penuh saat membuat cadangan korup
    return { backedUp: false, truncated: false, overwrittenPrevious: false };
  }
}

export function getCorruptBackup(): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(CORRUPT_BACKUP_KEY);
    }
  } catch {
    // Abaikan error akses localStorage
  }
  return null;
}

export function hasCorruptBackup(): boolean {
  return getCorruptBackup() !== null;
}

export function clearCorruptBackup(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(CORRUPT_BACKUP_KEY);
    }
  } catch {
    // Abaikan error akses localStorage
  }
}

function normalizeRunForPersistence(run: PipelineRun): PipelineRun {
  if (!run.complianceRounds || run.complianceRounds.length === 0) {
    return run;
  }
  return {
    ...run,
    complianceRounds: run.complianceRounds.map(normalizeComplianceVerdict),
  };
}

/**
 * Menyimpan state ke localStorage dengan try/catch.
 * Bila kuota penuh, membuang entri Riwayat tertua secara bertahap (maks HISTORY_MAX = 30).
 * Bila localStorage tidak tersedia, jatuh ke memori sementara dan mengembalikan peringatan.
 */
export function save(data: PersistedAppData): { ok: boolean; warning?: string } {
  const normalized: PersistedAppData = {
    ...data,
    activeRun: data.activeRun ? normalizeRunForPersistence(data.activeRun) : null,
    history: data.history.slice(0, HISTORY_MAX).map((entry) => ({
      ...entry,
      run: normalizeRunForPersistence(entry.run),
    })),
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
    let clearedCorruptBackup = false;
    while (true) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(working));
        const warnings: string[] = [];
        if (clearedCorruptBackup) {
          warnings.push('cadangan data korup lama dihapus otomatis untuk memberi ruang penyimpanan');
        }
        if (working.history.length < normalized.history.length) {
          warnings.push(
            `${normalized.history.length - working.history.length} entri Riwayat tertua dihapus otomatis`
          );
        }
        return {
          ok: true,
          warning:
            warnings.length > 0
              ? `Kuota penyimpanan browser penuh; ${warnings.join(' dan ')}.`
              : undefined,
        };
      } catch (err) {
        if (isQuotaError(err)) {
          if (!clearedCorruptBackup && window.localStorage.getItem(CORRUPT_BACKUP_KEY) !== null) {
            window.localStorage.removeItem(CORRUPT_BACKUP_KEY);
            clearedCorruptBackup = true;
            continue;
          }
          if (working.history.length > 0) {
            working.history.pop(); // Entri terbaru berada di depan, tertua di belakang
            continue;
          }
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

export function clearLocalData(): void {
  inMemoryFallback = null;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(CORRUPT_BACKUP_KEY);
    }
  } catch {
    // Abaikan jika browser memblokir localStorage
  }
}

export function mergeModelConfigs(
  saved: AgentModelConfig[] | undefined,
  defaults: AgentModelConfig[]
): AgentModelConfig[] {
  if (!saved || saved.length === 0) {
    return structuredClone(defaults);
  }
  const byAgent = new Map(saved.map((c) => [c.agentId, c]));
  return defaults.map((def) => {
    const existing = byAgent.get(def.agentId);
    return existing ? structuredClone(existing) : structuredClone(def);
  });
}

export function mergeKnowledgeBlocks(
  saved: KnowledgeBlock[] | undefined,
  defaults: KnowledgeBlock[]
): KnowledgeBlock[] {
  if (!saved || saved.length === 0) {
    return structuredClone(defaults);
  }
  const existingIds = new Set(saved.map((b) => b.id));
  const missingDefaults = defaults.filter((d) => !existingIds.has(d.id));
  return [...structuredClone(saved), ...structuredClone(missingDefaults)];
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

    let parsedRaw: unknown;
    try {
      parsedRaw = JSON.parse(raw);
    } catch {
      const backupInfo = backupCorruptRawPayload(raw);
      const extraNotes: string[] = [];
      if (backupInfo.overwrittenPrevious) {
        extraNotes.push('cadangan korup sebelumnya ditimpa (maksimal 1 cadangan disimpan)');
      }
      if (backupInfo.truncated) {
        extraNotes.push('ukuran >2 MB sehingga hanya ringkasan diagnostik yang dicadangkan');
      }
      return {
        data: inMemoryFallback,
        warning: `Data tersimpan di localStorage rusak (JSON tidak valid); salinan dicadangkan sementara dan konfigurasi awal dimuat${
          extraNotes.length > 0 ? ` (${extraNotes.join('; ')})` : ''
        }.`,
      };
    }

    if (!parsedRaw || typeof parsedRaw !== 'object' || Array.isArray(parsedRaw)) {
      const backupInfo = backupCorruptRawPayload(raw);
      const extraNotes: string[] = [];
      if (backupInfo.overwrittenPrevious) {
        extraNotes.push('cadangan korup sebelumnya ditimpa (maksimal 1 cadangan disimpan)');
      }
      if (backupInfo.truncated) {
        extraNotes.push('ukuran >2 MB sehingga hanya ringkasan diagnostik yang dicadangkan');
      }
      return {
        data: inMemoryFallback,
        warning: `Format data tersimpan di localStorage tidak valid; salinan dicadangkan sementara dan konfigurasi awal dimuat${
          extraNotes.length > 0 ? ` (${extraNotes.join('; ')})` : ''
        }.`,
      };
    }

    const rec = parsedRaw as Record<string, unknown>;
    const clean: Partial<PersistedAppData> = {};
    const resetSections: string[] = [];

    const trySection = <T>(
      key: keyof PersistedAppData,
      labelId: string,
      schema: z.ZodType<T>
    ) => {
      if (rec[key] === undefined) return;
      const checked = schema.safeParse(rec[key]);
      if (checked.success) {
        (clean as Record<string, unknown>)[key] = checked.data;
      } else {
        resetSections.push(labelId);
      }
    };

    trySection('profile', 'Profil Channel', ChannelProfileSchema);
    trySection('profileConfigured', 'Status Setup', z.boolean());
    trySection('styleProfiles', 'Profil Gaya', z.array(StyleProfileSchema));
    trySection('styleReferences', 'Referensi Gaya', z.array(StyleReferenceSchema));
    trySection('modelConfigs', 'Pengaturan Model', z.array(AgentModelConfigSchema));
    trySection('knowledge', 'Blok Pengetahuan', z.array(KnowledgeBlockSchema));

    // Validasi Riwayat Run per entri agar satu entri cacat tidak menghapus entri lain yang sehat (F-20)
    if (rec.history !== undefined) {
      if (Array.isArray(rec.history)) {
        const validHistory: HistoryEntry[] = [];
        let droppedCount = 0;
        for (const item of rec.history) {
          const checkedItem = HistoryEntrySchema.safeParse(item);
          if (checkedItem.success) {
            validHistory.push(checkedItem.data);
          } else {
            droppedCount += 1;
          }
        }
        clean.history = validHistory.slice(0, HISTORY_MAX);
        if (droppedCount > 0) {
          resetSections.push(`Riwayat Run (${droppedCount} entri tidak valid dilewati)`);
        }
      } else {
        resetSections.push('Riwayat Run');
      }
    }

    trySection('activeRun', 'Run Aktif', PipelineRunSchema.nullable());
    trySection('lastIdeas', 'Hasil Riset Terakhir', AgentResultSchema);
    trySection('lastAudit', 'Hasil Audit Terakhir', AgentResultSchema);
    trySection('lastAnalysis', 'Hasil Analitik Terakhir', AgentResultSchema);
    trySection('lastExportedAt', 'Waktu Ekspor', z.string());
    trySection('changesSinceExport', 'Penghitung Perubahan', z.number().int().min(0));

    let backupInfo: BackupCorruptResult | undefined;
    if (resetSections.length > 0) {
      backupInfo = backupCorruptRawPayload(raw);
    }

    const backupDetails: string[] = [];
    if (backupInfo?.overwrittenPrevious) {
      backupDetails.push('cadangan korup sebelumnya ditimpa');
    }
    if (backupInfo?.truncated) {
      backupDetails.push('cadangan >2 MB diringkas');
    }

    return {
      data: clean,
      warning:
        resetSections.length > 0
          ? `Sebagian data lokal bermasalah sehingga direset/dilewati (cadangan tersimpan di browser${
              backupDetails.length > 0 ? `: ${backupDetails.join(', ')}` : ''
            }): ${resetSections.join(', ')}.`
          : undefined,
    };
  } catch {
    return {
      data: inMemoryFallback,
      warning: 'Gagal membaca data tersimpan dari localStorage; memuat konfigurasi awal.',
    };
  }
}

export function buildRawExportPayload(data: PersistedAppData): ExportFile {
  const normalizedHistory = data.history.slice(0, HISTORY_MAX).map((entry) => ({
    ...entry,
    run: normalizeRunForPersistence(entry.run),
  }));

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    profile: data.profile,
    styleProfiles: data.styleProfiles,
    styleReferences: data.styleReferences,
    modelConfigs: data.modelConfigs,
    knowledge: data.knowledge,
    history: normalizedHistory,
    ...(data.lastIdeas ? { lastIdeas: data.lastIdeas } : {}),
    ...(data.lastAudit ? { lastAudit: data.lastAudit } : {}),
    ...(data.lastAnalysis ? { lastAnalysis: data.lastAnalysis } : {}),
  };
}

/**
 * Mengekspor seluruh data persisten (tanpa kunci API server, tanpa video, dan tanpa frame).
 */
export function exportAll(data: PersistedAppData): ExportFile {
  return ExportFileSchema.parse(buildRawExportPayload(data));
}

/**
 * Memvalidasi file JSON impor dengan skema ExportFile secara ketat sebelum menimpa state.
 */
export function importAll(
  rawJsonText: string
): { ok: true; file: ExportFile } | { ok: false; error: string } {
  if (rawJsonText.length > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      error: `Ukuran file impor melebihi batas maksimum (${Math.round(MAX_IMPORT_BYTES / (1024 * 1024))} MB).`,
    };
  }

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

export function isDirty(data: Pick<PersistedAppData, 'changesSinceExport'>): boolean {
  return data.changesSinceExport > 0;
}
