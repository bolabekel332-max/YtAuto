import React from 'react';
import { Bot, Clock, Cpu, FlaskConical } from 'lucide-react';
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

  const renderBody = () => {
    const out = result.output;
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
            text="Menampilkan status sumber jawaban (Simulasi Mock vs Model AI nyata), nama model, waktu proses, dan penggunaan token."
            label="Panduan Metadata Output"
          />
        </div>
      </div>

      {/* Output Terstruktur */}
      {renderBody()}

      {/* JSON Mentah Terlipat */}
      <JsonViewer data={result.output} />
    </div>
  );
};
