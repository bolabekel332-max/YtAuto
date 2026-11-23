import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Combine,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  Plus,
  Save,
  Trash2,
  Video,
  XCircle,
} from 'lucide-react';
import {
  FRAME_COUNT_MIN,
  MAX_IMAGES_MAX,
  MAX_IMAGES_MIN,
  MAX_PASTE_CHARS,
  MAX_REFERENCES,
  MAX_VIDEO_MB,
} from '../../../shared/constants';
import type {
  StyleAttributes,
  StyleProfile,
  StyleReference,
  StyleReferenceType,
} from '../../../shared/schemas';
import { analyzeStyle } from '../../api/client';
import { label } from '../../config/labels';
import { useStore } from '../../state/store';
import {
  estimateAnalyzePayloadBytes,
  extractDenseThumbs,
  extractKeyFrames,
  resizeUploadedImages,
  type ExtractionProgress,
} from '../../style/frameExtractor';
import { computeMetrics, type LocalVisualMetrics } from '../../style/localMetrics';
import { mergeProfiles, type StyleAttributeKey } from '../../style/mergeProfiles';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { Tooltip } from '../components/Tooltip';
import { StyleProfileView } from '../renderers/StyleProfileView';

const SAFE_ANALYZE_BYTES = 4_200_000;

