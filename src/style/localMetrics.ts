export interface PixelFrameInput {
  timeSec: number;
  width: number;
  height: number;
  rgbData: Uint8ClampedArray;
}

export interface LocalVisualMetrics {
  estimatedCutsPerMin: number | null;
  avgShotSec: number | null;
  dominantColors: string[];
  sampledDurationSec: number;
  denseFrameCount: number;
  heuristicNote: string;
}

/**
 * Menghitung Mean Absolute Difference (MAD) ternormalisasi [0..1] antar dua frame RGBA.
 */
export function framePixelDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;

  let sumDiff = 0;
  let pixelCount = 0;

  for (let i = 0; i + 2 < len; i += 4) {
    const dr = Math.abs(a[i] - b[i]);
    const dg = Math.abs(a[i + 1] - b[i + 1]);
    const db = Math.abs(a[i + 2] - b[i + 2]);
    sumDiff += (dr + dg + db) / (3 * 255);
    pixelCount += 1;
  }

  return pixelCount > 0 ? sumDiff / pixelCount : 0;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Mengekstrak hingga 3 warna dominan dari himpunan frame menggunakan kuantisasi bucket RGB (4-bit per kanal).
 */
export function extractDominantColorsFromFrames(frames: PixelFrameInput[]): string[] {
  if (frames.length === 0) return [];

  const buckets = new Map<
    string,
    { count: number; sumR: number; sumG: number; sumB: number }
  >();

  for (const frame of frames) {
    const data = frame.rgbData;
    for (let i = 0; i + 2 < data.length; i += 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const qr = r >> 4;
      const qg = g >> 4;
      const qb = b >> 4;
      const key = `${qr}-${qg}-${qb}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.count += 1;
        existing.sumR += r;
        existing.sumG += g;
        existing.sumB += b;
      } else {
        buckets.set(key, { count: 1, sumR: r, sumG: g, sumB: b });
      }
    }
  }

  const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
  const picked: string[] = [];

  for (const bucket of sorted) {
    if (picked.length >= 3) break;
    const hex = rgbToHex(
      bucket.sumR / bucket.count,
      bucket.sumG / bucket.count,
      bucket.sumB / bucket.count
    );
    if (!picked.includes(hex)) {
      picked.push(hex);
    }
  }

  return picked;
}

/**
 * Menghitung metrik visual lokal secara deterministik (BP 10.2):
 * - estimatedCutsPerMin dan avgShotSec dihitung dari selisih piksel antar thumbnail padat (jalur padat).
 * - Heuristik deteksi cut adaptif:
 *   threshold = max(0.12, meanDiff + 2.0 * stdDevDiff), dengan jeda minimal antar-cut 0.50 detik.
 * - dominantColors dihitung dari frame representatif.
 */
export function computeMetrics(
  denseFrames: PixelFrameInput[],
  colorFrames: PixelFrameInput[] = denseFrames
): LocalVisualMetrics {
  const dominantColors = extractDominantColorsFromFrames(
    colorFrames.length > 0 ? colorFrames : denseFrames
  );

  if (denseFrames.length < 2) {
    return {
      estimatedCutsPerMin: null,
      avgShotSec: null,
      dominantColors,
      sampledDurationSec: 0,
      denseFrameCount: denseFrames.length,
      heuristicNote:
        'Jumlah thumbnail padat kurang dari 2 frame sehingga perkiraan cut tidak dapat dihitung.',
    };
  }

  const diffs: Array<{ timeSec: number; diff: number }> = [];
  for (let i = 1; i < denseFrames.length; i += 1) {
    const diff = framePixelDifference(denseFrames[i - 1].rgbData, denseFrames[i].rgbData);
    diffs.push({ timeSec: denseFrames[i].timeSec, diff });
  }

  const meanDiff = diffs.reduce((acc, d) => acc + d.diff, 0) / diffs.length;
  const variance =
    diffs.reduce((acc, d) => acc + (d.diff - meanDiff) ** 2, 0) / diffs.length;
  const stdDev = Math.sqrt(variance);
  const adaptiveThreshold = Math.max(0.12, meanDiff + 2.0 * stdDev);

  let cutCount = 0;
  let lastCutTime = -Infinity;
  const MIN_CUT_GAP_SEC = 0.5;

  for (const item of diffs) {
    if (item.diff >= adaptiveThreshold && item.timeSec - lastCutTime >= MIN_CUT_GAP_SEC) {
      cutCount += 1;
      lastCutTime = item.timeSec;
    }
  }

  const firstT = denseFrames[0].timeSec;
  const lastT = denseFrames[denseFrames.length - 1].timeSec;
  const durationSec = Math.max(0.25, lastT - firstT + 0.25);
  const estimatedCutsPerMin = Number(((cutCount / durationSec) * 60).toFixed(1));
  const shotCount = cutCount + 1;
  const avgShotSec = Number((durationSec / shotCount).toFixed(2));

  return {
    estimatedCutsPerMin,
    avgShotSec,
    dominantColors,
    sampledDurationSec: Number(durationSec.toFixed(2)),
    denseFrameCount: denseFrames.length,
    heuristicNote: `Perkiraan heuristik lokal (ambang adaptif MAD=${adaptiveThreshold.toFixed(
      3
    )}, ${cutCount} perpindahan terdeteksi dalam ${durationSec.toFixed(
      1
    )} dtk). Bersifat estimasi sebagai acuan model.`,
  };
}
