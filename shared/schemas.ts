import { z } from 'zod';
import {
  AGENT_IDS,
  CERTAINTY_LEVELS,
  EXPORT_SCHEMA_VERSION,
  HISTORY_MAX,
  JSON_MODES,
  KNOWLEDGE_GROUPS,
  MAX_FALLBACKS,
  MAX_TOKENS_LIMIT,
  PIPELINE_STEP_IDS,
  PLATFORMS,
  PROVIDER_IDS,
  REVISABLE_AGENT_IDS,
  SEARCH_MODES,
  TIMEOUT_LIMIT_MS,
} from './constants';

export const PlatformSchema = z.enum(PLATFORMS);
export type Platform = z.infer<typeof PlatformSchema>;

export const AgentIdSchema = z.enum(AGENT_IDS);
export type AgentId = z.infer<typeof AgentIdSchema>;

export const PipelineStepIdSchema = z.enum(PIPELINE_STEP_IDS);
export type PipelineStepId = z.infer<typeof PipelineStepIdSchema>;

export const RevisableAgentIdSchema = z.enum(REVISABLE_AGENT_IDS);
export type RevisableAgentId = z.infer<typeof RevisableAgentIdSchema>;

export const JsonModeSchema = z.enum(JSON_MODES);
export type JsonMode = z.infer<typeof JsonModeSchema>;

export const SearchModeSchema = z.enum(SEARCH_MODES);
export type SearchMode = z.infer<typeof SearchModeSchema>;

export const ProviderIdSchema = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const CertaintyLevelSchema = z.enum(CERTAINTY_LEVELS);
export type CertaintyLevel = z.infer<typeof CertaintyLevelSchema>;

export const KnowledgeGroupSchema = z.enum(KNOWLEDGE_GROUPS);
export type KnowledgeGroup = z.infer<typeof KnowledgeGroupSchema>;

export const ChannelProfileSchema = z.object({
  niche: z.string().min(1),
  customNiche: z.string().optional(),
  sensitiveNiche: z.boolean(),
  audience: z.object({
    ageRange: z.string().min(1),
    customAgeRange: z.string().optional(),
    interests: z.array(z.string().min(1)).min(1),
    customInterests: z.string().optional(),
    level: z.string().min(1),
    customLevel: z.string().optional(),
  }),
  language: z.string().min(1),
  customLanguage: z.string().optional(),
  tone: z.string().min(1),
  customTone: z.string().optional(),
  platforms: z.array(PlatformSchema).min(1),
  customPlatformNote: z.string().optional(),
  postingFrequency: z.string().min(1),
  customPostingFrequency: z.string().optional(),
  targetDuration: z.string().min(1),
  customTargetDuration: z.string().optional(),
  voiceType: z.string().min(1),
  customVoiceType: z.string().optional(),
  visualStyle: z.object({
    mode: z.enum(['template', 'reference']),
    template: z.string().optional(),
    customTemplate: z.string().optional(),
    defaultStyleProfileId: z.string().optional(),
  }),
});
export type ChannelProfile = z.infer<typeof ChannelProfileSchema>;

export const RunInputSchema = z.object({
  topic: z.string().min(1),
  targetPlatform: PlatformSchema,
  includeResearch: z.boolean(),
  styleProfileId: z.string().optional(),
});
export type RunInput = z.infer<typeof RunInputSchema>;

export const KnowledgeBlockSchema = z.object({
  id: z.string().min(1),
  group: KnowledgeGroupSchema,
  title: z.string().min(1),
  content: z.string().min(1),
  verifiedAt: z.string().min(1),
  note: z.string().optional(),
  certainty: CertaintyLevelSchema,
});
export type KnowledgeBlock = z.infer<typeof KnowledgeBlockSchema>;

export const AgentModelConfigSchema = z.object({
  agentId: AgentIdSchema,
  providerId: ProviderIdSchema,
  model: z.string().min(1),
  fallbackModels: z.array(z.string().min(1)).max(MAX_FALLBACKS),
  temperature: z.number().min(0).max(2).nullable(),
  maxTokens: z.number().int().min(128).max(MAX_TOKENS_LIMIT),
  timeoutMs: z.number().int().min(1000).max(TIMEOUT_LIMIT_MS),
  jsonMode: JsonModeSchema,
  useSearch: z.boolean(),
  searchMode: SearchModeSchema,
});
export type AgentModelConfig = z.infer<typeof AgentModelConfigSchema>;

export const StyleReferenceTypeSchema = z.enum([
  'youtube_link',
  'upload_video',
  'upload_images',
  'description',
]);
export type StyleReferenceType = z.infer<typeof StyleReferenceTypeSchema>;

export const StyleReferenceStatusSchema = z.enum(['new', 'analyzed', 'failed']);
export type StyleReferenceStatus = z.infer<typeof StyleReferenceStatusSchema>;

export const StyleReferenceSchema = z.object({
  id: z.string().min(1),
  type: StyleReferenceTypeSchema,
  source: z.string().min(1),
  note: z.string().optional(),
  status: StyleReferenceStatusSchema,
});
export type StyleReference = z.infer<typeof StyleReferenceSchema>;

export const ConfidenceLevelSchema = z.enum(['low', 'medium', 'high']);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

export const AttributeSourceSchema = z.enum(['local_metric', 'model', 'manual']);
export type AttributeSource = z.infer<typeof AttributeSourceSchema>;

export function createStyleAttributeSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({
    value: valueSchema,
    confidence: ConfidenceLevelSchema,
    source: AttributeSourceSchema,
  });
}

export type StyleAttribute<T> = {
  value: T;
  confidence: ConfidenceLevel;
  source: AttributeSource;
};

