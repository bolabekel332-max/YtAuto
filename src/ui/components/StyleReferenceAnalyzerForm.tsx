import React, { useEffect, useId, useRef, useState } from 'react';
import {
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  Plus,
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
  PROVIDER_CAPABILITIES,
} from '../../../shared/constants';
import { isValidYoutubeUrl } from '../../../shared/agentInputs';
import type {
  StyleProfile,
  StyleReference,
  StyleReferenceType,
} from '../../../shared/schemas';
import { label } from '../../config/labels';
import { useAgentTask } from '../../state/agentTaskContext';
import { checkConfigAgainstServerPolicy } from '../../state/modelPolicyGuard';
import { useStore } from '../../state/store';
import {
  estimateAnalyzePayloadBytes,
  extractDenseThumbs,
  extractKeyFrames,
  resizeUploadedImages,
  type ExtractionProgress,
} from '../../style/frameExtractor';
import { computeMetrics, type LocalVisualMetrics } from '../../style/localMetrics';
import { Tooltip } from './Tooltip';

const SAFE_ANALYZE_BYTES = 4_200_000;

export interface StyleReferenceAnalyzerFormProps {
  onProfileCreated?: (profile: StyleProfile) => void;
  initialType?: StyleReferenceType;
  compact?: boolean;
}

