import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Palette, Save, Sparkles } from 'lucide-react';
import type { ChannelProfile, Platform } from '../../../shared/schemas';
import {
  isDefaultSensitiveNiche,
  PROFILE_OPTIONS,
  PROFILE_PRESETS,
} from '../../config/presets';
import { useStore } from '../../state/store';
import { Card } from '../components/Card';
import { ChipGroup, SelectField } from '../components/FormFields';
import { Tooltip } from '../components/Tooltip';

export const SetupChannel: React.FC = () => {
  const { state, dispatch } = useStore();
  const [form, setForm] = useState<ChannelProfile>(() => structuredClone(state.profile));
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const isPresetSensitive = isDefaultSensitiveNiche(form.niche);
  const effectiveSensitive = isPresetSensitive || form.sensitiveNiche;

  const applyPreset = (presetIndex: number) => {
    const preset = PROFILE_PRESETS[presetIndex];
    if (!preset) return;
    setForm(structuredClone(preset.profile));
    setSavedNotice(null);
    setErrorNotice(null);
  };

  const handleNicheChange = (niche: string) => {
    const autoSensitive = isDefaultSensitiveNiche(niche);
    setForm((prev) => ({
      ...prev,
      niche,
      sensitiveNiche: autoSensitive ? true : niche === 'Lainnya' ? prev.sensitiveNiche : false,
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorNotice(null);
    setSavedNotice(null);

    if (form.niche === 'Lainnya' && !form.customNiche?.trim()) {
      setErrorNotice('Isi nama niche kustom karena Anda memilih opsi Lainnya.');
      return;
    }
    if (form.platforms.length === 0) {
      setErrorNotice('Pilih minimal satu platform tujuan.');
      return;
    }
    if (form.audience.interests.length === 0) {
      setErrorNotice('Pilih minimal satu minat audiens.');
      return;
    }

    const normalized: ChannelProfile = {
      ...form,
      sensitiveNiche: effectiveSensitive,
    };
    dispatch({ type: 'SET_PROFILE', profile: normalized });
    setForm(normalized);
    setSavedNotice(
      'Profil channel berhasil disimpan. Seluruh agent akan menyesuaikan konteks ini.'
    );
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Pilihan Preset Cepat */}
      <Card
        title="Preset Cepat Setup Channel"
        description="Pilih salah satu pola channel siap pakai untuk mengisi seluruh kolom secara otomatis, lalu sesuaikan seperlunya."
        tooltip="Preset mempercepat pengisian awal tanpa mengunci pilihan Anda. Anda tetap bebas mengubah setiap kolom di bawah."
      >
        <div className="grid gap-3 md:grid-cols-3">
          {PROFILE_PRESETS.map((preset, idx) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(idx)}
              className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-left hover:border-sky-500/50 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-100">{preset.name}</span>
                <Sparkles className="h-4 w-4 text-sky-400 shrink-0" aria-hidden="true" />
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                {preset.description}
              </p>
            </button>
          ))}
        </div>
      </Card>

      {/* Peringatan Niche Sensitif */}
      {effectiveSensitive && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-950/50 px-4 py-3.5 text-xs text-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold">
              Niche Sensitif Terdeteksi (Keuangan / Kesehatan / Hukum / Berita Aktual)
            </p>
            <p className="leading-relaxed opacity-90">
              Agent Kepatuhan dan Penulis Naskah akan otomatis mewajibkan nada edukatif berimbang, penyangkalan bukan nasihat profesional, serta menghindari klaim absolut atau menjanjikan hasil pasti.
            </p>
          </div>
        </div>
      )}

      {/* Identitas Niche & Platform */}
      <Card
        title="Identitas Niche & Format Target"
        description="Tentukan topik utama, bahasa, gaya bahasa, serta platform distribusi konten faceless Anda."
        tooltip="Setiap opsi memiliki pilihan 'Lainnya' agar Anda bisa mengisi konteks spesifik jika tidak tersedia di daftar."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <SelectField
              label="Niche Utama Channel"
              value={form.niche}
              options={PROFILE_OPTIONS.niches}
              onChange={handleNicheChange}
              customValue={form.customNiche}
              onCustomChange={(v) => setForm((p) => ({ ...p, customNiche: v }))}
              customPlaceholder="Contoh: Arsitektur berkelanjutan & desain mikro"
              tooltip="Bidang pembahasan inti channel. Topik Kesehatan, Keuangan Edukatif, dan Hukum otomatis ditandai sensitif."
            />

            {form.niche === 'Lainnya' && (
              <label className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-xs text-slate-200">
                <input
                  type="checkbox"
                  checked={form.sensitiveNiche}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, sensitiveNiche: e.target.checked }))
                  }
                  className="mt-0.5 h-4 w-4 accent-amber-400"
                />
                <span>
                  Niche saya sensitif (menyentuh kesehatan, keuangan, hukum, atau berita sensitif)
                </span>
              </label>
            )}
          </div>

          <SelectField
            label="Bahasa Utama Konten"
            value={form.language}
            options={PROFILE_OPTIONS.languages}
            onChange={(language) => setForm((p) => ({ ...p, language }))}
            customValue={form.customLanguage}
            onCustomChange={(v) => setForm((p) => ({ ...p, customLanguage: v }))}
            customPlaceholder="Contoh: Bahasa Indonesia dengan istilah teknis Inggris"
            tooltip="Menentukan bahasa naskah, hook, judul, caption, dan teks layar yang dihasilkan agent."
          />

          <SelectField
            label="Nada & Gaya Penyampaian"
            value={form.tone}
            options={PROFILE_OPTIONS.tones}
            onChange={(tone) => setForm((p) => ({ ...p, tone }))}
            customValue={form.customTone}
            onCustomChange={(v) => setForm((p) => ({ ...p, customTone: v }))}
            customPlaceholder="Contoh: Tenang, reflektif, tanpa sensasionalisme"
            tooltip="Mengatur kepribadian narasi dari santai hingga analitis formal."
          />

          <SelectField
            label="Frekuensi Unggah"
            value={form.postingFrequency}
            options={PROFILE_OPTIONS.postingFrequencies}
            onChange={(postingFrequency) => setForm((p) => ({ ...p, postingFrequency }))}
            customValue={form.customPostingFrequency}
            onCustomChange={(v) => setForm((p) => ({ ...p, customPostingFrequency: v }))}
            customPlaceholder="Contoh: 4x/minggu"
            tooltip="Dipakai agent Periset saat menyusun jadwal kalender konten."
          />

          <SelectField
            label="Target Durasi Video"
            value={form.targetDuration}
            options={PROFILE_OPTIONS.targetDurations}
            onChange={(targetDuration) => setForm((p) => ({ ...p, targetDuration }))}
            customValue={form.customTargetDuration}
            onCustomChange={(v) => setForm((p) => ({ ...p, customTargetDuration: v }))}
            customPlaceholder="Contoh: 2-4 menit"
            tooltip="Menjadi acuan panjang naskah dan estimasi durasi shot di Storyboard."
          />

          <SelectField
            label="Jenis Suara (Voiceover)"
            value={form.voiceType}
            options={PROFILE_OPTIONS.voiceTypes}
            onChange={(voiceType) => setForm((p) => ({ ...p, voiceType }))}
            customValue={form.customVoiceType}
            onCustomChange={(v) => setForm((p) => ({ ...p, customVoiceType: v }))}
            customPlaceholder="Contoh: Voiceover manusia bergaya dokumenter"
            tooltip="Jika memakai Narasi AI (TTS), Pengarah Visual dan Kepatuhan menjaga jeda natural dan keterbacaan pelafalan."
          />
        </div>

        <div className="mt-5 space-y-4 border-t border-slate-800/80 pt-4">
          <ChipGroup
            label="Platform Aktif Channel (Pilih minimal 1)"
            options={PROFILE_OPTIONS.platforms}
            selected={form.platforms}
            onChange={(next) =>
              setForm((p) => ({ ...p, platforms: next as Platform[] }))
            }
            tooltip="Daftar platform yang dikelola channel ini. Saat membuat video di Studio, Anda tetap memilih tepat 1 platform tujuan."
          />

          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <label
                htmlFor="custom-platform-note"
                className="text-xs font-medium text-slate-200"
              >
                Catatan Platform Tambahan (Opsional)
              </label>
              <Tooltip
                text="Catat aturan khusus channel Anda, misalnya rasio 9:16 aman teks atau fokus fitur komunitas tertentu."
                label="Panduan Catatan Platform"
              />
            </div>
            <input
              id="custom-platform-note"
              type="text"
              value={form.customPlatformNote ?? ''}
              onChange={(e) =>
                setForm((p) => ({ ...p, customPlatformNote: e.target.value }))
              }
              placeholder="Contoh: Utamakan rasio 9:16 bebas teks di area bawah untuk tombol TikTok"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            />
          </div>
        </div>
      </Card>

      {/* Target Audiens */}
      <Card
        title="Profil Target Audiens"
        description="Membantu Penulis Naskah memilih kedalaman istilah, contoh relevan, dan sudut hook yang tepat."
        tooltip="Audiens pemula mendapat penjelasan analogi sederhana, sedangkan tingkat ahli mendapat istilah teknis lebih presisi."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField
            label="Rentang Usia Dominan"
            value={form.audience.ageRange}
            options={PROFILE_OPTIONS.ageRanges}
            onChange={(ageRange) =>
              setForm((p) => ({ ...p, audience: { ...p.audience, ageRange } }))
            }
            customValue={form.audience.customAgeRange}
            onCustomChange={(v) =>
              setForm((p) => ({ ...p, audience: { ...p.audience, customAgeRange: v } }))
            }
            tooltip="Kelompok usia mayoritas penonton sasaran."
          />

          <SelectField
            label="Tingkat Pemahaman Audiens"
            value={form.audience.level}
            options={PROFILE_OPTIONS.levels}
            onChange={(level) =>
              setForm((p) => ({ ...p, audience: { ...p.audience, level } }))
            }
            customValue={form.audience.customLevel}
            onCustomChange={(v) =>
              setForm((p) => ({ ...p, audience: { ...p.audience, customLevel: v } }))
            }
            tooltip="Mengatur seberapa teknis atau dasar isi penjelasan video."
          />
        </div>

        <div className="mt-4">
          <ChipGroup
            label="Minat Utama Audiens (Pilih minimal 1)"
            options={PROFILE_OPTIONS.interests}
            selected={form.audience.interests}
            onChange={(interests) =>
              setForm((p) => ({ ...p, audience: { ...p.audience, interests } }))
            }
            customValue={form.audience.customInterests}
            onCustomChange={(v) =>
              setForm((p) => ({ ...p, audience: { ...p.audience, customInterests: v } }))
            }
            customPlaceholder="Contoh: Desain produk, sejarah maritim"
            tooltip="Topik lintas minat yang sering menarik perhatian target penonton Anda."
          />
        </div>
      </Card>

      {/* Gaya Visual Bawaan */}
      <Card
        title="Gaya Visual Bawaan Channel"
        description="Pilih memakai template visual cepat atau Profil Gaya hasil ekstraksi dari halaman Referensi Gaya."
        tooltip="Pengaturan ini menjadi gaya visual bawaan setiap kali Anda memulai produksi di Studio Video."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                setForm((p) => ({
                  ...p,
                  visualStyle: { ...p.visualStyle, mode: 'template' },
                }))
              }
              className={`rounded-lg border px-4 py-2 text-xs font-medium transition-colors ${
                form.visualStyle.mode === 'template'
                  ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                  : 'border-slate-700 bg-slate-950 text-slate-300 hover:text-white'
              }`}
            >
              Gunakan Template Gaya Bawaan
            </button>
            <button
              type="button"
              onClick={() =>
                setForm((p) => ({
                  ...p,
                  visualStyle: { ...p.visualStyle, mode: 'reference' },
                }))
              }
              className={`rounded-lg border px-4 py-2 text-xs font-medium transition-colors ${
                form.visualStyle.mode === 'reference'
                  ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                  : 'border-slate-700 bg-slate-950 text-slate-300 hover:text-white'
              }`}
            >
              Gunakan Profil Referensi Gaya
            </button>
          </div>

          {form.visualStyle.mode === 'template' ? (
            <SelectField
              label="Template Gaya Visual"
              value={form.visualStyle.template ?? PROFILE_OPTIONS.visualTemplates[0]}
              options={PROFILE_OPTIONS.visualTemplates}
              onChange={(template) =>
                setForm((p) => ({
                  ...p,
                  visualStyle: { ...p.visualStyle, template },
                }))
              }
              customValue={form.visualStyle.customTemplate}
              onCustomChange={(v) =>
                setForm((p) => ({
                  ...p,
                  visualStyle: { ...p.visualStyle, customTemplate: v },
                }))
              }
              customPlaceholder="Contoh: Kolase arsip foto klasik + tipografi editorial"
              tooltip="Template dasar penyajian gambar dan grafis tanpa wajah."
            />
          ) : (
            <div className="space-y-2">
              {state.styleProfiles.length === 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3.5 text-xs text-slate-300">
                  <span>
                    Belum ada Profil Gaya tersimpan. Buat terlebih dahulu di halaman Referensi Gaya.
                  </span>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'style' })}
                    className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-500/20"
                  >
                    <Palette className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Buka Referensi Gaya</span>
                  </button>
                </div>
              ) : (
                <SelectField
                  label="Pilih Profil Gaya Bawaan"
                  value={form.visualStyle.defaultStyleProfileId ?? state.styleProfiles[0].id}
                  options={state.styleProfiles.map((sp) => ({
                    value: sp.id,
                    label: sp.name,
                  }))}
                  onChange={(defaultStyleProfileId) =>
                    setForm((p) => ({
                      ...p,
                      visualStyle: { ...p.visualStyle, defaultStyleProfileId },
                    }))
                  }
                  tooltip="Profil gaya ini akan otomatis aktif saat membuka Studio Video."
                />
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Feedback & Tombol Simpan */}
      {errorNotice && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-950/60 px-4 py-3 text-xs text-rose-200"
        >
          {errorNotice}
        </div>
      )}

      {savedNotice && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-950/50 px-4 py-3 text-xs text-emerald-100"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
            <span>{savedNotice}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'ideas' })}
              className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 font-medium text-emerald-200 hover:bg-emerald-500/20"
            >
              Lanjut ke Ide & Kalender
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'studio' })}
              className="rounded-md bg-emerald-400 px-3 py-1 font-semibold text-slate-950 hover:bg-emerald-300"
            >
              Buka Studio Video
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Tooltip
          text="Menyimpan konfigurasi channel ke penyimpanan lokal browser dan menandai profil aktif siap digunakan seluruh agent."
          label="Panduan Simpan Setup Channel"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 transition-colors"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          <span>Simpan Setup Channel</span>
        </button>
      </div>
    </form>
  );
};
