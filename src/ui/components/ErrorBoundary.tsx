import React from 'react';
import { STORAGE_KEY } from '../../state/persistence';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  confirmReset: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      confirmReset: false,
    };
  }

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage:
        error instanceof Error ? error.message : 'Terjadi kesalahan antarmuka tak terduga.',
    };
  }

  componentDidCatch(error: unknown): void {
    console.error('ErrorBoundary menangkap kesalahan aplikasi:', error);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleExportRaw = () => {
    let raw = '{}';
    try {
      raw = window.localStorage.getItem(STORAGE_KEY) ?? '{}';
    } catch {
      raw = '{}';
    }
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `faceless-studio-raw-recovery-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  private handleConfirmReset = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Abaikan jika browser memblokir localStorage
    }
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div
          role="alert"
          className="w-full max-w-lg rounded-2xl border border-rose-500/40 bg-slate-900 p-6 shadow-2xl space-y-4"
        >
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold text-rose-200">
              Terjadi Gangguan Saat Memuat Aplikasi
            </h1>
            <p className="text-xs leading-relaxed text-slate-300">
              Antarmuka mengalami kesalahan tak terduga. Data lokal Anda tetap berada di browser dan dapat diekspor sebelum memuat ulang atau mereset.
            </p>
            {this.state.errorMessage && (
              <p className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-[11px] text-rose-300 break-words">
                {this.state.errorMessage}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2.5 pt-1">
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-lg bg-sky-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400"
            >
              Muat ulang
            </button>
            <button
              type="button"
              onClick={this.handleExportRaw}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              Ekspor data mentah
            </button>
            {!this.state.confirmReset && (
              <button
                type="button"
                onClick={() => this.setState({ confirmReset: true })}
                className="rounded-lg border border-rose-500/40 bg-rose-950/50 px-3.5 py-2 text-xs font-medium text-rose-200 hover:bg-rose-950"
              >
                Reset data lokal
              </button>
            )}
          </div>

          {this.state.confirmReset && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/60 p-3.5 space-y-2.5 text-xs text-rose-100">
              <p>
                Tindakan ini akan menghapus seluruh Profil Channel, Profil Gaya, Pengetahuan, dan Riwayat dari browser ini. Yakin ingin melanjutkan?
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={this.handleConfirmReset}
                  className="rounded-md bg-rose-500 px-3 py-1.5 font-semibold text-white hover:bg-rose-400"
                >
                  Ya, Hapus & Muat Ulang
                </button>
                <button
                  type="button"
                  onClick={() => this.setState({ confirmReset: false })}
                  className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-200 hover:bg-slate-800"
                >
                  Batal
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
}
