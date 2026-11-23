import React, { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { getProviderStatus } from '../../api/client';

export interface AccessGateProps {
  onVerified: (accessCode: string) => void;
  initialError?: string;
}

/**
 * Layar gerbang akses (FR-21).
 * Muncul saat APP_ACCESS_CODE aktif di server dan kode belum tervalidasi, atau setelah HTTP 401.
 * Memverifikasi kode lewat panggilan terkunci pertama (GET /api/providers/status).
 * Kode hanya disimpan di memori sesi React.
 */
export const AccessGate: React.FC<AccessGateProps> = ({ onVerified, initialError }) => {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(initialError);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Masukkan kode akses terlebih dahulu.');
      return;
    }

    setSubmitting(true);
    setError(undefined);
    try {
      await getProviderStatus(trimmed);
      onVerified(trimmed);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Kode akses tidak valid atau akses dikunci sementara.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-100">
              Gerbang Akses Faceless Studio
            </h1>
            <p className="text-xs text-slate-400">
              Server dilindungi kode akses (APP_ACCESS_CODE).
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="access-code-input" className="text-xs font-medium text-slate-200">
              Kode Akses
            </label>
            <input
              id="access-code-input"
              type="password"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Masukkan kode akses server..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            />
            <p className="text-xs text-slate-400">
              Kode hanya disimpan sementara di memori sesi browser dan tidak pernah diekspor.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-rose-500/40 bg-rose-950/60 px-3 py-2 text-xs text-rose-200"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 transition-colors"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            <span>{submitting ? 'Memverifikasi...' : 'Masuk ke Studio'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
