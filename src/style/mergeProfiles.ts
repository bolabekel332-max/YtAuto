import type {
  AttributeSource,
  ConfidenceLevel,
  StyleAttribute,
  StyleAttributes,
  StyleProfile,
} from '../../shared/schemas';

export type StyleAttributeKey = keyof StyleAttributes;

export interface MergeSourceInput {
  profile: StyleProfile;
  weight: number;
  includedAttributes?: Partial<Record<StyleAttributeKey, boolean>>;
}

function normalizeWeights(items: MergeSourceInput[]): number[] {
  const raw = items.map((item) => (Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    // Bobot netral seimbang bila pengguna belum mengatur bobot manual
    return items.map(() => (items.length > 0 ? 1 / items.length : 0));
  }
  return raw.map((w) => w / sum);
}

function isIncluded(item: MergeSourceInput, key: StyleAttributeKey): boolean {
  if (item.includedAttributes && item.includedAttributes[key] === false) {
    return false;
  }
  if (item.profile.ignoredAttributes?.includes(key)) {
    return false;
  }
  return true;
}

function pickHighestWeightTextAttr(
  items: Array<{ item: MergeSourceInput; normWeight: number }>,
  key: Exclude<StyleAttributeKey, 'rhythm' | 'color'>
): StyleAttribute<string> {
  const eligible = items.filter(({ item }) => isIncluded(item, key));
  if (eligible.length === 0) {
    return {
      value: 'Tidak dipilih (diabaikan oleh pengguna)',
      confidence: 'low',
      source: 'manual',
    };
  }
  const best = eligible.reduce((prev, curr) =>
    curr.normWeight > prev.normWeight ? curr : prev
  );
  return structuredClone(best.item.profile.attributes[key]);
}

function combineConfidence(levels: ConfidenceLevel[]): ConfidenceLevel {
  if (levels.length === 0) return 'low';
  if (levels.includes('high') && !levels.includes('low')) return 'high';
  if (levels.includes('medium') || levels.includes('high')) return 'medium';
  return 'low';
}

function combineSource(sources: AttributeSource[]): AttributeSource {
  if (sources.includes('manual')) return 'manual';
  if (sources.includes('local_metric')) return 'local_metric';
  return 'model';
}

/**
 * Sintesis deterministik beberapa Profil Gaya oleh kode (FR-06 / BP 10.4):
 * - Nilai numerik (avgShotSec, cutsPerMin): rata-rata berbobot.
 * - Warna dominan: gabungan teratas berbobot.
 * - Atribut teks: diambil dari referensi berbobot tertinggi yang dicentang ambil.
 * - Atribut yang tidak dicentang tidak ikut berkontribusi.
 */
export function mergeProfiles(
  sources: MergeSourceInput[],
  mergedName = 'Profil Gaya Gabungan'
): StyleProfile {
  if (sources.length === 0) {
    throw new Error('Minimal satu Profil Gaya dibutuhkan untuk digabung.');
  }

  const weights = normalizeWeights(sources);
  const weighted = sources.map((item, idx) => ({ item, normWeight: weights[idx] }));

  // 1. Rhythm (pattern dari bobot tertinggi yang dicentang; angka rata-rata berbobot)
  const rhythmEligible = weighted.filter(({ item }) => isIncluded(item, 'rhythm'));
  let rhythmAttr: StyleAttributes['rhythm'];
  if (rhythmEligible.length === 0) {
    rhythmAttr = {
      value: { pattern: 'Tidak dipilih (diabaikan oleh pengguna)', avgShotSec: null, cutsPerMin: null },
      confidence: 'low',
      source: 'manual',
    };
  } else {
    const bestRhythm = rhythmEligible.reduce((p, c) =>
      c.normWeight > p.normWeight ? c : p
    );
    let shotSum = 0;
    let shotW = 0;
    let cutsSum = 0;
    let cutsW = 0;

    for (const { item, normWeight } of rhythmEligible) {
      const r = item.profile.attributes.rhythm.value;
      if (typeof r.avgShotSec === 'number' && Number.isFinite(r.avgShotSec)) {
        shotSum += r.avgShotSec * normWeight;
        shotW += normWeight;
      }
      if (typeof r.cutsPerMin === 'number' && Number.isFinite(r.cutsPerMin)) {
        cutsSum += r.cutsPerMin * normWeight;
        cutsW += normWeight;
      }
    }

    rhythmAttr = {
      value: {
        pattern: bestRhythm.item.profile.attributes.rhythm.value.pattern,
        avgShotSec: shotW > 0 ? Number((shotSum / shotW).toFixed(2)) : null,
        cutsPerMin: cutsW > 0 ? Number((cutsSum / cutsW).toFixed(1)) : null,
      },
      confidence: combineConfidence(
        rhythmEligible.map((e) => e.item.profile.attributes.rhythm.confidence)
      ),
      source: combineSource(
        rhythmEligible.map((e) => e.item.profile.attributes.rhythm.source)
      ),
    };
  }

  // 2. Color (mood dari bobot tertinggi, dominantColors gabungan teratas berbobot)
  const colorEligible = weighted.filter(({ item }) => isIncluded(item, 'color'));
  let colorAttr: StyleAttributes['color'];
  if (colorEligible.length === 0) {
    colorAttr = {
      value: { mood: 'Tidak dipilih (diabaikan oleh pengguna)', dominantColors: [] },
      confidence: 'low',
      source: 'manual',
    };
  } else {
    const bestColor = colorEligible.reduce((p, c) =>
      c.normWeight > p.normWeight ? c : p
    );
    const colorScores = new Map<string, number>();
    for (const { item, normWeight } of colorEligible) {
      const cols = item.profile.attributes.color.value.dominantColors;
      cols.forEach((hex, rank) => {
        const normalizedHex = hex.trim().toUpperCase();
        if (!normalizedHex) return;
        const rankFactor = Math.max(0.25, 1 - rank * 0.25);
        colorScores.set(
          normalizedHex,
          (colorScores.get(normalizedHex) ?? 0) + normWeight * rankFactor
        );
      });
    }

    const topColors = Array.from(colorScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([hex]) => hex);

    colorAttr = {
      value: {
        mood: bestColor.item.profile.attributes.color.value.mood,
        dominantColors: topColors,
      },
      confidence: combineConfidence(
        colorEligible.map((e) => e.item.profile.attributes.color.confidence)
      ),
      source: combineSource(
        colorEligible.map((e) => e.item.profile.attributes.color.source)
      ),
    };
  }

  const attributes: StyleAttributes = {
    rhythm: rhythmAttr,
    hookVisual: pickHighestWeightTextAttr(weighted, 'hookVisual'),
    color: colorAttr,
    onScreenText: pickHighestWeightTextAttr(weighted, 'onScreenText'),
    subtitle: pickHighestWeightTextAttr(weighted, 'subtitle'),
    assets: pickHighestWeightTextAttr(weighted, 'assets'),
    composition: pickHighestWeightTextAttr(weighted, 'composition'),
    transitions: pickHighestWeightTextAttr(weighted, 'transitions'),
    audio: pickHighestWeightTextAttr(weighted, 'audio'),
    thumbnail: pickHighestWeightTextAttr(weighted, 'thumbnail'),
  };

  const referenceIds = Array.from(
    new Set(sources.flatMap((s) => s.profile.referenceIds))
  );

  const weightsRecord: Record<string, number> = {};
  sources.forEach((s, idx) => {
    weightsRecord[s.profile.id] = Number(weights[idx].toFixed(3));
  });

  const ignoredAttributes: StyleAttributeKey[] = [];
  const allKeys: StyleAttributeKey[] = [
    'rhythm',
    'hookVisual',
    'color',
    'onScreenText',
    'subtitle',
    'assets',
    'composition',
    'transitions',
    'audio',
    'thumbnail',
  ];
  for (const key of allKeys) {
    if (!weighted.some(({ item }) => isIncluded(item, key))) {
      ignoredAttributes.push(key);
    }
  }

  return {
    id: `style_merged_${Date.now()}`,
    name: mergedName.trim() || 'Profil Gaya Gabungan',
    referenceIds,
    weights: weightsRecord,
    attributes,
    edited: false,
    ignoredAttributes: ignoredAttributes.length > 0 ? ignoredAttributes : undefined,
  };
}
