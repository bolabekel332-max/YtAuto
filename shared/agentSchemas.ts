import { z } from 'zod';
import {
  ConfidenceLevelSchema,
  IssueSeveritySchema,
  PlatformSchema,
  RevisableAgentIdSchema,
  SimilarityRiskSchema,
  StyleAttributesSchema,
  VerdictTypeSchema,
} from './schemas';

export const SCHEMA_IDS = [
  'orchestrator',
  'researcher',
  'scriptwriter',
  'visual',
  'packaging',
  'compliance',
  'audit',
  'analyst',
  'styleAnalyst',
] as const;

export type SchemaId = (typeof SCHEMA_IDS)[number];

export const orchestratorOut = z.object({
  finalSummary: z.string(),
  consistencyNotes: z.array(z.string()),
});
export type OrchestratorOutput = z.infer<typeof orchestratorOut>;

export const researcherOut = z.object({
  nicheMap: z.string(),
  contentPillars: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
    })
  ),
  series: z.array(
    z.object({
      name: z.string(),
      format: z.string(),
      platform: PlatformSchema,
    })
  ),
  ideas: z.array(
    z.object({
      title: z.string(),
      reason: z.string(),
      score: z.number().min(0).max(100),
    })
  ),
  calendar: z.array(
    z.object({
      day: z.string(),
      topic: z.string(),
      platform: PlatformSchema,
    })
  ),
});
export type ResearcherOutput = z.infer<typeof researcherOut>;

export const scriptwriterOut = z.object({
  hooks: z.array(z.string()).length(3),
  script: z.array(
    z.object({
      section: z.string(),
      durationSec: z.number().min(1),
      narration: z.string(),
      onScreenText: z.string(),
    })
  ),
  cta: z.string(),
  estimatedDurationSec: z.number().min(1),
});
export type ScriptwriterOutput = z.infer<typeof scriptwriterOut>;

export const visualOut = z.object({
  shotList: z.array(
    z.object({
      no: z.number().int().min(1),
      visual: z.string(),
      assetSource: z.string(),
      durationSec: z.number().min(1),
    })
  ),
  voiceDirection: z.string(),
  editingGuide: z.array(z.string()),
  variationNotes: z.array(z.string()),
});
export type VisualOutput = z.infer<typeof visualOut>;

export const packagingOut = z.object({
  titles: z.array(z.string()).length(5),
  thumbnailConcepts: z.array(
    z.object({
      mainText: z.string(),
      visualElements: z.string(),
      colors: z.string(),
    })
  ),
  captions: z.array(z.string()),
  keywords: z.array(z.string()),
  hashtags: z.array(z.string()),
  playlistSuggestion: z.string(),
});
export type PackagingOutput = z.infer<typeof packagingOut>;

export const complianceOut = z
  .object({
    verdict: VerdictTypeSchema,
    issues: z.array(
      z.object({
        severity: IssueSeveritySchema,
        relatedAgent: RevisableAgentIdSchema,
        problem: z.string(),
        fix: z.string(),
      })
    ),
    similarityRisks: z.array(SimilarityRiskSchema).optional(),
    notes: z.string(),
  })
  .superRefine((val, ctx) => {
    if (val.verdict === 'reject' && !val.issues.some((i) => i.severity === 'high')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Verdict reject wajib memiliki minimal satu issue dengan severity high.',
        path: ['issues'],
      });
    }
  });
export type ComplianceOutput = z.infer<typeof complianceOut>;

export const auditOut = z.object({
  perVideo: z.array(
    z.object({
      title: z.string(),
      riskLevel: z.enum(['low', 'medium', 'high']),
      reasons: z.array(z.string()),
    })
  ),
  variationScore: z.number().min(0).max(100),
  findings: z.array(
    z.object({
      severity: IssueSeveritySchema,
      problem: z.string(),
      fix: z.string(),
    })
  ),
  notes: z.string(),
});
export type AuditOutput = z.infer<typeof auditOut>;

export const analystOut = z.object({
  diagnosis: z.array(
    z.object({
      finding: z.string(),
      evidence: z.string(),
      confidence: ConfidenceLevelSchema,
    })
  ),
  recommendations: z.array(z.string()),
  testPlan: z.array(
    z.object({
      hypothesis: z.string(),
      change: z.string(),
      successMetric: z.string(),
    })
  ),
  dataWarnings: z.array(z.string()),
});
export type AnalystOutput = z.infer<typeof analystOut>;

export const styleAnalystOut = z.object({
  suggestedName: z.string(),
  attributes: StyleAttributesSchema,
});
export type StyleAnalystOutput = z.infer<typeof styleAnalystOut>;

export const OUTPUT_SCHEMAS: Record<SchemaId, z.ZodTypeAny> = {
  orchestrator: orchestratorOut,
  researcher: researcherOut,
  scriptwriter: scriptwriterOut,
  visual: visualOut,
  packaging: packagingOut,
  compliance: complianceOut,
  audit: auditOut,
  analyst: analystOut,
  styleAnalyst: styleAnalystOut,
};

function stripUnsupportedJsonSchemaKeys(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(stripUnsupportedJsonSchemaKeys);
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === '$schema' || k === 'additionalProperties') continue;
      cleaned[k] = stripUnsupportedJsonSchemaKeys(v);
    }
    return cleaned;
  }
  return node;
}

export function toJsonSchema(schemaId: SchemaId): Record<string, unknown> {
  const schema = OUTPUT_SCHEMAS[schemaId];
  const raw = z.toJSONSchema(schema, { target: 'draft-7', unrepresentable: 'any' });
  return stripUnsupportedJsonSchemaKeys(raw) as Record<string, unknown>;
}