export const StyleReferenceAnalyzerForm: React.FC<StyleReferenceAnalyzerFormProps> = ({
  onProfileCreated,
  initialType = 'description',
  compact = false,
}) => {
  const { state } = useStore();
  const { tasks, startStyleAnalysisTask, cancelTask, clearTaskMessages } = useAgentTask();
  const styleTask = tasks.style_analysis;
  const baseId = useId();
  const ytInputId = `${baseId}-yt-url`;
  const videoInputId = `${baseId}-video-upload`;
  const imagesInputId = `${baseId}-images-upload`;
  const descInputId = `${baseId}-style-desc`;
  const noteInputId = `${baseId}-style-note`;

  const [refType, setRefType] = useState<StyleReferenceType>(initialType);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [descriptionText, setDescriptionText] = useState('');
  const [note, setNote] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<ExtractionProgress | null>(null);
  const [localMetricsPreview, setLocalMetricsPreview] = useState<LocalVisualMetrics | null>(null);
  const [localExtracting, setLocalExtracting] = useState(false);
  const [localErrorMsg, setLocalErrorMsg] = useState<string | null>(null);
  const [localSuccessMsg, setLocalSuccessMsg] = useState<string | null>(null);

  const localExtractAbortRef = useRef<AbortController | null>(null);
  const extractingActiveRef = useRef(false);

  const analyzing = localExtracting || styleTask.status === 'running';
  const errorMsg = localErrorMsg ?? styleTask.error ?? null;
  const successMsg = localSuccessMsg ?? styleTask.statusMessage ?? null;

  const styleConfig =
    state.modelConfigs.find((c) => c.agentId === 'style_analyst') ??
    state.modelConfigs[0];
  const styleCapabilities = PROVIDER_CAPABILITIES[styleConfig.providerId];
  const missingImageCapability =
    (refType === 'upload_video' || refType === 'upload_images') &&
    !styleCapabilities.image;

  const activeRefCount = state.styleReferences.filter((r) => r.status !== 'failed').length;
  const canAddMoreRefs = activeRefCount < MAX_REFERENCES;

  // Pembatalan otomatis saat unmount hanya berlaku untuk ekstraksi frame lokal browser;
  // panggilan analyzeStyle di server tetap berjalan di AgentTaskProvider agar hasil tersimpan.
  useEffect(() => {
    return () => {
      if (extractingActiveRef.current) {
        localExtractAbortRef.current?.abort();
      }
    };
  }, []);

  const handleCancelExtraction = () => {
    if (extractingActiveRef.current) {
      localExtractAbortRef.current?.abort();
    }
    if (styleTask.status === 'running') {
      cancelTask('style_analysis');
    }
  };

  const handleAnalyzeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (analyzing) return;

    setLocalErrorMsg(null);
    setLocalSuccessMsg(null);
    clearTaskMessages('style_analysis');
    setLocalMetricsPreview(null);

    if (!canAddMoreRefs) {
      setLocalErrorMsg(
        `Maksimal ${MAX_REFERENCES} referensi tersimpan. Hapus salah satu referensi lama di halaman Referensi Gaya terlebih dahulu.`
      );
      return;
    }

    const preGuard = await checkConfigAgainstServerPolicy(styleConfig);
    if (!preGuard.ok) {
      setLocalErrorMsg(preGuard.message);
      return;
    }

    const refId = `ref_${Date.now()}`;
    let sourceLabel = '';
    const extractController = new AbortController();
    localExtractAbortRef.current = extractController;
    extractingActiveRef.current = true;
    setLocalExtracting(true);
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
        framesBase64?: Array<{ mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }>;
        imagesBase64?: Array<{ mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }>;
      };

      if (refType === 'youtube_link') {
        const trimmed = youtubeUrl.trim();
        if (!trimmed) {
          throw new Error('Masukkan URL video YouTube yang valid.');
        }
        if (!isValidYoutubeUrl(trimmed)) {
          throw new Error(
            'URL YouTube harus berawalan https:// dengan host youtube.com, www.youtube.com, m.youtube.com, atau youtu.be.'
          );
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
        const resized = await resizeUploadedImages(imageFiles, extractController.signal);
        sourceLabel = `${imageFiles.length} gambar (${imageFiles[0].name})`;
        payloadRef = {
          referenceId: refId,
          referenceType: 'upload_images',
          imagesBase64: resized.map((r) => ({ mimeType: r.mimeType, data: r.data })),
          descriptionText: descriptionText.trim() || undefined,
          note: note.trim() || undefined,
        };
      } else {
        if (!videoFile) {
          throw new Error('Pilih file video dari komputer Anda terlebih dahulu.');
        }
        if (videoFile.size > MAX_VIDEO_MB * 1024 * 1024) {
          throw new Error(`Ukuran video melebihi batas maksimal ${MAX_VIDEO_MB} MB.`);
        }
        sourceLabel = `${videoFile.name} (${(videoFile.size / (1024 * 1024)).toFixed(1)} MB)`;

        const denseRes = await extractDenseThumbs(videoFile, setProgress, extractController.signal);
        const metrics = computeMetrics(denseRes.thumbs);
        setLocalMetricsPreview(metrics);

        const keyFrames = await extractKeyFrames(videoFile, setProgress, extractController.signal);
        let framesPayload: Array<{ mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }> =
          keyFrames.map((f) => ({
            mimeType: f.mimeType,
            data: f.dataBase64,
          }));

        const buildReq = (
          frames: Array<{ mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }>
        ) => ({
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

      extractingActiveRef.current = false;
      localExtractAbortRef.current = null;
      setLocalExtracting(false);
      setProgress(null);

      const newRef: StyleReference = {
        id: refId,
        type: refType,
        source: sourceLabel,
        note: note.trim() || undefined,
        status: 'new',
      };

      const startRes = await startStyleAnalysisTask({
        payload: {
          reference: payloadRef,
          profile: state.profile,
          knowledge: state.knowledge,
          config: styleConfig,
        },
        newReference: newRef,
        onProfileCreated,
      });

      if (startRes.started) {
        setYoutubeUrl('');
        setDescriptionText('');
        setNote('');
        setVideoFile(null);
        setImageFiles([]);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setLocalSuccessMsg('Ekstraksi referensi gaya dibatalkan oleh pengguna.');
      } else {
        setLocalErrorMsg(
          err instanceof Error ? err.message : 'Gagal menganalisis referensi gaya.'
        );
      }
    } finally {
      extractingActiveRef.current = false;
      setLocalExtracting(false);
      setProgress(null);
      localExtractAbortRef.current = null;
    }
  };

  return (
    <div className={compact ? 'space-y-3.5' : 'space-y-4'}>
      {/* Selector Tipe Referensi */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-slate-200">
            Sumber Referensi ({activeRefCount}/{MAX_REFERENCES})
          </span>
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
                  setLocalErrorMsg(null);
                  clearTaskMessages('style_analysis');
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
            {styleConfig.providerId === 'gemini'
              ? 'Provider aktif (Gemini) menerima URL YouTube secara langsung untuk dianalisis. Anda juga dapat menambahkan catatan ciri visual pada kolom deskripsi di bawah.'
              : `Provider aktif (${label(styleConfig.providerId)}) tidak memproses isi video YouTube secara langsung. Sertakan catatan ciri visual pada kolom deskripsi di bawah, unggah 3–8 screenshot, atau alihkan Analis Gaya Visual ke Gemini.`}
          </div>
          <div>
            <label htmlFor={ytInputId} className="block text-xs font-medium text-slate-200 mb-1.5">
              URL Video YouTube
            </label>
            <input
              id={ytInputId}
              type="url"
              maxLength={500}
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
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-300">
            Untuk video TikTok atau platform non-YouTube, unduh/unggah file videonya di sini (atau pakai 3–8 screenshot) dan tempel link sumbernya pada kolom Catatan di bawah.
          </div>
          <div>
            <label htmlFor={videoInputId} className="block text-xs font-medium text-slate-200 mb-1.5">
              Pilih File Video Lokal (Maks {MAX_VIDEO_MB} MB)
            </label>
            <input
              id={videoInputId}
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
              <div
                role="progressbar"
                aria-label="Progres ekstraksi video"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress.percent}
                className="h-2 w-full overflow-hidden rounded-full bg-slate-800"
              >
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
        <div className="space-y-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-300">
            Untuk referensi TikTok, Reels, atau YouTube Shorts tanpa file video, unggah {MAX_IMAGES_MIN}–{MAX_IMAGES_MAX} screenshot adegan kunci dan tempelkan link sumber di kolom Catatan.
          </div>
          <label htmlFor={imagesInputId} className="block text-xs font-medium text-slate-200 mb-1.5">
            Pilih {MAX_IMAGES_MIN}–{MAX_IMAGES_MAX} Screenshot / Frame Referensi
          </label>
          <input
            id={imagesInputId}
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
        <label htmlFor={descInputId} className="block text-xs font-medium text-slate-200 mb-1.5">
          {refType === 'description'
            ? 'Deskripsi Gaya Visual Referensi (Wajib)'
            : 'Deskripsi / Pengamatan Visual Tambahan (Opsional)'}
        </label>
        <textarea
          id={descInputId}
          rows={compact ? 2 : 3}
          maxLength={MAX_PASTE_CHARS}
          value={descriptionText}
          onChange={(e) => setDescriptionText(e.target.value)}
          placeholder="Contoh: Video edukasi vertikal tempo cepat, cut setiap 2-3 detik, teks putih tebal dengan bayangan gelap di tengah layar, latar B-roll sinematik bernuansa biru gelap."
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus-visible:outline-none"
        />
      </div>

      <div>
        <label htmlFor={noteInputId} className="block text-xs font-medium text-slate-200 mb-1.5">
          Bagian yang Ingin Ditiru / Link Sumber (Opsional)
        </label>
        <input
          id={noteInputId}
          type="text"
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Contoh: Fokus pada ritme hook 3 detik pertama, atau link TikTok/kreator sumber"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus-visible:outline-none"
        />
      </div>

      {missingImageCapability && (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/40 bg-amber-950/45 px-4 py-3 text-xs text-amber-100 leading-relaxed"
        >
          Provider aktif untuk Analis Gaya Visual ({label(styleConfig.providerId)}) tidak mendukung input Gambar/Frame. Pilih tab Deskripsi Manual atau alihkan Analis Gaya Visual ke Gemini, OpenRouter, Nous Portal, atau APInex di Pengaturan Model sebelum menganalisis video/gambar.
        </div>
      )}

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
        <div className="flex flex-wrap items-center gap-2">
          {analyzing && (
            <button
              type="button"
              onClick={handleCancelExtraction}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-xs font-medium text-rose-200 hover:bg-rose-950/80"
            >
              <XCircle className="h-4 w-4" aria-hidden="true" />
              <span>Batalkan</span>
            </button>
          )}
          <button
            type="button"
            disabled={analyzing || !canAddMoreRefs || missingImageCapability}
            onClick={(e) => void handleAnalyzeSubmit(e)}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 transition-colors"
          >
            {analyzing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{analyzing ? 'Menganalisis Gaya...' : 'Analisis & Simpan Profil Gaya'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