export const StyleReferences: React.FC = () => {
  const { state, dispatch } = useStore();
  const [refType, setRefType] = useState<StyleReferenceType>('description');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [descriptionText, setDescriptionText] = useState('');
  const [note, setNote] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<ExtractionProgress | null>(null);
  const [localMetricsPreview, setLocalMetricsPreview] = useState<LocalVisualMetrics | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Editor & Merge state
  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    () => state.styleProfiles[0]?.id ?? ''
  );
  const [mergeSelectedIds, setMergeSelectedIds] = useState<string[]>([]);
  const [mergeWeights, setMergeWeights] = useState<Record<string, number>>({});
  const [mergeName, setMergeName] = useState('Profil Gaya Gabungan');

  const styleConfig =
    state.modelConfigs.find((c) => c.agentId === 'style_analyst') ??
    state.modelConfigs[0];

  const selectedProfile =
    state.styleProfiles.find((p) => p.id === selectedProfileId) ??
    state.styleProfiles[0];

  const canAddMoreRefs = state.styleReferences.length < MAX_REFERENCES;

  const handleCancelExtraction = () => {
    abortRef.current?.abort();
  };

  const handleAnalyzeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLocalMetricsPreview(null);

    if (!canAddMoreRefs) {
      setErrorMsg(
        `Maksimal ${MAX_REFERENCES} referensi tersimpan. Hapus salah satu referensi lama terlebih dahulu.`
      );
      return;
    }

    const refId = `ref_${Date.now()}`;
    let sourceLabel = '';
    const controller = new AbortController();
    abortRef.current = controller;

    setAnalyzing(true);
    try {
      let payloadRef: {
        referenceId: string;
        referenceType: StyleReferenceType;
        youtubeUrl?: string;
        descriptionText?: string;
        note?: string;
        localMetrics?: {
          estimatedCutsPerMin: number | null;
          avgShotSec: number | null;
          dominantColors: string[];
          sampledDurationSec: number;
          denseFrameCount: number;
        };
        framesBase64?: Array<{ mimeType: string; data: string }>;
        imagesBase64?: Array<{ mimeType: string; data: string }>;
      };

      if (refType === 'youtube_link') {
        const trimmed = youtubeUrl.trim();
        if (!trimmed) {
          throw new Error('Masukkan URL video YouTube yang valid.');
        }
        try {
          new URL(trimmed);
        } catch {
          throw new Error('Format URL YouTube tidak valid.');
        }
        sourceLabel = trimmed;
        payloadRef = {
          referenceId: refId,
          referenceType: 'youtube_link',
          youtubeUrl: trimmed,
          descriptionText: descriptionText.trim() || undefined,
          note: note.trim() || undefined,
        };
      } else if (refType === 'description') {
        const trimmed = descriptionText.trim();
        if (trimmed.length < 15) {
          throw new Error(
            'Tuliskan deskripsi gaya visual minimal 15 karakter agar agent dapat mengekstrak atribut.'
          );
        }
        sourceLabel = trimmed.slice(0, 70) + (trimmed.length > 70 ? '...' : '');
        payloadRef = {
          referenceId: refId,
          referenceType: 'description',
          descriptionText: trimmed.slice(0, MAX_PASTE_CHARS),
          note: note.trim() || undefined,
        };
      } else if (refType === 'upload_images') {
        if (imageFiles.length < MAX_IMAGES_MIN || imageFiles.length > MAX_IMAGES_MAX) {
          throw new Error(
            `Pilih antara ${MAX_IMAGES_MIN} hingga ${MAX_IMAGES_MAX} gambar / screenshot.`
          );
        }
        setProgress({
          phase: 'loading',
          percent: 30,
          message: `Mengubah ukuran ${imageFiles.length} gambar di browser (maks 768 px)...`,
        });
        const resized = await resizeUploadedImages(imageFiles, controller.signal);
        sourceLabel = `${imageFiles.length} gambar (${imageFiles[0].name})`;
        payloadRef = {
          referenceId: refId,
          referenceType: 'upload_images',
          imagesBase64: resized.map((r) => ({ mimeType: r.mimeType, data: r.data })),
          descriptionText: descriptionText.trim() || undefined,
          note: note.trim() || undefined,
        };
      } else {
        // upload_video
        if (!videoFile) {
          throw new Error('Pilih file video dari komputer Anda terlebih dahulu.');
        }
        if (videoFile.size > MAX_VIDEO_MB * 1024 * 1024) {
          throw new Error(`Ukuran video melebihi batas maksimal ${MAX_VIDEO_MB} MB.`);
        }
        sourceLabel = `${videoFile.name} (${(videoFile.size / (1024 * 1024)).toFixed(1)} MB)`;

        const denseRes = await extractDenseThumbs(videoFile, setProgress, controller.signal);
        const metrics = computeMetrics(denseRes.thumbs);
        setLocalMetricsPreview(metrics);

        let keyFrames = await extractKeyFrames(videoFile, setProgress, controller.signal);
        let framesPayload = keyFrames.map((f) => ({
          mimeType: f.mimeType,
          data: f.dataBase64,
        }));

        const buildReq = (frames: Array<{ mimeType: string; data: string }>) => ({
          referenceId: refId,
          referenceType: 'upload_video' as const,
          descriptionText: descriptionText.trim() || undefined,
          note: note.trim() || undefined,
          localMetrics: {
            estimatedCutsPerMin: metrics.estimatedCutsPerMin,
            avgShotSec: metrics.avgShotSec,
            dominantColors: metrics.dominantColors,
            sampledDurationSec: metrics.sampledDurationSec,
            denseFrameCount: metrics.denseFrameCount,
          },
          framesBase64: frames,
        });

        // Pastikan total payload JSON tetap aman di bawah batas server (tetap minimal 8 frame jika mungkin)
        let candidate = buildReq(framesPayload);
        while (
          estimateAnalyzePayloadBytes(candidate) > SAFE_ANALYZE_BYTES &&
          framesPayload.length > FRAME_COUNT_MIN
        ) {
          const reducedCount = framesPayload.length - 1;
          const step = framesPayload.length / reducedCount;
          framesPayload = Array.from({ length: reducedCount }, (_, idx) => {
            const pickIdx = Math.min(framesPayload.length - 1, Math.floor(idx * step));
            return framesPayload[pickIdx];
          });
          candidate = buildReq(framesPayload);
        }

        if (estimateAnalyzePayloadBytes(candidate) > SAFE_ANALYZE_BYTES) {
          throw new Error(
            'Ukuran total frame masih melebihi batas pengiriman server. Gunakan opsi Unggah Gambar (3-8 screenshot) atau Deskripsi Manual.'
          );
        }

        payloadRef = candidate;
      }

      // Catat referensi baru sebagai 'new' sebelum panggil server
      const newRef: StyleReference = {
        id: refId,
        type: refType,
        source: sourceLabel,
        note: note.trim() || undefined,
        status: 'new',
      };
      dispatch({ type: 'ADD_STYLE_REFERENCE', reference: newRef });

      try {
        setProgress({
          phase: 'done',
          percent: 100,
          message: 'Mengirim fitur ringkas ke server untuk ekstraksi atribut gaya...',
        });
        const response = await analyzeStyle(
          {
            reference: payloadRef,
            profile: state.profile,
            knowledge: state.knowledge,
            config: styleConfig,
          },
          state.session.accessCode
        );

        dispatch({ type: 'UPDATE_STYLE_REFERENCE', id: refId, patch: { status: 'analyzed' } });
        dispatch({ type: 'UPSERT_STYLE_PROFILE', profile: response.profile });
        setSelectedProfileId(response.profile.id);

        setSuccessMsg(
          `Profil gaya "${response.profile.name}" berhasil dibuat${
            response.result.isMock ? ' (Simulasi Mock)' : ''
          }. Anda dapat mengedit atributnya secara langsung di bawah.`
        );
        setYoutubeUrl('');
        setDescriptionText('');
        setNote('');
        setVideoFile(null);
        setImageFiles([]);
      } catch (apiErr) {
        dispatch({ type: 'UPDATE_STYLE_REFERENCE', id: refId, patch: { status: 'failed' } });
        throw apiErr;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setErrorMsg('Ekstraksi frame video dibatalkan oleh pengguna.');
      } else {
        setErrorMsg(
          err instanceof Error ? err.message : 'Gagal menganalisis referensi gaya.'
        );
      }
    } finally {
      setAnalyzing(false);
      setProgress(null);
      abortRef.current = null;
    }
  };

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
    setErrorMsg(null);
    setSuccessMsg(null);
    const chosen = state.styleProfiles.filter((p) => mergeSelectedIds.includes(p.id));
    if (chosen.length < 2) {
      setErrorMsg('Pilih minimal 2 Profil Gaya untuk digabungkan secara berbobot.');
      return;
    }

    const merged = mergeProfiles(
      chosen.map((p) => ({
        profile: p,
        weight: mergeWeights[p.id] ?? 50,
      })),
      mergeName
    );
    dispatch({ type: 'UPSERT_STYLE_PROFILE', profile: merged });
    setSelectedProfileId(merged.id);
    setSuccessMsg(`Profil gaya gabungan "${merged.name}" berhasil dibuat dan disimpan.`);
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
        title={`Tambah Referensi Gaya (${state.styleReferences.length}/${MAX_REFERENCES})`}
        description="Analisis gaya dari deskripsi manual, gambar/screenshot, link YouTube, atau file video lokal (diproses langsung di browser Anda)."
        tooltip="File video tidak pernah diunggah mentah ke server; browser hanya mengekstrak metrik lokal dan 8-12 key frame ringkas."
      >
        <form onSubmit={handleAnalyzeSubmit} className="space-y-4">
          {/* Selector Tipe Referensi */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-200">Sumber Referensi</span>
              <Tooltip
                text="Pilih cara memasukkan referensi gaya. Jika browser gagal mendekode video, gunakan 3-8 screenshot atau deskripsi manual."
                label="Panduan Sumber Referensi"
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  { id: 'description', icon: FileText, hint: 'Teks ciri visual' },
                  { id: 'upload_images', icon: ImageIcon, hint: '3–8 screenshot' },
                  { id: 'upload_video', icon: Video, hint: `Video maks ${MAX_VIDEO_MB} MB` },
                  { id: 'youtube_link', icon: Link2, hint: 'URL + catatan visual' },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = refType === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={analyzing}
                    onClick={() => {
                      setRefType(item.id);
                      setErrorMsg(null);
                    }}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                      active
                        ? 'border-sky-500/60 bg-sky-500/15 text-sky-100'
                        : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
                    <div>
                      <p className="text-xs font-semibold">{label(item.id)}</p>
                      <p className="text-[11px] text-slate-400">{item.hint}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Input sesuai tipe */}
          {refType === 'youtube_link' && (
            <div className="space-y-3">
              <div className="rounded-lg border border-sky-500/30 bg-sky-950/40 px-3 py-2 text-xs text-sky-100">
                Server tidak mengunduh video YouTube secara langsung. Sertakan catatan ciri visual pada kolom deskripsi di bawah agar hasil analisis lebih akurat (atau unggah 3–8 screenshot video tersebut).
              </div>
              <div>
                <label htmlFor="yt-url" className="block text-xs font-medium text-slate-200 mb-1.5">
                  URL Video YouTube
                </label>
                <input
                  id="yt-url"
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus-visible:outline-none"
                />
              </div>
            </div>
          )}

          {refType === 'upload_video' && (
            <div className="space-y-3">
              <div>
                <label htmlFor="video-upload" className="block text-xs font-medium text-slate-200 mb-1.5">
                  Pilih File Video Lokal (Maks {MAX_VIDEO_MB} MB)
                </label>
                <input
                  id="video-upload"
                  type="file"
                  accept="video/*"
                  disabled={analyzing}
                  onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border file:border-slate-700 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-200 hover:file:bg-slate-800"
                />
                {videoFile && (
                  <p className="mt-1.5 text-xs text-slate-400 font-mono tabular-nums">
                    Terpilih: {videoFile.name} ({(videoFile.size / (1024 * 1024)).toFixed(2)} MB)
                  </p>
                )}
              </div>

              {progress && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-200">{progress.message}</span>
                    <span className="font-mono text-sky-300 tabular-nums">
                      {progress.percent}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full bg-sky-500 transition-all"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelExtraction}
                    className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-200 hover:bg-rose-500/20"
                  >
                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Batalkan Ekstraksi</span>
                  </button>
                </div>
              )}

              {localMetricsPreview && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300 space-y-1">
                  <p className="font-semibold text-slate-100">
                    Hasil Metrik Lokal Browser (Dihitung dari thumbnail padat lokal):
                  </p>
                  <p className="font-mono tabular-nums">
                    Potongan/menit: {localMetricsPreview.estimatedCutsPerMin ?? '-'} · Rata-rata shot:{' '}
                    {localMetricsPreview.avgShotSec ?? '-'} dtk · Warna dominan:{' '}
                    {localMetricsPreview.dominantColors.join(', ') || '-'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {localMetricsPreview.heuristicNote}
                  </p>
                </div>
              )}
            </div>
          )}

          {refType === 'upload_images' && (
            <div>
              <label htmlFor="images-upload" className="block text-xs font-medium text-slate-200 mb-1.5">
                Pilih {MAX_IMAGES_MIN}–{MAX_IMAGES_MAX} Screenshot / Frame Referensi
              </label>
              <input
                id="images-upload"
                type="file"
                accept="image/*"
                multiple
                disabled={analyzing}
                onChange={(e) => setImageFiles(Array.from(e.target.files ?? []))}
                className="block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border file:border-slate-700 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-200 hover:file:bg-slate-800"
              />
              {imageFiles.length > 0 && (
                <p className="mt-1.5 text-xs text-slate-400 tabular-nums">
                  {imageFiles.length} gambar terpilih (akan diperkecil ke maks 768 px dan tidak disimpan permanen).
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="style-desc" className="block text-xs font-medium text-slate-200 mb-1.5">
              {refType === 'description'
                ? 'Deskripsi Gaya Visual Referensi (Wajib)'
                : 'Deskripsi / Pengamatan Visual Tambahan (Opsional)'}
            </label>
            <textarea
              id="style-desc"
              rows={3}
              value={descriptionText}
              onChange={(e) => setDescriptionText(e.target.value)}
              placeholder="Contoh: Video edukasi vertikal tempo cepat, cut setiap 2-3 detik, teks putih tebal dengan bayangan gelap di tengah layar, latar B-roll sinematik bernuansa biru gelap."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus-visible:outline-none"
            />
          </div>

          <div>
            <label htmlFor="style-note" className="block text-xs font-medium text-slate-200 mb-1.5">
              Bagian yang Ingin Ditiru / Diperhatikan (Opsional)
            </label>
            <input
              id="style-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contoh: Fokus pada ritme hook 3 detik pertama dan tipografi subtitle"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus-visible:outline-none"
            />
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/40 bg-rose-950/60 px-4 py-3 text-xs text-rose-200"
            >
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/50 px-4 py-3 text-xs text-emerald-100"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-400">
              Menggunakan agent Analis Gaya Visual ({label(styleConfig.providerId)} ·{' '}
              <span className="font-mono">{styleConfig.model}</span>)
            </span>
            <button
              type="submit"
              disabled={analyzing || !canAddMoreRefs}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 transition-colors"
            >
              {analyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{analyzing ? 'Menganalisis Gaya...' : 'Analisis & Simpan Profil Gaya'}</span>
            </button>
          </div>
        </form>
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
        description="Pilih Profil Gaya untuk meninjau, mengganti nama, mengabaikan atribut tertentu, atau mengedit manual."
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
                      onClick={() => setSelectedProfileId(sp.id)}
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
                      value={selectedProfile.name}
                      onChange={(e) =>
                        dispatch({
                          type: 'UPSERT_STYLE_PROFILE',
                          profile: {
                            ...selectedProfile,
                            name: e.target.value,
                            edited: true,
                          },
                        })
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus-visible:outline-none"
                    />
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
                      setSuccessMsg(
                        `"${selectedProfile.name}" ditetapkan sebagai gaya visual bawaan channel.`
                      );
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3.5 py-2 text-xs font-medium text-sky-200 hover:bg-sky-500/20"
                  >
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Jadikan Gaya Bawaan Channel</span>
                  </button>
                </div>

                <StyleProfileView
                  attributes={selectedProfile.attributes}
                  edited={selectedProfile.edited}
                  ignoredAttributes={selectedProfile.ignoredAttributes}
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

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[220px]">
                <label htmlFor="merge-name" className="block text-xs font-medium text-slate-300 mb-1">
                  Nama Profil Hasil Gabungan
                </label>
                <input
                  id="merge-name"
                  type="text"
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
