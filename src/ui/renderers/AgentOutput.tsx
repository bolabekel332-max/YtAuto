import React from 'react';
import { AlertTriangle, Bot, Clock, Cpu, ExternalLink, FlaskConical, Globe } from 'lucide-react';
import type {
  AnalystOutput,
  AuditOutput,
  ComplianceOutput,
  OrchestratorOutput,
  PackagingOutput,
  ResearcherOutput,
  ScriptwriterOutput,
  StyleAnalystOutput,
  VisualOutput,
} from '../../../shared/agentSchemas';
import type { AgentResult, ComplianceVerdict } from '../../../shared/schemas';
import { label } from '../../config/labels';
import { safeExternalUrl } from '../../utils/safeUrl';
import { JsonViewer } from '../components/JsonViewer';
import { Tooltip } from '../components/Tooltip';
import { AnalystView } from './AnalystView';
import { AuditView } from './AuditView';
import { ComplianceView } from './ComplianceView';
import { PackagingView } from './PackagingView';
import { ResearchView } from './ResearchView';
import { ScriptView } from './ScriptView';
import { StyleProfileView } from './StyleProfileView';
import { SummaryView } from './SummaryView';
import { VisualView } from './VisualView';

class OutputRenderBoundary extends React.Component<
  { fallbackData: unknown; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallbackData: unknown; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error('Gagal merender tampilan terstruktur output agent:', error);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-4 text-xs text-amber-100 space-y-2"
        >
          <p className="font-semibold">
            Format output agent tidak lengkap atau berasal dari versi lama sehingga tidak bisa dirender penuh.
          </p>
          <p className="text-amber-200/80">
            Silakan periksa data mentah di bagian JSON di bawah atau jalankan ulang langkah ini.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export interface AgentOutputProps {
  result: AgentResult;
  mode?: 'default' | 'audit';
  selectedHookIndex?: number;
  onSelectHook?: (index: number) => void;
  selectedTitleIndex?: number;
  onSelectTitle?: (index: number) => void;
  onSelectIdeaForVideo?: (ideaTitle: string) => void;
  complianceSkipped?: boolean;
  latestVerdict?: ComplianceVerdict;
  runStatus?: string;
}

export const AgentOutput: React.FC<AgentOutputProps> = ({
  result,
  mode = 'default',
  selectedHookIndex,
  onSelectHook,
  selectedTitleIndex,
  onSelectTitle,
  onSelectIdeaForVideo,
  complianceSkipped,
  latestVerdict,
  runStatus,
}) => {
  const isMock = Boolean(result.isMock);
  const serverSources = result.sources ?? [];
  const searchUsed = Boolean(result.searchUsed);
  const groundedCount = result.groundedSourceCount ?? serverSources.length;

  const renderBody = () => {
    const out = result.output;
    if (!out || typeof out !== 'object' || Array.isArray(out)) {
      return (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-4 text-xs text-amber-100"
        >
          Output agent bukan objek terstruktur yang valid. Lihat JSON mentah di bawah.
        </div>
      );
    }

    switch (result.agentId) {
      case 'researcher':
        return (
          <ResearchView
            data={out as ResearcherOutput}
            onSelectIdeaForVideo={onSelectIdeaForVideo}
          />
        );
      case 'scriptwriter':
        return (
          <ScriptView
            data={out as ScriptwriterOutput}
            selectedHookIndex={selectedHookIndex}
            onSelectHook={onSelectHook}
          />
        );
      case 'visual':
        return <VisualView data={out as VisualOutput} />;
      case 'packaging':
        return (
          <PackagingView
            data={out as PackagingOutput}
            selectedTitleIndex={selectedTitleIndex}
            onSelectTitle={onSelectTitle}
          />
        );
      case 'compliance':
        if (mode === 'audit') {
          return <AuditView data={out as AuditOutput} />;
        }
        return <ComplianceView data={out as ComplianceOutput} />;
      case 'analyst':
        return <AnalystView data={out as AnalystOutput} />;
      case 'style_analyst': {
        const styleOut = out as StyleAnalystOutput;
        return (
          <div className="space-y-3">
            <p className="text-xs text-slate-300">
              Nama Usulan Profil Gaya:{' '}
              <span className="font-semibold text-slate-100">{styleOut.suggestedName}</span>
            </p>
            <StyleProfileView attributes={styleOut.attributes} />
          </div>
        );
      }
      case 'orchestrator':
        return (
          <SummaryView
            data={out as OrchestratorOutput}
            complianceSkipped={complianceSkipped}
            latestVerdict={latestVerdict}
            runStatus={runStatus}
          />
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Metadata Output */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/90 px-4 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-100">
            <Bot className="h-4 w-4 text-sky-400" aria-hidden="true" />
            <span>{label(result.agentId)}</span>
          </span>

          {isMock ? (
            <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-200">
              <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
              <span>SIMULASI MOCK</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-medium text-sky-200">
              <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {result.providerId ? label(result.providerId) : 'Provider AI'} ·{' '}
                <span className="font-mono">{result.model}</span>
              </span>
            </span>
          )}

          {result.fallbackUsed && (
            <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-950/60 px-2 py-0.5 font-medium text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                Fallback dipakai
                {result.requestedModel ? ` (diminta: ${result.requestedModel})` : ''}
              </span>
            </span>
          )}

          {searchUsed && (
            <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-950/40 px-2 py-0.5 font-medium text-emerald-200">
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Pencarian web ({groundedCount} sumber)</span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-slate-400 font-mono tabular-nums">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{Math.round(result.latencyMs)} ms</span>
          </span>
          {typeof result.tokens === 'number' && result.tokens > 0 && (
            <span>{result.tokens} token</span>
          )}
          <Tooltip
            text="Menampilkan status sumber jawaban (Simulasi Mock vs Model AI nyata), apakah model fallback atau pencarian web terpakai, waktu proses, dan penggunaan token."
            label="Panduan Metadata Output"
          />
        </div>
      </div>

      {searchUsed && groundedCount === 0 && (
        <div
          role="status"
          className="rounded-xl border border-amber-500/30 bg-amber-950/35 px-4 py-2.5 text-xs text-amber-100"
        >
          Pencarian web diaktifkan, tetapi provider tidak mengembalikan sumber grounding eksternal untuk permintaan ini. Verifikasi klaim faktual secara manual sebelum produksi.
        </div>
      )}

      {/* Output Terstruktur */}
      <OutputRenderBoundary
        key={`${result.agentId}:${result.model}:${result.latencyMs}:${result.tokens ?? 0}`}
        fallbackData={result.output}
      >
        {renderBody()}
      </OutputRenderBoundary>

      {/* Sumber Grounding Resmi dari Server */}
      {serverSources.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Sumber Grounding Pencarian Server ({serverSources.length})
            </h4>
            <Tooltip
              text="Daftar tautan ini diekstrak langsung oleh server dari metadata grounding provider (tidak dikarang oleh prompt). Google Search Grounding dapat menyertakan URL pengalihan (redirect) milik provider."
              label="Panduan Sumber Grounding Server"
            />
          </div>
          <ul className="space-y-1.5 text-xs">
            {serverSources.map((src, idx) => {
              const safeHref = safeExternalUrl(src.url);
              return (
                <li key={`${src.url}-${idx}`} className="flex items-start gap-2">
                  <ExternalLink
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400"
                    aria-hidden="true"
                  />
                  {safeHref ? (
                    <a
                      href={safeHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-300 hover:text-sky-200 underline break-all"
                    >
                      {src.title || src.url}
                    </a>
                  ) : (
                    <span className="text-slate-300 break-all">{src.title || src.url}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* JSON Mentah Terlipat */}
      <JsonViewer data={result.output} />
    </div>
  );
};
