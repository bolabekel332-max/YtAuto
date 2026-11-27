import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import type { AgentId } from '../../../shared/schemas';
import { label } from '../../config/labels';
import {
  AUTO_CONFIG_TIERS,
  type AgentAutoRecommendation,
  type AutoConfigPlan,
  type ModelCostClass,
} from '../../config/modelAutoConfig';
import { AccessibleDialog } from './AccessibleDialog';

export interface AutoConfigModalProps {
  plan: AutoConfigPlan | null;
  onClose: () => void;
  onApply: (selectedAgentIds: AgentId[]) => void;
}

function formatCostLabel(item: AgentAutoRecommendation): string {
  const map: Record<ModelCostClass, string> = {
    free: 'Gratis',
    paid:
      item.promptPricePerMillion !== undefined
        ? `Berbayar ($${item.promptPricePerMillion}/1M)`
        : 'Berbayar',
    included: 'Server aktif',
    mock: 'Simulasi',
  };
  return map[item.costClass];
}

function formatContext(ctx?: number, verified?: boolean): string {
  if (!verified || !ctx || ctx <= 0) return 'konteks tidak diverifikasi';
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, '')}M ctx`;
  return `${Math.round(ctx / 1000)}K ctx`;
}

export const AutoConfigModal: React.FC<AutoConfigModalProps> = ({
  plan,
  onClose,
  onApply,
}) => {
  const [selectedMap, setSelectedMap] = useState<Partial<Record<AgentId, boolean>>>({});

  useEffect(() => {
    if (!plan) {
      setSelectedMap({});
      return;
    }
    const next: Partial<Record<AgentId, boolean>> = {};
    for (const item of plan.items) {
      next[item.agentId] = item.changed;
    }
    setSelectedMap(next);
  }, [plan]);

  const selectedIds = useMemo(() => {
    if (!plan) return [];
    return plan.items
      .filter((item) => Boolean(selectedMap[item.agentId]))
      .map((item) => item.agentId);
  }, [plan, selectedMap]);

  if (!plan) {
    return (
      <AccessibleDialog open={false} ariaLabel="Pratinjau Auto-Konfigurasi Model" onClose={onClose}>
        {null}
      </AccessibleDialog>
    );
  }

  const tierInfo = AUTO_CONFIG_TIERS.find((t) => t.id === plan.tier);
  const changedCount = plan.items.filter((i) => i.changed).length;

  const selectAll = () => {
    const next: Partial<Record<AgentId, boolean>> = {};
    for (const item of plan.items) {
      next[item.agentId] = true;
    }
    setSelectedMap(next);
  };

  const selectOnlyChanged = () => {
    const next: Partial<Record<AgentId, boolean>> = {};
    for (const item of plan.items) {
      next[item.agentId] = item.changed;
    }
    setSelectedMap(next);
  };

  return (
    <AccessibleDialog
      open={Boolean(plan)}
      ariaLabel={`Pratinjau Auto-Konfigurasi Mode ${tierInfo?.title ?? plan.tier}`}
      onClose={onClose}
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header Modal */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-slate-100">
              Pratinjau Auto-Konfigurasi · {tierInfo?.title ?? plan.tier}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">{plan.summary}</p>
            <p className="mt-1 text-[11px] text-slate-400">
              Provider aktif:{' '}
              <span className="text-slate-200">
                {plan.activeProviders.map((pid) => label(pid)).join(' · ')}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pratinjau"
            className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Peringatan, Disclaimer & Toolbar Pilihan */}
        <div className="space-y-3 border-b border-slate-800/80 px-4 py-3 sm:px-5">
          <p className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-300">
            Peringkat kemampuan diperkirakan dari nama model dan harga katalog; bukan hasil benchmark.
          </p>
          {plan.warnings.length > 0 && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-950/50 px-3 py-2 text-xs text-amber-100"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
              <ul className="space-y-1 list-disc list-inside">
                {plan.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-300 tabular-nums">
              Dipilih: <strong className="text-slate-100">{selectedIds.length}</strong> /{' '}
              {plan.items.length} agent ({changedCount} berubah dari setelan saat ini)
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-800"
              >
                Pilih Semua
              </button>
              <button
                type="button"
                onClick={selectOnlyChanged}
                className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-800"
              >
                Hanya yang Berubah ({changedCount})
              </button>
            </div>
          </div>
        </div>

        {/* Daftar Perbandingan 8 Agent (Scrollable) */}
        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          {/* Tampilan Desktop (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="py-2 pr-3 font-medium">Pilih</th>
                  <th className="py-2 pr-3 font-medium">Agent</th>
                  <th className="py-2 pr-3 font-medium">Saat Ini</th>
                  <th className="py-2 pr-3 font-medium">Rekomendasi Baru</th>
                  <th className="py-2 font-medium">Alasan &amp; Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {plan.items.map((item) => {
                  const checked = Boolean(selectedMap[item.agentId]);
                  const ctxLabel = formatContext(item.contextLength, item.contextVerified);
                  return (
                    <tr
                      key={item.agentId}
                      className={checked ? 'bg-slate-950/40' : 'opacity-70'}
                    >
                      <td className="py-3 pr-3 align-top">
                        <input
                          type="checkbox"
                          aria-label={`Terapkan rekomendasi untuk ${label(item.agentId)}`}
                          checked={checked}
                          onChange={(e) =>
                            setSelectedMap((prev) => ({
                              ...prev,
                              [item.agentId]: e.target.checked,
                            }))
                          }
                          className="mt-0.5 h-4 w-4 accent-sky-400"
                        />
                      </td>
                      <td className="py-3 pr-3 align-top">
                        <div className="font-semibold text-slate-100">{label(item.agentId)}</div>
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          {item.changed ? 'Berubah' : 'Tetap sama'}
                        </div>
                      </td>
                      <td className="py-3 pr-3 align-top min-w-[165px]">
                        <div className="text-slate-300">{label(item.previousConfig.providerId)}</div>
                        <div className="mt-0.5 [overflow-wrap:anywhere] font-mono text-[11px] text-slate-400">
                          {item.previousConfig.model}
                        </div>
                      </td>
                      <td className="py-3 pr-3 align-top min-w-[200px] max-w-[250px]">
                        <div className="font-medium text-sky-200">
                          {label(item.nextConfig.providerId)}
                        </div>
                        <div className="mt-0.5 [overflow-wrap:anywhere] font-mono text-[11px] text-slate-100">
                          {item.nextConfig.model}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
                          {formatCostLabel(item)} · {ctxLabel}
                          {item.nextConfig.fallbackModels.length > 0
                            ? ` · ${item.nextConfig.fallbackModels.length} cadangan`
                            : ''}
                        </div>
                      </td>
                      <td className="py-3 align-top">
                        <p className="text-slate-200 leading-relaxed">{item.reason}</p>
                        {item.capabilityNote && (
                          <p className="mt-1 text-[11px] text-amber-200 leading-relaxed">
                            Catatan: {item.capabilityNote}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Tampilan Mobile (< md) */}
          <div className="space-y-3 md:hidden">
            {plan.items.map((item) => {
              const checked = Boolean(selectedMap[item.agentId]);
              const ctxLabel = formatContext(item.contextLength, item.contextVerified);
              return (
                <div
                  key={item.agentId}
                  className={`rounded-lg border p-3 space-y-2 text-xs ${
                    checked
                      ? 'border-slate-700 bg-slate-950/70'
                      : 'border-slate-800/80 bg-slate-950/30 opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <label className="flex items-center gap-2 font-semibold text-slate-100">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setSelectedMap((prev) => ({
                            ...prev,
                            [item.agentId]: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 accent-sky-400"
                      />
                      <span>{label(item.agentId)}</span>
                    </label>
                    <span className="text-[11px] text-slate-400">
                      {item.changed ? 'Berubah' : 'Tetap'}
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px]">
                    <div className="text-slate-400">
                      Lama: <span className="text-slate-300">{label(item.previousConfig.providerId)}</span> ·{' '}
                      <span className="[overflow-wrap:anywhere] font-mono">{item.previousConfig.model}</span>
                    </div>
                    <div className="text-slate-300">
                      Baru: <span className="font-medium text-sky-200">{label(item.nextConfig.providerId)}</span> ·{' '}
                      <span className="[overflow-wrap:anywhere] font-mono text-slate-100">
                        {item.nextConfig.model}
                      </span>
                    </div>
                    <div className="text-slate-400 tabular-nums">
                      {formatCostLabel(item)} · {ctxLabel}
                      {item.nextConfig.fallbackModels.length > 0
                        ? ` · ${item.nextConfig.fallbackModels.length} cadangan`
                        : ''}
                    </div>
                  </div>

                  <p className="text-[11px] leading-relaxed text-slate-200">{item.reason}</p>
                  {item.capabilityNote && (
                    <p className="text-[11px] leading-relaxed text-amber-200">
                      Catatan: {item.capabilityNote}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Modal */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={() => onApply(selectedIds)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Terapkan Konfigurasi ({selectedIds.length})</span>
          </button>
        </div>
      </div>
    </AccessibleDialog>
  );
};
