import { z } from 'zod';
import { MODEL_ID_REGEX } from './constants';
import {
  AgentIdSchema,
  AgentModelConfigSchema,
  AgentResultSchema,
  ChannelProfileSchema,
  KnowledgeBlockSchema,
  ProviderIdSchema,
  RevisionFeedbackSchema,
  StyleProfileSchema,
} from './schemas';
import { styleAnalystIn } from './agentInputs';

export const API_ERROR_CODES = [
  'invalid_request',
  'capability_missing',
  'payload_too_large',
  'rate_limited',
  'daily_cap',
  'provider_error',
  'output_invalid',
  'output_truncated',
  'timeout',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const ERROR_HTTP_STATUS: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  capability_missing: 400,
  payload_too_large: 413,
  rate_limited: 429,
  daily_cap: 429,
  provider_error: 502,
  output_invalid: 502,
  output_truncated: 502,
  timeout: 504,
};

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: string;
  };
}

export const AgentRunRequestSchema = z.object({
  agentId: AgentIdSchema,
  mode: z.enum(['default', 'audit']).optional(),
  input: z.unknown(),
  revisionFeedback: RevisionFeedbackSchema.optional(),
  profile: ChannelProfileSchema,
  styleProfile: StyleProfileSchema.optional(),
  knowledge: z.array(KnowledgeBlockSchema).max(32),
  config: AgentModelConfigSchema,
});
export type AgentRunRequest = z.infer<typeof AgentRunRequestSchema>;

export const AgentTestRequestSchema = z.object({
  agentId: AgentIdSchema,
  mode: z.enum(['default', 'audit']).optional(),
  profile: ChannelProfileSchema.optional(),
  knowledge: z.array(KnowledgeBlockSchema).max(32).optional(),
  config: AgentModelConfigSchema,
});
export type AgentTestRequest = z.infer<typeof AgentTestRequestSchema>;

export const ProviderTestRequestSchema = z.object({
  providerId: ProviderIdSchema,
  model: z
    .string()
    .min(1)
    .max(120)
    .regex(MODEL_ID_REGEX, 'ID model mengandung karakter tidak valid.'),
});
export type ProviderTestRequest = z.infer<typeof ProviderTestRequestSchema>;

export const StyleAnalyzeRequestSchema = z.object({
  reference: styleAnalystIn,
  profile: ChannelProfileSchema,
  knowledge: z.array(KnowledgeBlockSchema).max(32),
  config: AgentModelConfigSchema,
});
export type StyleAnalyzeRequest = z.infer<typeof StyleAnalyzeRequestSchema>;

export interface ProviderCapabilities {
  jsonSchema: boolean;
  jsonObject: boolean;
  search: boolean;
  video: boolean;
  image: boolean;
}

export interface ProviderStatus {
  id: z.infer<typeof ProviderIdSchema>;
  name: string;
  keyDetected: boolean;
  available: boolean;
  tested: boolean;
  statusNote: string;
  capabilities: ProviderCapabilities;
}

export interface ProvidersStatusResponse {
  providers: ProviderStatus[];
  dailyCallsUsed: number;
  dailyCallCap: number;
  nousOAuthEnabled?: boolean;
}

export interface ProviderTestResponse {
  ok: boolean;
  providerId: z.infer<typeof ProviderIdSchema>;
  model: string;
  latencyMs: number;
  isMock: boolean;
  message: string;
}

export interface StyleAnalyzeResponse {
  profile: StyleProfile;
  result: z.infer<typeof AgentResultSchema>;
}

import type { StyleProfile } from './schemas';
export type AgentRunResponse = z.infer<typeof AgentResultSchema>;

export interface NousOAuthStatusResponse {
  connected: boolean;
  authMethod: 'oauth' | 'api_key' | 'none';
  expiresAt?: string;
  hasRefreshToken: boolean;
}

export interface NousDeviceStartResponse {
  flowId: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

export const NousDevicePollRequestSchema = z.object({
  flowId: z.string().min(1),
});
export type NousDevicePollRequest = z.infer<typeof NousDevicePollRequestSchema>;

export interface NousDevicePollResponse {
  status: 'pending' | 'connected' | 'expired' | 'denied';
  interval?: number;
  message?: string;
  expiresAt?: string;
}

export interface ProviderModelItem {
  id: string;
  name?: string;
  isFree: boolean;
  ownedBy?: string;
  contextLength?: number;
  inputModalities?: string[];
  supportsStructuredOutput?: boolean;
  promptPricePerMillion?: number;
  completionPricePerMillion?: number;
}

export interface ProviderModelsResponse {
  providerId: z.infer<typeof ProviderIdSchema>;
  fetchedAt: string;
  models: ProviderModelItem[];
}

export interface NousModelsResponse {
  providerId?: z.infer<typeof ProviderIdSchema>;
  fetchedAt?: string;
  models: ProviderModelItem[];
}

