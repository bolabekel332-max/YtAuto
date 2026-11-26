import React from 'react';
import { CheckCircle2, Settings2 } from 'lucide-react';
import type { ChannelProfile, Platform, StyleProfile } from '../../../shared/schemas';
import { label } from '../../config/labels';
import { useStore } from '../../state/store';

export function resolveProfileFieldLabel(value: string, custom?: string): string {
  if (value === 'Lainnya' && custom && custom.trim().length > 0) {
    return custom.trim();
  }
  return value;
}

export function resolveVisualStyleSummaryLabel(
  profile: ChannelProfile,
  styleProfiles: StyleProfile[]
): string {
  const defaultId = profile.visualStyle.defaultStyleProfileId;
  const linked = defaultId ? styleProfiles.find((sp) => sp.id === defaultId) : undefined;

  if (profile.visualStyle.mode === 'reference') {
    return linked ? `Profil Gaya: ${linked.name}` : 'Profil Referensi Gaya';
  }

  const tpl = resolveProfileFieldLabel(
    profile.visualStyle.template ?? 'Footage stok + teks',
    profile.visualStyle.customTemplate
  );
  if (profile.visualStyle.template === 'Berdasarkan referensi kreator') {
    const parts: string[] = [];
    if (profile.visualStyle.customTemplate?.trim()) {
      parts.push(profile.visualStyle.customTemplate.trim());
    }
    if (linked) {
      parts.push(`Profil: ${linked.name}`);
    }
    return parts.length > 0
      ? `Referensi Kreator (${parts.join(' · ')})`
      : 'Berdasarkan referensi kreator';
  }
  return `Template: ${tpl}`;
}

export interface ActiveChannelSummaryProps {
  currentPlatformOverride?: Platform;
}

export const ActiveChannelSummary: React.FC<ActiveChannelSummaryProps> = ({
  currentPlatformOverride,
}) => {
  const { state, dispatch } = useStore();
  const { profile, profileConfigured, styleProfiles } = state;

  const nicheText = resolveProfileFieldLabel(profile.niche, profile.customNiche);
  const languageText = resolveProfileFieldLabel(profile.language, profile.customLanguage);
  const toneText = resolveProfileFieldLabel(profile.tone, profile.customTone);
  const durationText = resolveProfileFieldLabel(
    profile.targetDuration,
    profile.customTargetDuration
  );
  const voiceText = resolveProfileFieldLabel(profile.voiceType, profile.customVoiceType);
  const visualText = resolveVisualStyleSummaryLabel(profile, styleProfiles);
  const isOverridden =
    Boolean(currentPlatformOverride) && currentPlatformOverride !== profile.platform;

  return (
    <section
      aria-label="Konteks Channel Aktif"
      className="rounded-xl border border-slate-800 bg-slate-950/75 px-4 py-3 text-xs text-slate-300 space-y-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium text-slate-100">
          <CheckCircle2
            className={`h-4 w-4 shrink-0 ${
              profileConfigured ? 'text-emerald-400' : 'text-sky-400'
            }`}
            aria-hidden="true"
          />
          <span>
            {profileConfigured
              ? 'Konteks Channel Aktif dari Setup Channel'
              : 'Konteks Channel Standar (Belum Disimpan di Setup Channel)'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'setup' })}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <Settings2 className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
          <span>Ubah Setup Channel</span>
        </button>
      </div>

      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3 text-[11px]">
        <div>
          <dt className="inline text-slate-400">Niche: </dt>
          <dd className="inline font-medium text-slate-100">{nicheText}</dd>
        </div>
        <div>
          <dt className="inline text-slate-400">Platform Bawaan: </dt>
          <dd className="inline font-medium text-slate-100">
            {label(profile.platform)}
            {isOverridden && currentPlatformOverride
              ? ` (Override di halaman ini: ${label(currentPlatformOverride)})`
              : ''}
          </dd>
        </div>
        <div>
          <dt className="inline text-slate-400">Bahasa &amp; Nada: </dt>
          <dd className="inline font-medium text-slate-100">
            {languageText} · {toneText}
          </dd>
        </div>
        <div>
          <dt className="inline text-slate-400">Durasi &amp; Suara: </dt>
          <dd className="inline font-medium text-slate-100">
            {durationText} · {voiceText}
          </dd>
        </div>
        <div>
          <dt className="inline text-slate-400">Gaya Visual Bawaan: </dt>
          <dd className="inline font-medium text-slate-100">{visualText}</dd>
        </div>
        <div>
          <dt className="inline text-slate-400">Audiens: </dt>
          <dd className="inline font-medium text-slate-100">
            {resolveProfileFieldLabel(profile.audience.ageRange, profile.audience.customAgeRange)}{' '}
            ·{' '}
            {resolveProfileFieldLabel(profile.audience.level, profile.audience.customLevel)}
          </dd>
        </div>
        {profile.customPlatformNote?.trim() && (
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="inline text-slate-400">Catatan Platform: </dt>
            <dd className="inline font-medium text-sky-200">
              {profile.customPlatformNote.trim()}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
};
