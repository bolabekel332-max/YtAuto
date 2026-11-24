import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  Database,
  Globe,
  Info,
  Pencil,
  ShieldCheck,
} from 'lucide-react';
import { CERTAINTY_LEVELS, KNOWLEDGE_STALE_DAYS } from '../../../shared/constants';
import type { CertaintyLevel, KnowledgeBlock } from '../../../shared/schemas';
import { label } from '../../config/labels';
import { buildKnowledgeTransparencyReport } from '../../knowledge/transparency';
import { useStore } from '../../state/store';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';

function daysSince(isoDate: string): number {
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) return 0;
  return Math.floor((Date.now() - parsed) / (1000 * 60 * 60 * 24));
}

export const Knowledge: React.FC = () => {
  const { state, dispatch } = useStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<KnowledgeBlock | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const todayStr = new Date().toISOString().slice(0, 10);

  const startEdit = (block: KnowledgeBlock) => {
    setEditingId(block.id);
    setDraft({ ...block });
    setEditError(null);
  };

  const saveEdit = () => {
    if (!draft) return;
    const trimmedTitle = draft.title.trim();
    const trimmedContent = draft.content.trim();
    const trimmedDate = draft.verifiedAt.trim();
    if (!trimmedTitle) {
      setEditError('Judul blok pengetahuan tidak boleh kosong.');
      return;
    }
    if (!trimmedContent) {
      setEditError('Isi aturan blok pengetahuan tidak boleh kosong.');
      return;
    }
    if (!trimmedDate) {
      setEditError('Tanggal verifikasi wajib diisi.');
      return;
    }
    dispatch({
      type: 'UPDATE_KNOWLEDGE_BLOCK',
      id: draft.id,
      patch: {
        title: trimmedTitle,
        content: trimmedContent,
        note: draft.note?.trim() || undefined,
        certainty: draft.certainty,
        verifiedAt: trimmedDate,
      },
    });
    setEditingId(null);
    setDraft(null);
    setEditError(null);
  };

  const markVerifiedToday = (id: string) => {
    dispatch({
      type: 'UPDATE_KNOWLEDGE_BLOCK',
      id,
      patch: { verifiedAt: todayStr },
    });
  };

  const staleCount = state.knowledge.filter(
    (b) => daysSince(b.verifiedAt) > KNOWLEDGE_STALE_DAYS
  ).length;

  const transparency = useMemo(
    () => buildKnowledgeTransparencyReport(state.knowledge, state.modelConfigs),
    [state.knowledge, state.modelConfigs]
  );

  return (
    <div className="space-y-6">
      {staleCount > 0 && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-950/50 px-4 py-3 text-xs text-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
          <p>
            <strong>{staleCount} blok pengetahuan</strong> berusia lebih dari{' '}
            {KNOWLEDGE_STALE_DAYS} hari sejak verifikasi terakhir. Periksa kebijakan terbaru platform lalu klik "Tandai Terverifikasi Hari Ini" jika masih akurat.
          </p>
        </div>
      )}

      <Card
        title="Transparansi Pengetahuan"
        description="Asal data aktual yang dibaca oleh setiap agent—termasuk ringkasan laporan industri lokal, status pencarian web server, dan keterbatasan integrasi eksternal."
        tooltip="Daftar ini membaca konfigurasi agent dan blok pengetahuan aktif secara langsung agar Anda tahu sumber mana yang benar-benar dipakai atau tidak terhubung."
      >
        <div className="space-y-5">
          {/* Ringkasan Sumber Eksternal */}
          <div className="space-y-2.5">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <Database className="h-3.5 w-3.5 text-sky-400 shrink-0" aria-hidden="true" />
              <span>Status Sumber Pengetahuan &amp; Integrasi Eksternal</span>
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              {transparency.externalSources.map((src) => {
                const badgeStyle =
                  src.status === 'active'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : src.status === 'conditional'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    : 'border-slate-700 bg-slate-900 text-slate-400';

                return (
                  <div
                    key={src.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-100">{src.name}</span>
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${badgeStyle}`}
                      >
                        {src.statusLabel}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-400">{src.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pemetaan Sumber per Agent */}
          <div className="space-y-2.5">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <ShieldCheck className="h-3.5 w-3.5 text-sky-400 shrink-0" aria-hidden="true" />
              <span>Sumber Data yang Dibaca Setiap Agent ({transparency.agents.length} Agent)</span>
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              {transparency.agents.map((agent) => {
                const searchBadgeStyle =
                  agent.searchStatus === 'active'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : agent.searchStatus === 'disabled' || agent.searchStatus === 'unsupported'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    : 'border-slate-800 bg-slate-900 text-slate-400';

                const searchLabel =
                  agent.searchStatus === 'active'
                    ? 'Pencarian Web: Aktif'
                    : agent.searchStatus === 'disabled'
                    ? 'Pencarian Web: Nonaktif'
                    : agent.searchStatus === 'unsupported'
                    ? 'Pencarian Web: Tidak Didukung Provider'
                    : 'Pencarian Web: Tidak Dipakai';

                return (
                  <div
                    key={agent.agentId}
                    className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-semibold text-slate-100">{agent.agentName}</h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">{agent.persona}</p>
                      </div>
                      {agent.providerId && (
                        <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300">
                          {label(agent.providerId)}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 text-sky-400 shrink-0" aria-hidden="true" />
                        <span
                          className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${searchBadgeStyle}`}
                        >
                          {searchLabel}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-400">
                        {agent.searchStatusDetail}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Blok Pengetahuan Lokal ({agent.injectedBlocks.length})
                      </p>
                      {agent.injectedBlocks.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          Tidak menyuntikkan blok pengetahuan khusus.
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {agent.injectedBlocks.map((blk) => (
                            <li
                              key={`${agent.agentId}-${blk.id}`}
                              className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-slate-800/80 bg-slate-900/50 px-2.5 py-1.5 text-xs"
                            >
                              <span className="text-slate-200 min-w-0 flex-1">{blk.title}</span>
                              <StatusBadge value={blk.certainty} kind="certainty" />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Masukan Pengguna &amp; Konteks
                      </p>
                      <ul className="space-y-0.5 text-xs text-slate-300">
                        {agent.userInputs.map((inp) => (
                          <li key={inp} className="flex items-start gap-1.5">
                            <Info className="h-3.5 w-3.5 text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
                            <span>{inp}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <Card
        title={`Basis Pengetahuan Agent (${state.knowledge.length} Blok)`}
        description="Blok ini disuntikkan ke prompt agent sesuai konteksnya agar keputusan sinyal platform dan kepatuhan selalu terarah."
        tooltip="Setiap blok membawa label tingkat kepastian (Resmi, Laporan Sekunder, Observasi Kreator, Aturan Internal) dan tanggal verifikasi."
      >
        <div className="space-y-4">
          {state.knowledge.map((block) => {
            const ageDays = daysSince(block.verifiedAt);
            const isStale = ageDays > KNOWLEDGE_STALE_DAYS;
            const isEditing = editingId === block.id && draft !== null;

            return (
              <div
                key={block.id}
                className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <BookOpen className="h-4 w-4 text-sky-400 shrink-0" aria-hidden="true" />
                      <h3 className="text-sm font-semibold text-slate-100">
                        {block.title}
                      </h3>
                      <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-slate-300">
                        {label(block.group)}
                      </span>
                      <StatusBadge value={block.certainty} kind="certainty" />
                    </div>

                    <p className="text-xs font-mono text-slate-400 tabular-nums">
                      Diverifikasi: {block.verifiedAt}
                      {isStale && (
                        <span className="ml-2 text-amber-300 font-sans font-medium">
                          · Perlu tinjau ulang ({ageDays} hari lalu)
                        </span>
                      )}
                    </p>
                  </div>

                  {!isEditing && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => markVerifiedToday(block.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
                      >
                        <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Tandai Terverifikasi Hari Ini</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(block)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Edit</span>
                      </button>
                    </div>
                  )}
                </div>

                {isEditing && draft ? (
                  <div className="space-y-3 border-t border-slate-800/80 pt-3">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="md:col-span-1">
                        <label className="block text-xs text-slate-300 mb-1">Judul</label>
                        <input
                          type="text"
                          maxLength={200}
                          value={draft.title}
                          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">
                          Tingkat Kepastian
                        </label>
                        <select
                          value={draft.certainty}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              certainty: e.target.value as CertaintyLevel,
                            })
                          }
                          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100"
                        >
                          {CERTAINTY_LEVELS.map((lvl) => (
                            <option key={lvl} value={lvl}>
                              {label(lvl)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">
                          Tanggal Verifikasi
                        </label>
                        <input
                          type="date"
                          maxLength={32}
                          value={draft.verifiedAt}
                          onChange={(e) =>
                            setDraft({ ...draft, verifiedAt: e.target.value })
                          }
                          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Isi Aturan</label>
                      <textarea
                        rows={4}
                        maxLength={4000}
                        value={draft.content}
                        onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs leading-relaxed text-slate-100"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-slate-300 mb-1">
                        Catatan Tambahan (Opsional)
                      </label>
                      <input
                        type="text"
                        maxLength={1000}
                        value={draft.note ?? ''}
                        onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100"
                      />
                    </div>

                    {editError && (
                      <div
                        role="alert"
                        className="rounded-lg border border-rose-500/40 bg-rose-950/60 px-3 py-2 text-xs text-rose-200"
                      >
                        {editError}
                      </div>
                    )}

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setDraft(null);
                          setEditError(null);
                        }}
                        className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={saveEdit}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Simpan Perubahan</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-xs leading-relaxed text-slate-200 whitespace-pre-line">
                      {block.content}
                    </p>
                    {block.note && (
                      <p className="text-[11px] italic text-slate-400">
                        Catatan: {block.note}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};
