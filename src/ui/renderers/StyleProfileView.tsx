import React, { useId } from 'react';
import { EyeOff, Palette, PencilLine } from 'lucide-react';
import type { StyleAttributes } from '../../../shared/schemas';
import type { StyleAttributeKey } from '../../style/mergeProfiles';
import { label } from '../../config/labels';
import { StatusBadge } from '../components/StatusBadge';
import { Tooltip } from '../components/Tooltip';

const ATTRIBUTE_META: Array<{
  key: StyleAttributeKey;
  title: string;
  tooltip: string;
}> = [
  {
    key: 'rhythm',
    title: 'Ritme & Kecepatan Potongan',
    tooltip: 'Pola tempo editing beserta perkiraan rata-rata durasi shot dan potongan per menit.',
  },
  {
    key: 'hookVisual',
    title: 'Hook Visual 3 Detik Awal',
    tooltip: 'Ciri visual awal yang menahan perhatian penonton sebelum menggulir.',
  },
  {
    key: 'color',
    title: 'Mood & Palet Warna',
    tooltip: 'Nuansa pencahayaan serta warna dominan (kode HEX) yang diekstrak dari frame.',
  },
  {
    key: 'onScreenText',
    title: 'Gaya Teks di Layar',
    tooltip: 'Posisi, ukuran, ketebalan, dan ritme kemunculan teks penjelas pada video.',
  },
  {
    key: 'subtitle',
    title: 'Subtitle / Takarir',
    tooltip: 'Format penulisan takarir narasi seperti jumlah kata per baris dan penekanan.',
  },
  {
    key: 'assets',
    title: 'Jenis Aset Visual',
    tooltip: 'Kategori aset utama seperti B-roll stok, motion graphic, ilustrasi, atau diagram.',
  },
  {
    key: 'composition',
    title: 'Komposisi & Framing',
    tooltip: 'Tata letak elemen, rasio ruang kosong, dan pembagian area layar.',
  },
  {
    key: 'transitions',
    title: 'Pola Transisi',
    tooltip: 'Cara perpindahan antar adegan seperti hard cut, zoom halus, atau whoosh.',
  },
  {
    key: 'audio',
    title: 'Nuansa Audio & Musik',
    tooltip: 'Kesan latar musik, tempo narasi, dan keseimbangan efek suara.',
  },
  {
    key: 'thumbnail',
    title: 'Pola Thumbnail',
    tooltip: 'Struktur visual sampul video untuk memaksimalkan keterbacaan di feed.',
  },
];

export interface StyleProfileViewProps {
  attributes: StyleAttributes;
  edited?: boolean;
  ignoredAttributes?: string[];
  onChangeAttributes?: (next: StyleAttributes) => void;
  onToggleIgnore?: (key: StyleAttributeKey) => void;
  selectedSources?: Record<string, string>;
  sourceOptions?: Array<{ id: string; name: string }>;
  onSelectAttributeSource?: (key: StyleAttributeKey, profileId: string) => void;
}

