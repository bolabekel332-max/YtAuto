import { z } from 'zod';
import {
  AGENT_IDS,
  CERTAINTY_LEVELS,
  EXPORT_SCHEMA_VERSION,
  HISTORY_MAX,
  JSON_MODES,
  KNOWLEDGE_GROUPS,
  MAX_FALLBACKS,
  MAX_PASTE_CHARS,
  MAX_TOKENS_LIMIT,
  MODEL_ID_REGEX,
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

export const ChannelProfileSchema = z.preprocess(
  (val) => {
    if (val && typeof val === 'object') {
      const obj = { ...(val as Record<string, unknown>) };
      if (!obj.platform && Array.isArray(obj.platforms) && obj.platforms.length > 0) {
        obj.platform = obj.platforms[0];
      }
      if (!obj.platform) {
        obj.platform = 'youtube_shorts';
      }
      return obj;
    }
    return val;
  },
  z.object({
    niche: z.string().min(1).max(500),
    customNiche: z.string().max(500).optional(),
    sensitiveNiche: z.boolean(),
    audience: z.object({
      ageRange: z.string().min(1).max(500),
      customAgeRange: z.string().max(500).optional(),
      interests: z.array(z.string().min(1).max(500)).min(1).max(20),
      customInterests: z.string().max(500).optional(),
      level: z.string().min(1).max(500),
      customLevel: z.string().max(500).optional(),
    }),
    language: z.string().min(1).max(500),
    customLanguage: z.string().max(500).optional(),
    tone: z.string().min(1).max(500),
    customTone: z.string().max(500).optional(),
    platform: PlatformSchema,
    customPlatformNote: z.string().max(500).optional(),
    postingFrequency: z.string().min(1).max(500),
    customPostingFrequency: z.string().max(500).optional(),
    targetDuration: z.string().min(1).max(500),
    customTargetDuration: z.string().max(500).optional(),
    voiceType: z.string().min(1).max(500),
    customVoiceType: z.string().max(500).optional(),
    visualStyle: z.object({
      mode: z.enum(['template', 'reference']),
      template: z.string().max(500).optional(),
      customTemplate: z.string().max(500).optional(),
      defaultStyleProfileId: z.string().max(200).optional(),
    }),
  })
);
export type ChannelProfile = z.infer<typeof ChannelProfileSchema>;

export const RunInputSchema = z.object({
  topic: z.string().min(1).max(MAX_PASTE_CHARS),
  targetPlatform: PlatformSchema,
  includeResearch: z.boolean(),
  styleProfileId: z.string().max(200).optional(),
});
export type RunInput = z.infer<typeof RunInputSchema>;

export const KnowledgeBlockSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(
      /^[A-Za-z0-9_-]{1,64}$/,
      'ID blok pengetahuan hanya boleh berisi huruf, angka, garis bawah, dan tanda hubung.'
    ),
  group: KnowledgeGroupSchema,
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(4000),
  verifiedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal verifikasi wajib berformat YYYY-MM-DD.'),
  note: z.string().max(1000).optional(),
  certainty: CertaintyLevelSchema,
});
export type KnowledgeBlock = z.infer<typeof KnowledgeBlockSchema>;

export const AgentModelConfigSchema = z.object({
  agentId: AgentIdSchema,
  providerId: ProviderIdSchema,
  model: z
    .string()
    .min(1)
    .max(120)
    .regex(MODEL_ID_REGEX, 'ID model hanya boleh berisi huruf, angka, titik, garis bawah, titik dua, garis miring, dan tanda hubung.'),
  fallbackModels: z
    .array(
      z
        .string()
        .min(1)
        .max(120)
        .regex(MODEL_ID_REGEX, 'ID model cadangan mengandung karakter tidak valid.')
    )
    .max(MAX_FALLBACKS),
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
  id: z.string().min(1).max(120),
  type: StyleReferenceTypeSchema,
  source: z.string().min(1).max(2000),
  note: z.string().max(1000).optional(),
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
  pattern: z.string().max(2000),
  avgShotSec: z.number().nullable().optional(),
  cutsPerMin: z.number().nullable().optional(),
});

export const ColorValueSchema = z.object({
  mood: z.string().max(2000),
  dominantColors: z.array(z.string().max(64)).max(20),
});

export const StyleAttributesSchema = z.object({
  rhythm: createStyleAttributeSchema(RhythmValueSchema),
  hookVisual: createStyleAttributeSchema(z.string().max(2000)),
  color: createStyleAttributeSchema(ColorValueSchema),
  onScreenText: createStyleAttributeSchema(z.string().max(2000)),
  subtitle: createStyleAttributeSchema(z.string().max(2000)),
  assets: createStyleAttributeSchema(z.string().max(2000)),
  composition: createStyleAttributeSchema(z.string().max(2000)),
  transitions: createStyleAttributeSchema(z.string().max(2000)),
  audio: createStyleAttributeSchema(z.string().max(2000)),
  thumbnail: createStyleAttributeSchema(z.string().max(2000)),
});
export type StyleAttributes = z.infer<typeof StyleAttributesSchema>;

