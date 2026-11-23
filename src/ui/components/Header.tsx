import React, { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { label } from '../../config/labels';
import { exportAll, importAll, isDirty } from '../../state/persistence';
import { extractPersistedSnapshot, useStore } from '../../state/store';
import type { ExportFile } from '../../../shared/schemas';
import { Tooltip } from './Tooltip';

export interface HeaderProps {
  title: string;
  subtitle: string;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle }) => {
  const { state, dispatch } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importCandidate, setImportCandidate] = useState<ExportFile | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const dirty = isDirty(state);
  const activeNiche =
    state.profile.niche === 'Lainnya' && state.profile.customNiche
      ? state.profile.customNiche
      : state.profile.niche;
  const activeLanguage =
    state.profile.language === 'Lainnya' && state.profile.customLanguage
      ? state.profile.customLanguage
      : state.profile.language;

  const handleExport = () => {
    const exported = exportAll(extractPersistedSnapshot(state));
    const blob = new Blob([JSON.stringify(exported, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `faceless-studio-backup-${exported.exportedAt.slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    dispatch({ type: 'MARK_EXPORTED', exportedAt: exported.exportedAt });
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = importAll(text);
      if (!result.ok) {
        setImportError(result.error);
        return;
      }
      setImportCandidate(result.file);
    } finally {
      e.target.value = '';
    }
  };

  const confirmImport = () => {
    if (!importCandidate) return;
    dispatch({ type: 'IMPORT_ALL', file: importCandidate });
    setImportCandidate(null);
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
            <span>
              {state.profile.platforms.map((p) => label(p)).join(', ')}
            </span>
          </div>

          <div className="flex items-center gap-2">
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
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 transition-colors"
            >
              <Upload className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <span>Impor JSON</span>
            </button>
            <Tooltip
              text="Pulihkan profil, referensi gaya, pengetahuan, pengaturan model, dan riwayat dari file JSON cadangan (tanpa kode akses)."
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
              text="Unduh seluruh data studio sebagai file JSON untuk cadangan. Kode akses, kunci API, video, dan frame tidak pernah disertakan."
              label="Panduan Ekspor JSON"
              position="bottom"
            />
          </div>
        </div>
      </div>

      {importError && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-rose-500/40 bg-rose-950/60 px-3 py-2 text-xs text-rose-200 flex items-center justify-between gap-2"
        >
          <span>{importError}</span>
          <button
            type="button"
            onClick={() => setImportError(null)}
            className="text-rose-200 underline hover:text-white"
          >
            Tutup
          </button>
        </div>
      )}

      {importCandidate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Impor Data"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h2 className="text-base font-semibold text-slate-100">
              Konfirmasi Impor Cadangan JSON
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              Impor file bertanggal{' '}
              <span className="font-mono text-slate-100">
                {importCandidate.exportedAt.slice(0, 19).replace('T', ' ')}
              </span>{' '}
              akan menimpa Profil Channel, Profil Gaya ({importCandidate.styleProfiles.length}),
              Pengetahuan ({importCandidate.knowledge.length}), Pengaturan Model, dan Riwayat (
              {importCandidate.history.length} entri) saat ini.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImportCandidate(null)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmImport}
                className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400"
              >
                Ya, Timpa & Pulihkan
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