export const RhythmValueSchema = z.object({
  pattern: z.string(),
  avgShotSec: z.number().nullable().optional(),
  cutsPerMin: z.number().nullable().optional(),
});

export const ColorValueSchema = z.object({
  mood: z.string(),
  dominantColors: z.array(z.string()),
});

export const StyleAttributesSchema = z.object({
  rhythm: createStyleAttributeSchema(RhythmValueSchema),
  hookVisual: createStyleAttributeSchema(z.string()),
  color: createStyleAttributeSchema(ColorValueSchema),
  onScreenText: createStyleAttributeSchema(z.string()),
  subtitle: createStyleAttributeSchema(z.string()),
  assets: createStyleAttributeSchema(z.string()),
  composition: createStyleAttributeSchema(z.string()),
  transitions: createStyleAttributeSchema(z.string()),
  audio: createStyleAttributeSchema(z.string()),
  thumbnail: createStyleAttributeSchema(z.string()),
});
export type StyleAttributes = z.infer<typeof StyleAttributesSchema>;

export const StyleProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  referenceIds: z.array(z.string()),
  weights: z.record(z.string(), z.number().min(0)),
  attributes: StyleAttributesSchema,
  edited: z.boolean(),
  selectedSources: z.record(z.string(), z.string()).optional(),
  ignoredAttributes: z.array(z.string()).optional(),
});
export type StyleProfile = z.infer<typeof StyleProfileSchema>;

export const SourceRefSchema = z.object({
  title: z.string(),
  url: z.string(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const AgentResultSchema = z.object({
  agentId: AgentIdSchema,
  output: z.unknown(),
  sources: z.array(SourceRefSchema).optional(),
  model: z.string(),
  providerId: ProviderIdSchema.optional(),
  isMock: z.boolean().optional(),
  latencyMs: z.number(),
  tokens: z.number().optional(),
});
export type AgentResult = z.infer<typeof AgentResultSchema>;

export const IssueSeveritySchema = z.enum(['high', 'medium', 'low']);
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;

export const ComplianceIssueSchema = z.object({
  severity: IssueSeveritySchema,
  relatedAgent: RevisableAgentIdSchema,
  problem: z.string(),
  fix: z.string(),
});
export type ComplianceIssue = z.infer<typeof ComplianceIssueSchema>;

export const SimilarityRiskSchema = z.object({
  referenceId: z.string(),
  level: z.enum(['low', 'medium', 'high']),
  reason: z.string(),
});
export type SimilarityRisk = z.infer<typeof SimilarityRiskSchema>;

export const VerdictTypeSchema = z.enum(['pass', 'revise', 'reject']);
export type VerdictType = z.infer<typeof VerdictTypeSchema>;

export const ComplianceVerdictSchema = z.object({
  verdict: VerdictTypeSchema,
  issues: z.array(ComplianceIssueSchema),
  similarityRisks: z.array(SimilarityRiskSchema).optional(),
  notes: z.string(),
});
export type ComplianceVerdict = z.infer<typeof ComplianceVerdictSchema>;

export const StepStatusSchema = z.enum(['idle', 'running', 'done', 'failed', 'skipped']);
export type StepStatus = z.infer<typeof StepStatusSchema>;

export const StepStateSchema = z.object({
  status: StepStatusSchema,
  result: AgentResultSchema.optional(),
  error: z.string().optional(),
});
export type StepState = z.infer<typeof StepStateSchema>;

export const PipelineRunStatusSchema = z.enum([
  'running',
  'paused',
  'completed',
  'blocked',
  'interrupted',
]);
export type PipelineRunStatus = z.infer<typeof PipelineRunStatusSchema>;

export const PipelineStepsRecordSchema = z.object({
  researcher: StepStateSchema,
  scriptwriter: StepStateSchema,
  visual: StepStateSchema,
  packaging: StepStateSchema,
  compliance: StepStateSchema,
  orchestrator: StepStateSchema,
});
export type PipelineStepsRecord = z.infer<typeof PipelineStepsRecordSchema>;

export const PipelineRunSchema = z.object({
  id: z.string().min(1),
  input: RunInputSchema,
  steps: PipelineStepsRecordSchema,
  round: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  complianceRounds: z.array(ComplianceVerdictSchema),
  status: PipelineRunStatusSchema,
});
export type PipelineRun = z.infer<typeof PipelineRunSchema>;

export const HistoryEntrySchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  input: RunInputSchema,
  run: PipelineRunSchema,
  selection: z.object({
    titleIndex: z.number().int().min(0),
    hookIndex: z.number().int().min(0),
  }),
  profileSnapshot: ChannelProfileSchema,
  styleProfileSnapshot: StyleProfileSchema.optional(),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export const RevisionFeedbackSchema = z.object({
  round: z.union([z.literal(1), z.literal(2)]),
  issues: z.array(ComplianceIssueSchema),
  previousOutput: z.unknown(),
});
export type RevisionFeedback = z.infer<typeof RevisionFeedbackSchema>;

export const ExportFileSchema = z.object({
  schemaVersion: z.literal(EXPORT_SCHEMA_VERSION),
  exportedAt: z.string().min(1),
  profile: ChannelProfileSchema,
  styleProfiles: z.array(StyleProfileSchema),
  styleReferences: z.array(StyleReferenceSchema),
  modelConfigs: z.array(AgentModelConfigSchema),
  knowledge: z.array(KnowledgeBlockSchema),
  history: z.array(HistoryEntrySchema).max(HISTORY_MAX),
  lastIdeas: AgentResultSchema.optional(),
  lastAudit: AgentResultSchema.optional(),
  lastAnalysis: AgentResultSchema.optional(),
});
export type ExportFile = z.infer<typeof ExportFileSchema>;