export const StyleProfileView: React.FC<StyleProfileViewProps> = ({
  attributes,
  edited = false,
  ignoredAttributes = [],
  onChangeAttributes,
  onToggleIgnore,
  selectedSources,
  sourceOptions,
  onSelectAttributeSource,
}) => {
  const baseId = useId();
  const avgShotId = `${baseId}-avg-shot`;
  const cutsPerMinId = `${baseId}-cuts-per-min`;
  const editable = Boolean(onChangeAttributes);

  const updateTextAttr = (
    key: Exclude<StyleAttributeKey, 'rhythm' | 'color'>,
    nextValue: string
  ) => {
    if (!onChangeAttributes) return;
    onChangeAttributes({
      ...attributes,
      [key]: {
        value: nextValue,
        confidence: attributes[key].confidence,
        source: 'manual',
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-sky-400" aria-hidden="true" />
          <span>10 Atribut Gaya Abstrak (Inspirasi Produksi, Bukan Menyalin Karya)</span>
        </div>
        {edited && (
          <span className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-300">
            <PencilLine className="h-3 w-3" aria-hidden="true" />
            Sudah Diedit Manual
          </span>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {ATTRIBUTE_META.map((meta) => {
          const isIgnored = ignoredAttributes.includes(meta.key);
          const attr = attributes[meta.key];

          return (
            <div
              key={meta.key}
              className={`rounded-xl border p-4 space-y-2.5 transition-colors ${
                isIgnored
                  ? 'border-slate-800/60 bg-slate-950/30 opacity-65'
                  : 'border-slate-800 bg-slate-950/70'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <h5 className="text-xs font-semibold text-slate-100">{meta.title}</h5>
                  <Tooltip text={meta.tooltip} label={`Panduan ${meta.title}`} />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge value={attr.confidence} kind="confidence" />
                  <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300">
                    {label(attr.source)}
                  </span>
                </div>
              </div>

              {/* Nilai Atribut */}
              {meta.key === 'rhythm' ? (
                <div className="space-y-2">
                  {editable ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        aria-label="Pola ritme"
                        value={attributes.rhythm.value.pattern}
                        onChange={(e) =>
                          onChangeAttributes?.({
                            ...attributes,
                            rhythm: {
                              ...attributes.rhythm,
                              source: 'manual',
                              value: {
                                ...attributes.rhythm.value,
                                pattern: e.target.value,
                              },
                            },
                          })
                        }
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 focus:border-sky-500 focus-visible:outline-none"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label htmlFor={avgShotId} className="block text-[11px] text-slate-400">
                            Rata-rata Shot (dtk)
                          </label>
                          <input
                            id={avgShotId}
                            type="number"
                            step="0.1"
                            value={attributes.rhythm.value.avgShotSec ?? ''}
                            onChange={(e) => {
                              const parsed = e.target.value === '' ? null : Number(e.target.value);
                              onChangeAttributes?.({
                                ...attributes,
                                rhythm: {
                                  ...attributes.rhythm,
                                  source: 'manual',
                                  value: {
                                    ...attributes.rhythm.value,
                                    avgShotSec: Number.isFinite(parsed as number) ? parsed : null,
                                  },
                                },
                              });
                            }}
                            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-mono text-slate-100 tabular-nums"
                          />
                        </div>
                        <div>
                          <label htmlFor={cutsPerMinId} className="block text-[11px] text-slate-400">
                            Potongan / Menit
                          </label>
                          <input
                            id={cutsPerMinId}
                            type="number"
                            step="0.5"
                            value={attributes.rhythm.value.cutsPerMin ?? ''}
                            onChange={(e) => {
                              const parsed = e.target.value === '' ? null : Number(e.target.value);
                              onChangeAttributes?.({
                                ...attributes,
                                rhythm: {
                                  ...attributes.rhythm,
                                  source: 'manual',
                                  value: {
                                    ...attributes.rhythm.value,
                                    cutsPerMin: Number.isFinite(parsed as number) ? parsed : null,
                                  },
                                },
                              });
                            }}
                            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-mono text-slate-100 tabular-nums"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs leading-relaxed text-slate-200">
                        {attributes.rhythm.value.pattern}
                      </p>
                      <p className="text-[11px] font-mono text-slate-400 tabular-nums">
                        Rata-rata shot:{' '}
                        {attributes.rhythm.value.avgShotSec !== null &&
                        attributes.rhythm.value.avgShotSec !== undefined
                          ? `${attributes.rhythm.value.avgShotSec} dtk`
                          : 'Tidak terukur'}
                        {' · '}
                        Potongan/menit:{' '}
                        {attributes.rhythm.value.cutsPerMin !== null &&
                        attributes.rhythm.value.cutsPerMin !== undefined
                          ? `${attributes.rhythm.value.cutsPerMin}`
                          : 'Tidak terukur'}
                      </p>
                    </div>
                  )}
                </div>
              ) : meta.key === 'color' ? (
                <div className="space-y-2">
                  {editable ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        aria-label="Mood warna"
                        value={attributes.color.value.mood}
                        onChange={(e) =>
                          onChangeAttributes?.({
                            ...attributes,
                            color: {
                              ...attributes.color,
                              source: 'manual',
                              value: {
                                ...attributes.color.value,
                                mood: e.target.value,
                              },
                            },
                          })
                        }
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 focus:border-sky-500 focus-visible:outline-none"
                      />
                      <input
                        type="text"
                        aria-label="Warna dominan (pisahkan koma)"
                        value={attributes.color.value.dominantColors.join(', ')}
                        onChange={(e) =>
                          onChangeAttributes?.({
                            ...attributes,
                            color: {
                              ...attributes.color,
                              source: 'manual',
                              value: {
                                ...attributes.color.value,
                                dominantColors: e.target.value
                                  .split(',')
                                  .map((c) => c.trim())
                                  .filter(Boolean),
                              },
                            },
                          })
                        }
                        placeholder="#0F172A, #38BDF8"
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-mono text-slate-100"
                      />
                    </div>
                  ) : (
                    <p className="text-xs leading-relaxed text-slate-200">
                      {attributes.color.value.mood}
                    </p>
                  )}

                  {attributes.color.value.dominantColors.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      {attributes.color.value.dominantColors.map((hex, cIdx) => (
                        <span
                          key={`${hex}-${cIdx}`}
                          className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-slate-200"
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-sm border border-white/20"
                            style={{ backgroundColor: hex }}
                            aria-hidden="true"
                          />
                          {hex}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : editable ? (
                <textarea
                  rows={2}
                  aria-label={meta.title}
                  value={attributes[meta.key].value}
                  onChange={(e) =>
                    updateTextAttr(
                      meta.key as Exclude<StyleAttributeKey, 'rhythm' | 'color'>,
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs leading-relaxed text-slate-100 focus:border-sky-500 focus-visible:outline-none"
                />
              ) : (
                <p className="text-xs leading-relaxed text-slate-200">
                  {attributes[meta.key].value}
                </p>
              )}

              {/* Kontrol Pilih Sumber & Abaikan Atribut */}
              {(onToggleIgnore || (sourceOptions && sourceOptions.length > 1 && onSelectAttributeSource)) && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2">
                  {sourceOptions && sourceOptions.length > 1 && onSelectAttributeSource ? (
                    <select
                      aria-label={`Pilih sumber ${meta.title}`}
                      value={selectedSources?.[meta.key] ?? ''}
                      onChange={(e) => onSelectAttributeSource(meta.key, e.target.value)}
                      className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200"
                    >
                      <option value="">Otomatis (Bobot Tertinggi)</option>
                      {sourceOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          Ambil dari: {opt.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span />
                  )}

                  {onToggleIgnore && (
                    <button
                      type="button"
                      onClick={() => onToggleIgnore(meta.key)}
                      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                        isIgnored
                          ? 'border border-amber-500/40 bg-amber-500/10 text-amber-200'
                          : 'border border-slate-700 bg-slate-900 text-slate-300 hover:text-white'
                      }`}
                    >
                      <EyeOff className="h-3 w-3" aria-hidden="true" />
                      <span>{isIgnored ? 'Diabaikan (Aktifkan)' : 'Abaikan'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
