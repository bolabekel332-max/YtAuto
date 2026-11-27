export const PLATFORMS = ['youtube_long', 'youtube_shorts', 'tiktok'] as const;

export const AGENT_IDS = [
  'orchestrator',
  'researcher',
  'scriptwriter',
  'visual',
  'packaging',
  'compliance',
  'analyst',
  'style_analyst',
] as const;

export const PIPELINE_STEP_IDS = [
  'researcher',
  'scriptwriter',
  'visual',
  'packaging',
  'compliance',
  'orchestrator',
] as const;

export const REVISABLE_AGENT_IDS = [
  'scriptwriter',
  'visual',
  'packaging',
] as const;

export const JSON_MODES = ['json_schema', 'json_object', 'prompt_only'] as const;

export const SEARCH_MODES = ['two_step', 'single'] as const;

export const PROVIDER_IDS = ['mock', 'gemini', 'openrouter', 'nous', 'apinex', 'custom'] as const;

export const CATALOG_PROVIDER_IDS = ['openrouter', 'nous', 'apinex'] as const;
export type CatalogProviderId = (typeof CATALOG_PROVIDER_IDS)[number];

export const CERTAINTY_LEVELS = [
  'official',
  'reported',
  'creator_observation',
  'house_rule',
] as const;

export const KNOWLEDGE_GROUPS = [
  'platformSignals',
  'policies',
  'qualityRules',
] as const;

export const MAX_REFERENCES = 5;
export const FRAME_COUNT_MIN = 8;
export const FRAME_COUNT_MAX = 12;
export const FRAME_MAX_SIDE = 768;
export const DENSE_THUMB_SIZE = { width: 64, height: 36 } as const;
export const DENSE_INTERVAL_SEC = 0.25;
export const DENSE_MAX_SEC = 120;
export const MAX_VIDEO_MB = 200;
export const MAX_IMAGES_MIN = 3;
export const MAX_IMAGES_MAX = 8;
export const MAX_PASTE_CHARS = 20000;
export const HISTORY_MAX = 30;
export const MAX_TOKENS_LIMIT = 16384;
export const TIMEOUT_LIMIT_MS = 180000;
export const MAX_FALLBACKS = 3;
export const EXPORT_SCHEMA_VERSION = 1;
export const MAX_REVISION_ROUNDS = 2;
export const MAX_RECENT_VIDEOS = 3;
export const MAX_AUDIT_VIDEOS = 10;
export const KNOWLEDGE_STALE_DAYS = 30;
export const MODEL_ID_REGEX = /^[A-Za-z0-9._:/-]+$/;

export { AUTO_FREE_FALLBACK_MODELS, DEFAULT_GEMINI_MODEL } from './defaults';

export const PROVIDER_CAPABILITIES = {
  mock: { jsonSchema: true, jsonObject: true, search: false, video: false, image: false },
  gemini: { jsonSchema: true, jsonObject: true, search: true, video: true, image: true },
  openrouter: { jsonSchema: true, jsonObject: true, search: true, video: false, image: true },
  nous: { jsonSchema: true, jsonObject: true, search: false, video: false, image: true },
  apinex: { jsonSchema: true, jsonObject: true, search: true, video: false, image: true },
  custom: { jsonSchema: false, jsonObject: true, search: false, video: false, image: false },
} as const;

