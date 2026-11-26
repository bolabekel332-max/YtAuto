import React, { useRef, useState } from 'react';
import { Download, Trash2, Upload } from 'lucide-react';
import type { ExportFile } from '../../../shared/schemas';
import { isPipelineLocked } from '../../agents/pipeline';
import { label } from '../../config/labels';
import { usePipeline } from '../../state/pipelineContext';
import {
  buildRawExportPayload,
  exportAll,
  importAll,
  isDirty,
  type RecoveryImportMeta,
} from '../../state/persistence';
import { extractPersistedSnapshot, useStore } from '../../state/store';
import { AccessibleDialog } from './AccessibleDialog';
import { Tooltip } from './Tooltip';

const RECOVERY_SECTION_LABELS: Record<string, string> = {
  profile: 'Profil Channel',
  styleProfiles: 'Profil Gaya',
  styleReferences: 'Referensi Gaya',
  modelConfigs: 'Pengaturan Model',
  knowledge: 'Blok Pengetahuan',
  history: 'Riwayat Run',
  lastIdeas: 'Hasil Riset Terakhir',
  lastAudit: 'Hasil Audit Terakhir',
  lastAnalysis: 'Hasil Analitik Terakhir',
};

export interface HeaderProps {
  title: string;
  subtitle: string;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle }) => {
  const { state, dispatch } = useStore();
  const { isBusy } = usePipeline();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importCandidate, setImportCandidate] = useState<{
    file: ExportFile;
    recovery?: RecoveryImportMeta;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rawExportAvailable, setRawExportAvailable] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const pipelineLocked = isBusy || isPipelineLocked();
  const dirty = isDirty(state);
  const activeNiche =
    state.profile.niche === 'Lainnya' && state.profile.customNiche
      ? state.profile.customNiche
      : state.profile.niche;
  const activeLanguage =
    state.profile.language === 'Lainnya' && state.profile.customLanguage
      ? state.profile.customLanguage
      : state.profile.language;

  const triggerJsonDownload = (payload: unknown, filename: string) => {
    let url: string | null = null;
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
    } finally {
      if (url) {
        URL.revokeObjectURL(url);
      }
    }
  };

  const handleExport = () => {
    setActionError(null);
    setRawExportAvailable(false);
    try {
      const exported = exportAll(extractPersistedSnapshot(state));
      triggerJsonDownload(
        exported,
        `faceless-studio-backup-${exported.exportedAt.slice(0, 10)}.json`
      );
      dispatch({ type: 'MARK_EXPORTED', exportedAt: exported.exportedAt });
    } catch (err) {
      setRawExportAvailable(true);
      setActionError(
        err instanceof Error
          ? `Gagal memvalidasi data ekspor JSON: ${err.message}`
          : 'Gagal mengekspor data JSON.'
      );
    }
  };

  const handleRawExport = () => {
    try {
      const rawPayload = buildRawExportPayload(extractPersistedSnapshot(state));
      triggerJsonDownload(
        rawPayload,
        `faceless-studio-raw-backup-${rawPayload.exportedAt.slice(0, 10)}.json`
      );
      setActionError(null);
      setRawExportAvailable(false);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? `Gagal mengekspor data mentah: ${err.message}`
          : 'Gagal mengekspor data mentah.'
      );
    }
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setActionError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (isBusy || isPipelineLocked()) {
      setActionError('Tunggu hingga pipeline selesai sebelum mengimpor data JSON.');
      e.target.value = '';
      return;
    }
    try {
      const text = await file.text();
      const result = importAll(text);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      setImportCandidate({ file: result.file, recovery: result.recovery });
    } catch {
      setActionError('Gagal membaca file JSON yang dipilih.');
    } finally {
      e.target.value = '';
    }
  };

  const confirmImport = () => {
    if (!importCandidate) return;
    if (isBusy || isPipelineLocked()) {
      setActionError('Tidak dapat menimpa data saat pipeline masih berjalan.');
      setImportCandidate(null);
      return;
    }
    if (importCandidate.recovery) {
      dispatch({
        type: 'IMPORT_RECOVERY',
        partialData: importCandidate.recovery.partialData,
        keptSections: importCandidate.recovery.keptSections,
      });
    } else {
      dispatch({ type: 'IMPORT_ALL', file: importCandidate.file });
    }
    setImportCandidate(null);
  };

  const confirmClearAll = () => {
    if (isBusy || isPipelineLocked()) {
      setActionError('Tidak dapat menghapus data saat pipeline masih berjalan.');
      setClearConfirmOpen(false);
      return;
    }
    dispatch({ type: 'CLEAR_LOCAL_DATA' });
    setClearConfirmOpen(false);
  };

  return (
    <header className="border-b border-slate-800 bg-slate-950/90 px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-100">{title}</h1>
          <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Ringkasan profil aktif sebagai teks bersih tanpa pill */}
          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400">
            <span className="font-medium text-slate-200">{activeNiche}</span>
            <span aria-hidden="true">·</span>
            <span>{activeLanguage}</span>
            <span aria-hidden="true">·</span>
            <span>{label(state.profile.platform)}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFilePicked}
              className="hidden"
              aria-label="Pilih file JSON cadangan"
            />
            <button
              type="button"
              disabled={pipelineLocked}
              onClick={() => fileInputRef.current?.click()}
              title={
                pipelineLocked
                  ? 'Tunggu hingga pipeline selesai sebelum mengimpor data'
                  : undefined
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 transition-colors"
            >
              <Upload className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <span>Impor JSON</span>
            </button>
            <Tooltip
              text="Pulihkan profil, referensi gaya, pengetahuan, pengaturan model, dan riwayat dari file JSON cadangan."
              label="Panduan Impor JSON"
              position="bottom"
            />

            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 transition-colors"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{dirty ? 'Ekspor Cadangan*' : 'Ekspor JSON'}</span>
            </button>
            <Tooltip
              text="Unduh seluruh data studio sebagai file JSON untuk cadangan. Kunci API, token OAuth, video, dan frame tidak pernah disertakan."
              label="Panduan Ekspor JSON"
              position="bottom"
            />

            <button
              type="button"
              disabled={pipelineLocked}
              onClick={() => setClearConfirmOpen(true)}
              aria-label="Hapus semua data lokal"
              title={
                pipelineLocked
                  ? 'Tunggu hingga pipeline selesai sebelum menghapus data'
                  : undefined
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-950/40 px-2.5 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-950/70 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Hapus Data</span>
            </button>
          </div>
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-rose-500/40 bg-rose-950/60 px-3 py-2 text-xs text-rose-200 flex flex-wrap items-center justify-between gap-2"
        >
          <span className="min-w-0 flex-1">{actionError}</span>
          <div className="flex items-center gap-2 shrink-0">
            {rawExportAvailable && (
              <button
                type="button"
                onClick={handleRawExport}
                className="rounded-md border border-amber-400/50 bg-amber-950/60 px-2.5 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-900/70"
              >
                Ekspor mentah (hanya pemulihan darurat)
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setRawExportAvailable(false);
              }}
              className="text-rose-200 underline hover:text-white"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      <AccessibleDialog
        open={Boolean(importCandidate)}
        ariaLabel="Konfirmasi Impor Data"
        onClose={() => setImportCandidate(null)}
      >
        {importCandidate && (
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl space-y-3">
            <h2 className="text-base font-semibold text-slate-100">
              Konfirmasi Impor Cadangan JSON
            </h2>
            {importCandidate.recovery ? (
              <p className="rounded-lg border border-amber-500/40 bg-amber-950/50 px-3 py-2 text-xs text-amber-100 leading-relaxed">
                File ekspor darurat: bagian{' '}
                {importCandidate.recovery.droppedSections.length > 0
                  ? importCandidate.recovery.droppedSections.join(', ')
                  : 'tidak ada yang rusak'}{' '}
                dilewati, bagian{' '}
                {importCandidate.recovery.keptSections
                  .map((k) => RECOVERY_SECTION_LABELS[k] ?? k)
                  .join(', ')}{' '}
                akan dipulihkan (bagian yang dilewati tetap memakai nilai saat ini).
              </p>
            ) : (
              <p className="text-xs leading-relaxed text-slate-300">
                Impor file bertanggal{' '}
                <span className="font-mono text-slate-100">
                  {importCandidate.file.exportedAt.slice(0, 19).replace('T', ' ')}
                </span>{' '}
                akan menimpa Profil Channel, Profil Gaya ({importCandidate.file.styleProfiles.length}),
                Pengetahuan ({importCandidate.file.knowledge.length}), Pengaturan Model, dan Riwayat (
                {importCandidate.file.history.length} entri) saat ini.
              </p>
            )}
            <p className="rounded-lg border border-amber-500/40 bg-amber-950/50 px-3 py-2 text-xs text-amber-100 leading-relaxed">
              Blok pengetahuan dalam file ini akan menjadi instruksi bagi agent. Impor hanya file buatan Anda sendiri.
            </p>
            <div className="pt-1 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImportCandidate(null)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmImport}
                className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                Ya, Timpa &amp; Pulihkan
              </button>
            </div>
          </div>
        )}
      </AccessibleDialog>

      <AccessibleDialog
        open={clearConfirmOpen}
        ariaLabel="Konfirmasi Hapus Semua Data Lokal"
        onClose={() => setClearConfirmOpen(false)}
      >
        <div className="w-full max-w-md rounded-xl border border-rose-500/40 bg-slate-900 p-5 shadow-2xl space-y-3">
          <h2 className="text-base font-semibold text-rose-100">
            Hapus Semua Data Lokal?
          </h2>
          <p className="text-xs leading-relaxed text-slate-300">
            Tindakan ini akan menghapus permanen profil channel, profil gaya, suntingan blok pengetahuan, pengaturan model, dan seluruh riwayat run dari browser ini lalu mengembalikannya ke standar awal.
          </p>
          <div className="pt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setClearConfirmOpen(false)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={confirmClearAll}
              className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            >
              Ya, Hapus Semua Data Lokal
            </button>
          </div>
        </div>
      </AccessibleDialog>
    </header>
  );
};
