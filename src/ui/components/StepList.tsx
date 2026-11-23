import React from 'react';
import { Play, RotateCcw, SkipForward } from 'lucide-react';
import { PIPELINE_STEP_IDS } from '../../../shared/constants';
import type { PipelineRun, PipelineStepId } from '../../../shared/schemas';
import { label } from '../../config/labels';
import { StatusBadge } from './StatusBadge';
import { Tooltip } from './Tooltip';

export interface StepListProps {
  run: PipelineRun;
  isBusy: boolean;
  onRetryStep: (stepId: PipelineStepId) => void;
  onSkipStep: (stepId: PipelineStepId) => void;
  onResumeRun: () => void;
  selectedStep: PipelineStepId;
  onSelectStep: (stepId: PipelineStepId) => void;
}

const STEP_TOOLTIPS: Record<PipelineStepId, string> = {
  researcher: 'Menggali celah topik, pilar konten, dan tren aktual sebelum penulisan naskah.',
  scriptwriter: 'Menyusun 3 hook pembuka, struktur retensi naskah bertahap, dan CTA.',
  visual: 'Membuat shot list storyboard faceless, arahan suara, dan panduan editing.',
  packaging: 'Menghasilkan 5 judul, konsep thumbnail, caption, kata kunci, dan hashtag.',
  compliance:
    'Pemeriksaan heuristik untuk konten tidak autentik, label AI, hak cipta, topik sensitif, dan kemiripan gaya.',
  orchestrator:
    'Kontrol kualitas akhir lintas agent; tidak menentukan urutan pipeline.',
};

export const StepList: React.FC<StepListProps> = ({
  run,
  isBusy,
  onRetryStep,
  onSkipStep,
  onResumeRun,
  selectedStep,
  onSelectStep,
}) => {
  return (
    <div className="space-y-2.5">
      {run.status === 'interrupted' && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-950/50 px-3 py-2.5 text-xs text-amber-100">
          <span>
            Run sebelumnya terputus. Langkah yang sudah selesai tetap tersimpan.
          </span>
          <button
            type="button"
            disabled={isBusy}
            onClick={onResumeRun}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-60"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Lanjutkan</span>
          </button>
        </div>
      )}

      <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950/70">
        {PIPELINE_STEP_IDS.map((stepId, idx) => {
          const step = run.steps[stepId];
          const isSelected = selectedStep === stepId;

          return (
            <div
              key={stepId}
              className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors ${
                isSelected ? 'bg-slate-900/90' : 'hover:bg-slate-900/40'
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-5 text-xs font-mono text-slate-500 tabular-nums">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectStep(stepId)}
                  className="text-left text-sm font-medium text-slate-100 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded px-1"
                >
                  {label(stepId)}
                </button>
                <Tooltip text={STEP_TOOLTIPS[stepId]} label={`Panduan ${label(stepId)}`} />
                {step.result?.isMock && (
                  <span className="text-[11px] font-medium text-amber-300">
                    · Simulasi Mock
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {step.result && (
                  <span className="text-xs text-slate-400 font-mono tabular-nums">
                    {Math.round(step.result.latencyMs)} ms
                  </span>
                )}
                <StatusBadge value={step.status} kind="step" />

                {step.status === 'failed' && !isBusy && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onRetryStep(stepId)}
                      className="inline-flex items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-200 hover:bg-sky-500/20"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      <span>Ulangi</span>
                    </button>
                    {stepId !== 'scriptwriter' && (
                      <button
                        type="button"
                        onClick={() => onSkipStep(stepId)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700"
                      >
                        <SkipForward className="h-3 w-3" aria-hidden="true" />
                        <span>Lewati</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {step.error && (
                <p className="w-full pl-8 text-xs text-rose-300">{step.error}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
