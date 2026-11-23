import test from 'node:test';
import assert from 'node:assert/strict';
import type { StyleProfile } from '../../shared/schemas';
import { mergeProfiles } from './mergeProfiles';

function makeProfile(
  id: string,
  name: string,
  avgShotSec: number,
  cutsPerMin: number,
  colorHex: string,
  hookVisual: string
): StyleProfile {
  return {
    id,
    name,
    referenceIds: [`ref_${id}`],
    weights: { [id]: 1 },
    edited: false,
    attributes: {
      rhythm: {
        value: { pattern: `Pola ${name}`, avgShotSec, cutsPerMin },
        confidence: 'high',
        source: 'local_metric',
      },
      hookVisual: { value: hookVisual, confidence: 'high', source: 'model' },
      color: {
        value: { mood: `Mood ${name}`, dominantColors: [colorHex] },
        confidence: 'medium',
        source: 'local_metric',
      },
      onScreenText: { value: `Teks ${name}`, confidence: 'medium', source: 'model' },
      subtitle: { value: `Sub ${name}`, confidence: 'medium', source: 'model' },
      assets: { value: `Aset ${name}`, confidence: 'medium', source: 'model' },
      composition: { value: `Komp ${name}`, confidence: 'medium', source: 'model' },
      transitions: { value: `Trans ${name}`, confidence: 'medium', source: 'model' },
      audio: { value: `Audio ${name}`, confidence: 'low', source: 'model' },
      thumbnail: { value: `Thumb ${name}`, confidence: 'medium', source: 'model' },
    },
  };
}

test('mergeProfiles menghitung rata-rata berbobot angka dan memilih teks berbobot tertinggi serta mengabaikan atribut non-aktif', () => {
  const pA = makeProfile('a', 'A', 2.0, 30, '#112233', 'Hook A');
  const pB = makeProfile('b', 'B', 4.0, 10, '#AABBCC', 'Hook B');

  const merged = mergeProfiles(
    [
      { profile: pA, weight: 75 },
      { profile: pB, weight: 25, includedAttributes: { hookVisual: false } },
    ],
    'Gabungan AB'
  );

  assert.equal(merged.name, 'Gabungan AB');
  assert.deepEqual(merged.weights, { a: 0.75, b: 0.25 });
  // 2.0*0.75 + 4.0*0.25 = 2.5
  assert.equal(merged.attributes.rhythm.value.avgShotSec, 2.5);
  // 30*0.75 + 10*0.25 = 25
  assert.equal(merged.attributes.rhythm.value.cutsPerMin, 25);
  assert.equal(merged.attributes.rhythm.value.pattern, 'Pola A');
  assert.equal(merged.attributes.hookVisual.value, 'Hook A');
  assert.deepEqual(merged.attributes.color.value.dominantColors, ['#112233', '#AABBCC']);

  // Jika semua sumber mengabaikan atribut audio -> masuk ignoredAttributes
  const ignoredBoth = mergeProfiles([
    { profile: pA, weight: 50, includedAttributes: { audio: false } },
    { profile: pB, weight: 50, includedAttributes: { audio: false } },
  ]);
  assert.ok(ignoredBoth.ignoredAttributes?.includes('audio'));
});
