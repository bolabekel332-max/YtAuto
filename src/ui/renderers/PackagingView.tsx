import React from 'react';
import { Hash, Image, ListVideo, MessageSquareText, Tag, Type } from 'lucide-react';
import type { PackagingOutput } from '../../../shared/agentSchemas';
import { CopyButton } from '../components/CopyButton';
import { Tooltip } from '../components/Tooltip';

export interface PackagingViewProps {
  data: PackagingOutput;
  selectedTitleIndex?: number;
  onSelectTitle?: (index: number) => void;
}

export const PackagingView: React.FC<PackagingViewProps> = ({
  data,
  selectedTitleIndex = 0,
  onSelectTitle,
}) => {
  const titles = data.titles ?? [];
  const thumbnails = data.thumbnailConcepts ?? [];
  const captions = data.captions ?? [];
  const keywords = data.keywords ?? [];
  const hashtags = data.hashtags ?? [];

  return (
    <div className="space-y-5">
      {/* 5 Pilihan Judul */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <Type className="h-4 w-4 text-sky-400" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-slate-100">
            5 Opsi Judul {onSelectTitle ? '(Pilih 1 judul final untuk disimpan)' : ''}
          </h4>
          <Tooltip
            text="Pilih judul akhir yang akan dipakai sebagai identitas video di riwayat dan bahan Audit Konten."
            label="Panduan Pilihan Judul"
          />
        </div>

        <div className="space-y-2">
          {titles.map((title, idx) => {
            const active = selectedTitleIndex === idx;
            return (
              <div
                key={`title-${idx}`}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition-colors ${
                  active
                    ? 'border-sky-500/50 bg-sky-500/10'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {onSelectTitle && (
                    <input
                      type="radio"
                      name="selected-title"
                      checked={active}
                      onChange={() => onSelectTitle(idx)}
                      aria-label={`Pilih Judul ${idx + 1}`}
                      className="h-4 w-4 accent-sky-400"
                    />
                  )}
                  <span className="font-mono text-xs text-slate-500 tabular-nums">
                    {idx + 1}.
                  </span>
                  <span className="text-sm font-medium text-slate-100">{title}</span>
                </div>
                <CopyButton text={title} label="Salin" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Konsep Thumbnail */}
      {thumbnails.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Image className="h-4 w-4 text-sky-400" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-slate-100">
              Konsep Thumbnail ({thumbnails.length})
            </h4>
            <Tooltip
              text="Panduan teks singkat thumbnail, komposisi objek utama, serta palet warna kontras agar mudah terbaca di layar kecil."
              label="Panduan Konsep Thumbnail"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {thumbnails.map((thumb, idx) => (
              <div
                key={`thumb-${idx}`}
                className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">
                    Konsep #{idx + 1}
                  </span>
                  <CopyButton
                    text={`Teks: ${thumb.mainText}\nVisual: ${thumb.visualElements}\nWarna: ${thumb.colors}`}
                    label="Salin Konsep"
                  />
                </div>
                <p className="text-sm font-bold text-slate-100">{thumb.mainText}</p>
                <p className="text-xs leading-relaxed text-slate-300">
                  <span className="font-medium text-slate-400">Elemen Visual: </span>
                  {thumb.visualElements}
                </p>
                <p className="text-xs text-slate-300">
                  <span className="font-medium text-slate-400">Warna: </span>
                  {thumb.colors}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Caption */}
      {captions.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-sky-400" aria-hidden="true" />
              <h4 className="text-sm font-semibold text-slate-100">
                Opsi Caption / Deskripsi ({captions.length})
              </h4>
              <Tooltip
                text="Teks deskripsi pendamping unggahan yang sudah memuat kata kunci relevan tanpa pengisian berlebih."
                label="Panduan Caption"
              />
            </div>
          </div>

          <div className="space-y-2">
            {captions.map((cap, idx) => (
              <div
                key={`cap-${idx}`}
                className="flex items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5"
              >
                <p className="text-xs leading-relaxed text-slate-200 whitespace-pre-line flex-1">
                  {cap}
                </p>
                <CopyButton text={cap} label="Salin" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Keywords, Hashtags, Playlist */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Tag className="h-4 w-4 text-sky-400" aria-hidden="true" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                Kata Kunci
              </h4>
            </div>
            <CopyButton text={keywords.join(', ')} label="Salin" />
          </div>
          <p className="text-xs leading-relaxed text-slate-300">
            {keywords.length > 0 ? keywords.join(' · ') : 'Tidak ada kata kunci.'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Hash className="h-4 w-4 text-sky-400" aria-hidden="true" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                Hashtag
              </h4>
            </div>
            <CopyButton text={hashtags.join(' ')} label="Salin" />
          </div>
          <p className="text-xs leading-relaxed text-sky-300">
            {hashtags.length > 0 ? hashtags.join(' ') : 'Tidak ada hashtag.'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2">
          <div className="flex items-center gap-1.5">
            <ListVideo className="h-4 w-4 text-sky-400" aria-hidden="true" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Saran Playlist
            </h4>
          </div>
          <p className="text-xs leading-relaxed text-slate-200">
            {data.playlistSuggestion || 'Belum ada saran playlist.'}
          </p>
        </div>
      </div>
    </div>
  );
};
