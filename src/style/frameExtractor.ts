import {
  DENSE_INTERVAL_SEC,
  DENSE_MAX_SEC,
  DENSE_THUMB_SIZE,
  FRAME_COUNT_MAX,
  FRAME_COUNT_MIN,
  FRAME_MAX_SIDE,
  MAX_IMAGES_MAX,
  MAX_IMAGES_MIN,
  MAX_VIDEO_MB,
} from '../../shared/constants';

export interface DenseThumbFrame {
  timeSec: number;
  width: number;
  height: number;
  rgbData: Uint8ClampedArray;
}

export interface KeyFrameData {
  timeSec: number;
  width: number;
  height: number;
  mimeType: 'image/jpeg';
  dataBase64: string;
}

export interface ExtractionProgress {
  phase: 'loading' | 'dense' | 'sparse' | 'done';
  percent: number;
  message: string;
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Ekstraksi frame dibatalkan oleh pengguna.', 'AbortError');
  }
}

const SEEK_TIMEOUT_MS = 10_000;
const LOAD_TIMEOUT_MS = 20_000;

function seekVideo(
  video: HTMLVideoElement,
  timeSec: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    checkAborted(signal);
    const targetTime = Math.max(0, timeSec);
    if (Math.abs(video.currentTime - targetTime) < 0.001) {
      resolve();
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(new DOMException('Ekstraksi frame dibatalkan oleh pengguna.', 'AbortError'));
    };

    const onSeeked = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error('Gagal memproses posisi frame video di browser.'));
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Waktu seek frame video habis di browser.'));
    }, SEEK_TIMEOUT_MS);

    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });

    video.currentTime = targetTime;
  });
}

async function loadVideoElement(
  file: File,
  signal?: AbortSignal
): Promise<{ video: HTMLVideoElement; objectUrl: string }> {
  if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
    throw new Error(
      `Ukuran video (${(file.size / (1024 * 1024)).toFixed(1)} MB) melebihi batas ${MAX_VIDEO_MB} MB.`
    );
  }

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = objectUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      checkAborted(signal);
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        video.removeEventListener('loadeddata', onLoaded);
        video.removeEventListener('error', onErr);
        signal?.removeEventListener('abort', onAbort);
      };

      const onAbort = () => {
        cleanup();
        reject(new DOMException('Ekstraksi dibatalkan.', 'AbortError'));
      };
      const onLoaded = () => {
        cleanup();
        if (!Number.isFinite(video.duration) || video.duration <= 0 || video.videoWidth <= 0) {
          reject(new Error('Format atau codec video tidak dapat didekode oleh browser ini.'));
          return;
        }
        resolve();
      };
      const onErr = () => {
        cleanup();
        reject(
          new Error(
            'Browser gagal mendekode file video ini. Gunakan screenshot (3-8 gambar) atau deskripsi manual.'
          )
        );
      };

      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Waktu memuat metadata video habis di browser.'));
      }, LOAD_TIMEOUT_MS);

      video.addEventListener('loadeddata', onLoaded, { once: true });
      video.addEventListener('error', onErr, { once: true });
      signal?.addEventListener('abort', onAbort, { once: true });
    });

    return { video, objectUrl };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

/**
 * Jalur padat (FR-05):
 * Thumbnail 64x36 tiap 0,25 detik hingga maksimal 120 detik pertama.
 * Hanya dipakai untuk analisis metrik lokal di browser dan TIDAK PERNAH dikirim ke server.
 */
