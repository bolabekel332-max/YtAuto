import React, { useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Clapperboard,
  Cpu,
  Lightbulb,
  Menu,
  Palette,
  Settings2,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { ScreenId } from '../../state/store';
import { useStore } from '../../state/store';
import { Banner } from './Banner';
import { Header } from './Header';
import { Tooltip } from './Tooltip';

export interface NavItem {
  id: ScreenId;
  label: string;
  subtitle: string;
  tooltip: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'setup',
    label: 'Setup Channel',
    subtitle: 'Identitas channel, audiens, niche sensitif, dan gaya bawaan',
    tooltip: 'Atur identitas channel, target audiens, bahasa, dan peringatan niche sensitif.',
    icon: Settings2,
  },
  {
    id: 'style',
    label: 'Referensi Gaya',
    subtitle: 'Ekstraksi ciri abstrak gaya visual dari video, gambar, atau link',
    tooltip: 'Analisis gaya visual kreator sebagai inspirasi abstrak lalu gabungkan secara berbobot.',
    icon: Palette,
  },
  {
    id: 'ideas',
    label: 'Ide & Kalender',
    subtitle: 'Riset celah niche, pilar konten, ide berperingkat, dan jadwal',
    tooltip: 'Jalankan Periset secara mandiri untuk menghasilkan daftar ide dan kalender konten.',
    icon: Lightbulb,
  },
  {
    id: 'studio',
    label: 'Studio Video',
    subtitle: 'Pipeline deterministik 1 video lengkap beserta riwayat run',
    tooltip: 'Buat paket video lengkap dari naskah, visual, packaging, pemeriksaan kepatuhan, hingga QC akhir.',
    icon: Clapperboard,
  },
  {
    id: 'audit',
    label: 'Audit Konten',
    subtitle: 'Evaluasi variasi dan risiko konten berulang lintas 10 video',
    tooltip: 'Nilai tingkat variasi dan potensi risiko konten tidak autentik dari 10 video terakhir.',
    icon: ShieldCheck,
  },
  {
    id: 'analytics',
    label: 'Analitik',
    subtitle: 'Diagnosis pola performa dari data metrik atau CSV yang ditempel',
    tooltip: 'Tempel data metrik unggahan Anda untuk mendapatkan diagnosis dan rencana eksperimen.',
    icon: BarChart3,
  },
  {
    id: 'knowledge',
    label: 'Pengetahuan',
    subtitle: 'Basis aturan sinyal platform, kebijakan, dan tanggal verifikasi',
    tooltip: 'Kelola dan verifikasi 8 blok pengetahuan yang disuntikkan ke prompt agent.',
    icon: BookOpen,
  },
  {
    id: 'models',
    label: 'Pengaturan Model',
    subtitle: 'Konfigurasi provider, model, fallback, dan tes koneksi per agent',
    tooltip: 'Pilih Gemini, Mock, atau provider lain per agent serta uji konektivitas secara terpisah.',
    icon: Cpu,
  },
];

export interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const { state, dispatch } = useStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const activeNav = NAV_ITEMS.find((n) => n.id === state.currentScreen) ?? NAV_ITEMS[0];

  const handleNavigate = (screen: ScreenId) => {
    dispatch({ type: 'SET_SCREEN', screen });
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col lg:flex-row">
      {/* Mobile Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3 lg:hidden">
        <span className="font-display text-base font-bold tracking-tight text-slate-100">
          Faceless Studio
        </span>
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label={mobileMenuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
          className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-200"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Sidebar Navigasi */}
      <aside
        aria-label="Navigasi utama"
        className={`${
          mobileMenuOpen ? 'block' : 'hidden'
        } lg:block w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950/95 p-4`}
      >
        <div className="hidden lg:block px-2 pb-5 pt-1">
          <span className="font-display text-lg font-bold tracking-tight text-slate-100">
            Faceless Studio
          </span>
          <p className="mt-1 text-xs text-slate-400">
            Perancang Paket Konten
          </p>
        </div>

        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = state.currentScreen === item.id;
            return (
              <div key={item.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex flex-1 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                    active
                      ? 'bg-sky-500/15 text-sky-200 border border-sky-500/30'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-white border border-transparent'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </button>
                <Tooltip text={item.tooltip} label={`Info ${item.label}`} position="right" />
              </div>
            );
          })}
        </nav>

        <div className="mt-6 rounded-lg border border-slate-800/80 bg-slate-900/60 p-3 text-xs text-slate-400 space-y-1">
          <p className="font-medium text-slate-200">Status Penyimpanan</p>
          <p className="tabular-nums">
            Riwayat tersimpan: {state.history.length}/30
          </p>
          <p className="tabular-nums">
            Perubahan belum diekspor: {state.changesSinceExport}
          </p>
          {state.lastExportedAt && (
            <p className="text-[11px] text-slate-500">
              Ekspor terakhir: {state.lastExportedAt.slice(0, 10)}
            </p>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title={activeNav.label} subtitle={activeNav.subtitle} />

        <main className="flex-1 p-4 sm:p-6 space-y-4 max-w-[1280px] w-full mx-auto">
          {state.session.authChecked && !state.session.gateEnabled && (
            <Banner
              tone="danger"
              title="Peringatan Keamanan: Gerbang Akses Tidak Aktif (APP_ACCESS_CODE Kosong)"
              message="Aplikasi saat ini dapat diakses tanpa kode akses. Jika aplikasi dibagikan atau di-deploy, siapa pun dapat memanggil model memakai kunci API pemilik. Atur APP_ACCESS_CODE minimal 16 karakter di panel Secrets server."
            />
          )}

          {!state.profileConfigured && state.currentScreen !== 'setup' && (
            <Banner
              tone="info"
              title="Profil Channel Belum Disimpan"
              message="Aplikasi sedang memakai konfigurasi awal standar. Simpan Profil Channel Anda di Setup Channel agar setiap agent menyesuaikan niche, bahasa, dan audiens secara tepat."
              action={
                <button
                  type="button"
                  onClick={() => handleNavigate('setup')}
                  className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400"
                >
                  Buka Setup Channel
                </button>
              }
            />
          )}

          {state.storageWarning && (
            <Banner
              tone="warning"
              title="Peringatan Penyimpanan Browser"
              message={state.storageWarning}
              onDismiss={() => dispatch({ type: 'SET_STORAGE_WARNING', warning: undefined })}
            />
          )}

          {state.changesSinceExport >= 3 && (
            <Banner
              tone="info"
              title="Pengingat Cadangan Data"
              message={`Terdapat ${state.changesSinceExport} perubahan sejak ekspor terakhir. Unduh cadangan JSON secara berkala melalui tombol Ekspor di kanan atas.`}
            />
          )}

          {children}
        </main>
      </div>
    </div>
  );
};
