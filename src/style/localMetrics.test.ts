import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics, type PixelFrameInput } from './localMetrics';

function makeSolidFrame(
  timeSec: number,
  r: number,
  g: number,
  b: number,
  width = 8,
  height = 8
): PixelFrameInput {
  const rgbData = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgbData.length; i += 4) {
    rgbData[i] = r;
    rgbData[i + 1] = g;
    rgbData[i + 2] = b;
    rgbData[i + 3] = 255;
  }
  return { timeSec, width, height, rgbData };
}

test('computeMetrics menangani kurang dari 2 frame dengan aman', () => {
  const single = computeMetrics([makeSolidFrame(0, 20, 40, 200)]);
  assert.equal(single.estimatedCutsPerMin, null);
  assert.equal(single.avgShotSec, null);
  assert.equal(single.dominantColors.length, 1);
  assert.equal(single.dominantColors[0], '#1428C8');
});

test('computeMetrics mendeteksi cut pada perubahan adegan besar dan menghitung metrik durasi', () => {
  const frames: PixelFrameInput[] = [];
  // 20 frame (0..4.75s): 0..2.25s biru gelap, 2.50..4.75s putih terang
  for (let i = 0; i < 20; i += 1) {
    const t = i * 0.25;
    if (i < 10) {
      frames.push(makeSolidFrame(t, 10, 20, 180));
    } else {
      frames.push(makeSolidFrame(t, 240, 240, 240));
    }
  }

  const metrics = computeMetrics(frames);
  assert.equal(metrics.denseFrameCount, 20);
  assert.equal(metrics.sampledDurationSec, 5);
  assert.ok(metrics.estimatedCutsPerMin !== null && metrics.estimatedCutsPerMin > 0);
  assert.ok(metrics.avgShotSec !== null && metrics.avgShotSec > 0 && metrics.avgShotSec <= 5);
  assert.ok(metrics.dominantColors.length >= 2);
});
