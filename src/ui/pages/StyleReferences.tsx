import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Combine,
  Save,
  Trash2,
} from 'lucide-react';
import { MAX_REFERENCES } from '../../../shared/constants';
import type {
  StyleAttributes,
  StyleProfile,
} from '../../../shared/schemas';
import { label } from '../../config/labels';
import { useStore } from '../../state/store';
import { mergeProfiles, type StyleAttributeKey } from '../../style/mergeProfiles';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { StyleReferenceAnalyzerForm } from '../components/StyleReferenceAnalyzerForm';
import { StyleProfileView } from '../renderers/StyleProfileView';

export const StyleReferences: React.FC = () => {
  const { state, dispatch } = useStore();

  // Editor & Merge state
  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    () => state.styleProfiles[0]?.id ?? ''
  );
  const [nameDraft, setNameDraft] = useState<string>(
    () => state.styleProfiles[0]?.name ?? ''
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [editorMsg, setEditorMsg] = useState<string | null>(null);

  const [mergeSelectedIds, setMergeSelectedIds] = useState<string[]>([]);
  const [mergeWeights, setMergeWeights] = useState<Record<string, number>>({});
  const [mergeName, setMergeName] = useState('Profil Gaya Gabungan');
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeSuccess, setMergeSuccess] = useState<string | null>(null);

  const selectedProfile =
    state.styleProfiles.find((p) => p.id === selectedProfileId) ??
    state.styleProfiles[0];

  useEffect(() => {
    if (selectedProfile) {
      if (selectedProfile.id !== selectedProfileId) {
        setSelectedProfileId(selectedProfile.id);
      }
      setNameDraft(selectedProfile.name);
      setNameError(null);
    } else {
      if (selectedProfileId !== '') setSelectedProfileId('');
      setNameDraft('');
      setNameError(null);
    }
  }, [selectedProfile?.id, selectedProfile?.name]);

  const sourceProfilesForSelected = useMemo(() => {
    if (!selectedProfile) return [];
    return Object.keys(selectedProfile.weights)
      .map((id) => state.styleProfiles.find((p) => p.id === id))
      .filter((p): p is StyleProfile => Boolean(p && p.id !== selectedProfile.id));
  }, [selectedProfile, state.styleProfiles]);

  const activeRefCount = state.styleReferences.filter((r) => r.status !== 'failed').length;

  const handleUpdateProfileAttributes = (
    profile: StyleProfile,
    nextAttributes: StyleAttributes
  ) => {
    dispatch({
      type: 'UPSERT_STYLE_PROFILE',
      profile: {
        ...profile,
        attributes: nextAttributes,
        edited: true,
      },
    });
  };

  const handleToggleIgnoreAttr = (profile: StyleProfile, key: StyleAttributeKey) => {
    const current = new Set(profile.ignoredAttributes ?? []);
    if (current.has(key)) {
      current.delete(key);
    } else {
      current.add(key);
    }
    dispatch({
      type: 'UPSERT_STYLE_PROFILE',
      profile: {
        ...profile,
        ignoredAttributes: Array.from(current),
        edited: true,
      },
    });
  };

  const handleSelectAttributeSource = (
    profile: StyleProfile,
    key: StyleAttributeKey,
    sourceProfileId: string
  ) => {
    if (sourceProfilesForSelected.length < 2) return;
    const nextAttributes = structuredClone(profile.attributes);
    const nextSelectedSources = { ...(profile.selectedSources ?? {}) };

    if (!sourceProfileId) {
      delete nextSelectedSources[key];
      const recomputed = mergeProfiles(
        sourceProfilesForSelected.map((sp) => ({
          profile: sp,
          weight: profile.weights[sp.id] ?? 50,
        })),
        profile.name
      );
      (nextAttributes as Record<string, unknown>)[key] = recomputed.attributes[key];
    } else {
      const chosen = sourceProfilesForSelected.find((sp) => sp.id === sourceProfileId);
      if (!chosen) return;
      (nextAttributes as Record<string, unknown>)[key] = structuredClone(
        chosen.attributes[key]
      );
      nextSelectedSources[key] = sourceProfileId;
    }

    dispatch({
      type: 'UPSERT_STYLE_PROFILE',
      profile: {
        ...profile,
        attributes: nextAttributes,
        selectedSources:
          Object.keys(nextSelectedSources).length > 0 ? nextSelectedSources : undefined,
        edited: true,
      },
    });
  };

  const toggleMergeSelection = (id: string) => {
    setMergeSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (!mergeWeights[id]) {
        setMergeWeights((w) => ({ ...w, [id]: 50 }));
      }
      return [...prev, id];
    });
  };

  const handleMerge = () => {
    setMergeError(null);
    setMergeSuccess(null);
    const chosen = state.styleProfiles.filter((p) => mergeSelectedIds.includes(p.id));
    if (chosen.length < 2) {
      setMergeError('Pilih minimal 2 Profil Gaya untuk digabungkan secara berbobot.');
      return;
    }

    const merged = mergeProfiles(
      chosen.map((p) => ({
        profile: p,
        weight: mergeWeights[p.id] ?? 50,
      })),
      mergeName.trim() || 'Profil Gaya Gabungan'
    );
    dispatch({ type: 'UPSERT_STYLE_PROFILE', profile: merged });
    setSelectedProfileId(merged.id);
    setMergeSuccess(`Profil gaya gabungan "${merged.name}" berhasil dibuat dan disimpan.`);
  };

  return (
    <div className="space-y-6">
      {/* Peringatan Prinsip Inspirasi Gaya */}
      <div
        role="alert"
        className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-950/50 px-4 py-3 text-xs text-amber-100"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
        <p className="leading-relaxed">
          <strong>Prinsip Orisinalitas:</strong> Referensi gaya hanya diekstrak menjadi ciri visual abstrak (ritme potongan, palet warna, tipografi, komposisi) sebagai inspirasi. Jangan meniru naskah, suara, atau isi video kreator lain secara identik.
        </p>
      </div>

      {/* Form Tambah & Analisis Referensi */}
      <Card
        title={`Tambah Referensi Gaya (${activeRefCount}/${MAX_REFERENCES})`}
        description="Analisis gaya dari deskripsi manual, gambar/screenshot, link YouTube, atau file video lokal (diproses langsung di browser Anda)."
        tooltip="File video tidak pernah diunggah mentah ke server; browser hanya mengekstrak metrik lokal dan 8-12 key frame ringkas."
      >
        <StyleReferenceAnalyzerForm
          onProfileCreated={(created) => {
            setSelectedProfileId(created.id);
            setEditorMsg(null);
          }}
        />
      </Card>

      {/* Daftar Referensi Sumber */}
      {state.styleReferences.length > 0 && (
        <Card
          title="Daftar Sumber Referensi Tersimpan"
          description="Menyimpan riwayat ringkas sumber referensi (maksimal 5) tanpa menyimpan file video atau gambar biner."
          tooltip="Menghapus sumber referensi di sini tidak menghapus Profil Gaya yang sudah jadi, tetapi memberi ruang untuk menganalisis sumber baru."
        >
          <div className="divide-y divide-slate-800/80">
            {state.styleReferences.map((ref) => (
              <div
                key={ref.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-100 truncate">{ref.source}</p>
                  <p className="text-slate-400">
                    Tipe: {label(ref.type)}
                    {ref.note ? ` · Catatan: ${ref.note}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge value={ref.status} kind="step" />
                  <button
                    type="button"
                    aria-label={`Hapus referensi ${ref.source}`}
                    onClick={() => dispatch({ type: 'REMOVE_STYLE_REFERENCE', id: ref.id })}
                    className="rounded-md border border-slate-700 bg-slate-900 p-1.5 text-slate-400 hover:border-rose-500/40 hover:text-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Editor Profil Gaya Tersimpan */}
      <Card
        title={`Profil Gaya Tersimpan (${state.styleProfiles.length})`}
        description="Pilih Profil Gaya untuk meninjau, mengganti nama, memilih sumber per atribut (untuk hasil gabungan), mengabaikan atribut tertentu, atau mengedit manual."
        tooltip="Setiap perubahan langsung memperbarui Profil Gaya dan menandainya sebagai hasil edit manual."
      >
        {state.styleProfiles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-5 text-center text-xs text-slate-400">
            Belum ada Profil Gaya. Analisis referensi pertama Anda melalui form di atas.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {state.styleProfiles.map((sp) => {
                  const active = selectedProfile?.id === sp.id;
                  return (
                    <button
                      key={sp.id}
                      type="button"
                      onClick={() => {
                        setSelectedProfileId(sp.id);
                        setEditorMsg(null);
                      }}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                          : 'border-slate-700 bg-slate-950 text-slate-300 hover:text-white'
                      }`}
                    >
                      {sp.name}
                    </button>
                  );
                })}
              </div>

              {selectedProfile && (
                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: 'DELETE_STYLE_PROFILE', id: selectedProfile.id });
                    setMergeSelectedIds((prev) =>
                      prev.filter((id) => id !== selectedProfile.id)
                    );
                    setEditorMsg(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/20"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Hapus Profil Ini</span>
                </button>
              )}
            </div>

            {selectedProfile && (
              <div className="space-y-4 border-t border-slate-800/80 pt-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[220px]">
                    <label
                      htmlFor="style-profile-name"
                      className="block text-xs font-medium text-slate-300 mb-1"
                    >
                      Nama Profil Gaya
                    </label>
                    <input
                      id="style-profile-name"
                      type="text"
                      maxLength={200}
                      value={nameDraft}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNameDraft(val);
                        if (val.trim().length === 0) {
                          setNameError('Nama profil tidak boleh kosong.');
                          return;
                        }
                        setNameError(null);
                        dispatch({
                          type: 'UPSERT_STYLE_PROFILE',
                          profile: {
                            ...selectedProfile,
                            name: val,
                            edited: true,
                          },
                        });
                      }}
                      onBlur={() => {
                        if (nameDraft.trim().length === 0) {
                          setNameDraft(selectedProfile.name);
                          setNameError(null);
                        }
                      }}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus-visible:outline-none"
                    />
                    {nameError && (
                      <p className="mt-1 text-[11px] text-rose-300">{nameError}</p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      dispatch({
                        type: 'SET_PROFILE',
                        profile: {
                          ...state.profile,
                          visualStyle: {
                            ...state.profile.visualStyle,
                            mode: 'reference',
                            defaultStyleProfileId: selectedProfile.id,
                          },
                        },
                      });
                      setEditorMsg(
                        `"${selectedProfile.name}" ditetapkan sebagai gaya visual bawaan channel.`
                      );
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3.5 py-2 text-xs font-medium text-sky-200 hover:bg-sky-500/20"
                  >
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Jadikan Gaya Bawaan Channel</span>
                  </button>
                </div>

                {editorMsg && (
                  <div
                    role="status"
                    className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/50 px-4 py-2.5 text-xs text-emerald-100"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                    <span>{editorMsg}</span>
                  </div>
                )}

                {sourceProfilesForSelected.length >= 2 && (
                  <div className="rounded-xl border border-sky-500/30 bg-sky-950/30 px-3.5 py-2.5 text-xs text-sky-100 space-y-1">
                    <p className="font-semibold">
                      Komposisi Gabungan Berbobot ({sourceProfilesForSelected.length} Profil Sumber)
                    </p>
                    <p className="text-[11px] text-sky-200/90">
                      {sourceProfilesForSelected
                        .map((sp) => {
                          const w = selectedProfile.weights[sp.id] ?? 0;
                          return `${sp.name} (${Math.round(w * 100)}%)`;
                        })
                        .join(' · ')}{' '}
                      — Anda dapat mengganti sumber per atribut melalui dropdown &quot;Otomatis / Ambil dari&quot; di setiap kartu atribut.
                    </p>
                  </div>
                )}

                <StyleProfileView
                  attributes={selectedProfile.attributes}
                  edited={selectedProfile.edited}
                  ignoredAttributes={selectedProfile.ignoredAttributes}
                  selectedSources={selectedProfile.selectedSources}
                  sourceOptions={
                    sourceProfilesForSelected.length >= 2
                      ? sourceProfilesForSelected.map((p) => ({ id: p.id, name: p.name }))
                      : undefined
                  }
                  onSelectAttributeSource={
                    sourceProfilesForSelected.length >= 2
                      ? (key, sourceId) =>
                          handleSelectAttributeSource(selectedProfile, key, sourceId)
                      : undefined
                  }
                  onChangeAttributes={(next) =>
                    handleUpdateProfileAttributes(selectedProfile, next)
                  }
                  onToggleIgnore={(key) => handleToggleIgnoreAttr(selectedProfile, key)}
                />
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Gabung Beberapa Profil Gaya secara Berbobot (FR-06) */}
      {state.styleProfiles.length >= 2 && (
        <Card
          title="Gabung Profil Gaya Berbobot (Sintesis Deterministik)"
          description="Pilih 2 atau lebih Profil Gaya dan atur bobot masing-masing untuk menciptakan gaya baru hasil sintesis."
          tooltip="Penggabungan dilakukan secara deterministik di kode: angka dihitung rata-rata berbobot, warna digabung teratas, dan atribut teks mengikuti bobot tertinggi."
        >
          <div className="space-y-4">
            <div className="space-y-2">
              {state.styleProfiles.map((sp) => {
                const checked = mergeSelectedIds.includes(sp.id);
                const weight = mergeWeights[sp.id] ?? 50;
                return (
                  <div
                    key={`merge-${sp.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2.5"
                  >
                    <label className="flex items-center gap-2.5 text-xs font-medium text-slate-100">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMergeSelection(sp.id)}
                        className="h-4 w-4 accent-sky-400"
                      />
                      <span>{sp.name}</span>
                    </label>

                    {checked && (
                      <div className="flex items-center gap-3">
                        <label
                          htmlFor={`weight-${sp.id}`}
                          className="text-xs text-slate-400 font-mono tabular-nums"
                        >
                          Bobot: {weight}
                        </label>
                        <input
                          id={`weight-${sp.id}`}
                          type="range"
                          min={10}
                          max={100}
                          step={5}
                          value={weight}
                          onChange={(e) =>
                            setMergeWeights((prev) => ({
                              ...prev,
                              [sp.id]: Number(e.target.value),
                            }))
                          }
                          className="w-32 accent-sky-400"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {mergeError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-500/40 bg-rose-950/60 px-4 py-2.5 text-xs text-rose-200"
              >
                {mergeError}
              </div>
            )}

            {mergeSuccess && (
              <div
                role="status"
                className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/50 px-4 py-2.5 text-xs text-emerald-100"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>{mergeSuccess}</span>
              </div>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[220px]">
                <label htmlFor="merge-name" className="block text-xs font-medium text-slate-300 mb-1">
                  Nama Profil Hasil Gabungan
                </label>
                <input
                  id="merge-name"
                  type="text"
                  maxLength={200}
                  value={mergeName}
                  onChange={(e) => setMergeName(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus-visible:outline-none"
                />
              </div>
              <button
                type="button"
                disabled={mergeSelectedIds.length < 2}
                onClick={handleMerge}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
              >
                <Combine className="h-4 w-4" aria-hidden="true" />
                <span>Gabungkan ({mergeSelectedIds.length} terpilih)</span>
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