export const StyleProfileSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  referenceIds: z.array(z.string().max(200)).max(20),
  /**
   * Peta bobot kontribusi profil/referensi sumber:
   * - Untuk profil tunggal hasil analisis: key = `referenceId` sumber, value = `1`.
   * - Untuk profil hasil `mergeProfiles`: key = `profile.id` setiap sumber, value = bobot ternormalisasi `0..1` (dibulatkan 3 desimal).
   */
  weights: z.record(z.string().max(200), z.number().min(0)),
  attributes: StyleAttributesSchema,
  edited: z.boolean(),
  selectedSources: z.record(z.string().max(100), z.string().max(500)).optional(),
  ignoredAttributes: z.array(z.string().max(64)).max(20).optional(),
});
export type StyleProfile = z.infer<typeof StyleProfileSchema>;

export const SourceRefSchema = z.object({
  title: z.string().max(500),
  url: z.string().max(2000),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const AgentResultSchema = z.object({
  agentId: AgentIdSchema,
  output: z.unknown(),
  sources: z.array(SourceRefSchema).max(100).optional(),
  searchUsed: z.boolean().optional(),
  groundedSourceCount: z.number().int().min(0).optional(),
  fallbackUsed: z.boolean().optional(),
  requestedModel: z.string().max(120).optional(),
  model: z.string().max(120),
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
  problem: z.string().max(4000),
  fix: z.string().max(4000),
});
export type ComplianceIssue = z.infer<typeof ComplianceIssueSchema>;

export const SimilarityRiskSchema = z.object({
  referenceId: z.string().max(200),
  level: z.enum(['low', 'medium', 'high']),
  reason: z.string().max(2000),
});
export type SimilarityRisk = z.infer<typeof SimilarityRiskSchema>;

export const VerdictTypeSchema = z.enum(['pass', 'revise', 'reject']);
export type VerdictType = z.infer<typeof VerdictTypeSchema>;

export const ComplianceVerdictSchema = z.object({
  verdict: VerdictTypeSchema,
  issues: z.array(ComplianceIssueSchema).max(30),
  similarityRisks: z.array(SimilarityRiskSchema).max(20).optional(),
  notes: z.string().max(4000),
});
export type ComplianceVerdict = z.infer<typeof ComplianceVerdictSchema>;

export function normalizeComplianceVerdict(verdict: ComplianceVerdict): ComplianceVerdict {
  return {
    verdict: verdict.verdict,
    issues: verdict.issues.slice(0, 30).map((issue) => ({
      severity: issue.severity,
      relatedAgent: issue.relatedAgent,
      problem: issue.problem.slice(0, 4000),
      fix: issue.fix.slice(0, 4000),
    })),
    similarityRisks: verdict.similarityRisks?.slice(0, 20).map((risk) => ({
      referenceId: risk.referenceId.slice(0, 200),
      level: risk.level,
      reason: risk.reason.slice(0, 2000),
    })),
    notes: verdict.notes.slice(0, 4000),
  };
}

export const StepStatusSchema = z.enum(['idle', 'running', 'done', 'failed', 'skipped']);
export type StepStatus = z.infer<typeof StepStatusSchema>;

export const StepStateSchema = z.object({
  status: StepStatusSchema,
  result: AgentResultSchema.optional(),
  error: z.string().max(2000).optional(),
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

export const PendingRevisionSchema = z.object({
  round: z.union([z.literal(1), z.literal(2)]),
  remainingAgents: z.array(RevisableAgentIdSchema).max(5),
  issues: z.array(ComplianceIssueSchema).max(30),
  previousOutputs: z.record(z.string().max(32), z.unknown()),
});
export type PendingRevision = z.infer<typeof PendingRevisionSchema>;

export const PipelineRunSchema = z.object({
  id: z.string().min(1).max(200),
  input: RunInputSchema,
  steps: PipelineStepsRecordSchema,
  round: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  complianceRounds: z.array(ComplianceVerdictSchema).max(10),
  pendingRevision: PendingRevisionSchema.optional(),
  status: PipelineRunStatusSchema,
});
export type PipelineRun = z.infer<typeof PipelineRunSchema>;

export const HistoryEntrySchema = z.object({
  id: z.string().min(1).max(200),
  createdAt: z.string().min(1).max(64),
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
  issues: z.array(ComplianceIssueSchema).max(20),
  previousOutput: z.unknown().refine(
    (val) => {
      if (val === undefined) return true;
      try {
        const serialized = JSON.stringify(val);
        return typeof serialized === 'string' && serialized.length <= 60_000;
      } catch {
        return false;
      }
    },
    { message: 'previousOutput melebihi batas maksimal 60.000 karakter JSON.' }
  ),
});
export type RevisionFeedback = z.infer<typeof RevisionFeedbackSchema>;

export const ExportFileSchema = z.object({
  schemaVersion: z.literal(EXPORT_SCHEMA_VERSION),
  exportedAt: z.string().min(1).max(64),
  profile: ChannelProfileSchema,
  styleProfiles: z.array(StyleProfileSchema).max(30),
  styleReferences: z.array(StyleReferenceSchema).max(30),
  modelConfigs: z.array(AgentModelConfigSchema).max(20),
  knowledge: z.array(KnowledgeBlockSchema).max(32),
  history: z.array(HistoryEntrySchema).max(HISTORY_MAX),
  lastIdeas: AgentResultSchema.optional(),
  lastAudit: AgentResultSchema.optional(),
  lastAnalysis: AgentResultSchema.optional(),
});
export type ExportFile = z.infer<typeof ExportFileSchema>;