export async function extractDenseThumbs(
  file: File,
  onProgress?: (progress: ExtractionProgress) => void,
  signal?: AbortSignal
): Promise<{ thumbs: DenseThumbFrame[]; sampledDurationSec: number }> {
  onProgress?.({
    phase: 'loading',
    percent: 5,
    message: 'Memuat metadata video di browser...',
  });

  const { video, objectUrl } = await loadVideoElement(file, signal);
  const canvas = document.createElement('canvas');
  canvas.width = DENSE_THUMB_SIZE.width;
  canvas.height = DENSE_THUMB_SIZE.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  try {
    if (!ctx) {
      throw new Error('Konteks canvas 2D tidak tersedia untuk ekstraksi thumbnail.');
    }

    const sampledDurationSec = Math.min(video.duration, DENSE_MAX_SEC);
    const timestamps: number[] = [];
    for (let t = 0; t < sampledDurationSec; t += DENSE_INTERVAL_SEC) {
      timestamps.push(Number(t.toFixed(2)));
    }
    if (timestamps.length === 0) {
      timestamps.push(0);
    }

    const thumbs: DenseThumbFrame[] = [];
    for (let i = 0; i < timestamps.length; i += 1) {
      checkAborted(signal);
      const t = timestamps[i];
      await seekVideo(video, t, signal);
      ctx.drawImage(video, 0, 0, DENSE_THUMB_SIZE.width, DENSE_THUMB_SIZE.height);
      const imgData = ctx.getImageData(
        0,
        0,
        DENSE_THUMB_SIZE.width,
        DENSE_THUMB_SIZE.height
      );
      thumbs.push({
        timeSec: t,
        width: DENSE_THUMB_SIZE.width,
        height: DENSE_THUMB_SIZE.height,
        rgbData: new Uint8ClampedArray(imgData.data),
      });

      const pct = 10 + Math.round(((i + 1) / timestamps.length) * 50);
      onProgress?.({
        phase: 'dense',
        percent: pct,
        message: `Jalur padat (lokal): ${i + 1}/${timestamps.length} thumbnail (64x36)...`,
      });
    }

    return { thumbs, sampledDurationSec };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Jalur jarang (FR-05):
 * Mengambil 8-12 key frame dengan sisi terpanjang maksimal 768 px (JPEG).
 * Hanya key frame terpilih ini yang dikirim ke server untuk analisis model.
 */
export async function extractKeyFrames(
  file: File,
  onProgress?: (progress: ExtractionProgress) => void,
  signal?: AbortSignal,
  desiredCount = FRAME_COUNT_MAX
): Promise<KeyFrameData[]> {
  const count = Math.min(FRAME_COUNT_MAX, Math.max(FRAME_COUNT_MIN, desiredCount));
  const { video, objectUrl } = await loadVideoElement(file, signal);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  try {
    if (!ctx) {
      throw new Error('Konteks canvas 2D tidak tersedia untuk ekstraksi key frame.');
    }

    const scale = Math.min(1, FRAME_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const targetW = Math.max(1, Math.round(video.videoWidth * scale));
    const targetH = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.width = targetW;
    canvas.height = targetH;

    const usableDuration = Math.min(video.duration, DENSE_MAX_SEC);
    const frames: KeyFrameData[] = [];

    for (let i = 0; i < count; i += 1) {
      checkAborted(signal);
      const ratio = count === 1 ? 0.5 : i / (count - 1);
      const t = Math.min(Math.max(0.1, ratio * usableDuration * 0.96), Math.max(0, video.duration - 0.05));
      await seekVideo(video, t, signal);
      ctx.drawImage(video, 0, 0, targetW, targetH);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const dataBase64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
      frames.push({
        timeSec: Number(t.toFixed(2)),
        width: targetW,
        height: targetH,
        mimeType: 'image/jpeg',
        dataBase64,
      });

      const pct = 60 + Math.round(((i + 1) / count) * 35);
      onProgress?.({
        phase: 'sparse',
        percent: pct,
        message: `Jalur jarang (key frame): ${i + 1}/${count} frame (${targetW}x${targetH})...`,
      });
    }

    onProgress?.({
      phase: 'done',
      percent: 100,
      message: 'Ekstraksi selesai. File video tetap di browser dan referensi sementara dibersihkan.',
    });

    return frames;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Memperkecil 3-8 gambar unggahan (sisi terpanjang maks 768 px, JPEG) tanpa menyimpannya ke state.
 */
export async function resizeUploadedImages(
  files: File[],
  signal?: AbortSignal
): Promise<Array<{ mimeType: 'image/jpeg'; data: string; previewDataUrl: string }>> {
  if (files.length < MAX_IMAGES_MIN || files.length > MAX_IMAGES_MAX) {
    throw new Error(
      `Unggah antara ${MAX_IMAGES_MIN} hingga ${MAX_IMAGES_MAX} gambar untuk referensi gaya.`
    );
  }

  const results: Array<{ mimeType: 'image/jpeg'; data: string; previewDataUrl: string }> = [];

  for (const file of files) {
    checkAborted(signal);
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error(`Gagal memuat gambar "${file.name}".`));
        el.src = objectUrl;
      });

      const scale = Math.min(1, FRAME_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Konteks canvas 2D tidak tersedia untuk mengubah ukuran gambar.');
      }
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      canvas.width = 0;
      canvas.height = 0;

      results.push({
        mimeType: 'image/jpeg',
        data: dataUrl.replace(/^data:image\/jpeg;base64,/, ''),
        previewDataUrl: dataUrl,
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  return results;
}

export function estimateAnalyzePayloadBytes(payload: unknown): number {
  const json = JSON.stringify(payload);
  return new Blob([json]).size;
}
