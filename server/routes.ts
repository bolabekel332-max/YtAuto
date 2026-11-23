import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import {
  AgentRunRequestSchema,
  AgentTestRequestSchema,
  NousDevicePollRequestSchema,
  ProviderTestRequestSchema,
  StyleAnalyzeRequestSchema,
  type AccessInfo,
  type ApiErrorBody,
  type ProviderTestResponse,
  type ProvidersStatusResponse,
} from '../shared/api';
import type { ProviderId } from '../shared/schemas';
import { SAMPLE_INPUTS, SAMPLE_PROFILE_FOR_TEST } from '../shared/agentInputs';
import { schemaIdFor } from '../shared/agentRegistry';
import { runAgent } from './agentRunner';
import { accessGate, consumeModelCall, DailyCapError, getDailyCallUsage, rateLimiter } from './auth';
import { getEnv } from './config';
import { extractSafeErrorLogMeta, logCall } from './logger';
import {
  disconnectNousOAuth,
  fetchNousModels,
  getNousOAuthStatus,
  pollNousDeviceFlow,
  startNousDeviceFlow,
} from './providers/nousAuth';
import { fetchOpenRouterModels } from './providers/openrouter';
import { getProvider, listStatus } from './providers/registry';
import { ProviderCallError } from './providers/types';
import { analyzeReference } from './styleAnalyzer';
import { AppApiError, validateConfig } from './validation';

function handleRouteError(res: Response, err: unknown): void {
  if (err instanceof AppApiError) {
    const body: ApiErrorBody = {
      error: {
        code: err.code,
        message: err.message,
      },
    };
    res.status(err.httpStatus).json(body);
    return;
  }

  if (err instanceof DailyCapError) {
    const body: ApiErrorBody = {
      error: {
        code: 'daily_cap',
        message: err.message,
      },
    };
    res.status(429).json(body);
    return;
  }

  if (err instanceof ProviderCallError) {
    const body: ApiErrorBody = {
      error: {
        code: err.code,
        message: err.message,
      },
    };
    res.status(err.httpStatus).json(body);
    return;
  }

  const body: ApiErrorBody = {
    error: {
      code: 'provider_error',
      message:
        err instanceof Error
          ? `Terjadi gangguan pada server: ${err.message}`
          : 'Terjadi kesalahan internal pada server.',
    },
  };
  res.status(500).json(body);
}

export function registerRoutes(app: Express): void {
  const api = express.Router();

  // Urutan pemrosesan wajib (BP 13 / S-03): Rate Limit -> Gerbang Akses -> Validasi -> Eksekusi
  api.use(rateLimiter);
  api.use(accessGate);

  // Endpoint publik (dikecualikan dari gerbang kode akses)
  api.get('/access', (_req: Request, res: Response) => {
    const { appAccessCode } = getEnv();
    const payload: AccessInfo = {
      gateEnabled: appAccessCode.length > 0,
    };
    res.json(payload);
  });

  api.get('/providers/status', (_req: Request, res: Response) => {
    const usage = getDailyCallUsage();
    const payload: ProvidersStatusResponse = {
      providers: listStatus(),
      dailyCallsUsed: usage.used,
      dailyCallCap: usage.cap,
    };
    res.json(payload);
  });

  api.post('/agent/run', async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const parsed = AgentRunRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppApiError(
          'invalid_request',
          400,
          `Payload permintaan agent tidak valid: ${parsed.error.issues
            .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
            .join('; ')}`
        );
      }
      const result = await runAgent(parsed.data);
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  api.post('/agent/test', async (req: Request, res: Response) => {
    try {
      const parsed = AgentTestRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppApiError(
          'invalid_request',
          400,
          `Payload tes agent tidak valid: ${parsed.error.issues
            .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
            .join('; ')}`
        );
      }

      const { agentId, mode, profile, knowledge, config } = parsed.data;
      const sId = schemaIdFor(agentId, mode);
      const sampleInput = SAMPLE_INPUTS[sId];

      const result = await runAgent({
        agentId,
        mode,
        input: sampleInput,
        profile: profile ?? SAMPLE_PROFILE_FOR_TEST,
        knowledge: knowledge ?? [],
        config: {
          ...config,
          agentId,
        },
      });
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  api.post('/providers/test', async (req: Request, res: Response) => {
    const start = Date.now();
    let providerIdForLog: ProviderId = 'mock';
    try {
      const parsed = ProviderTestRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppApiError(
          'invalid_request',
          400,
          'Payload tes koneksi provider harus berisi providerId dan nama model.'
        );
      }

      const { providerId, model } = parsed.data;
      providerIdForLog = providerId;
      const provider = getProvider(providerId);

      // Validasi allowlist dan ketersediaan kunci
      validateConfig(
        {
          agentId: 'orchestrator',
          providerId,
          model,
          fallbackModels: [],
          temperature: null,
          maxTokens: 1024,
          timeoutMs: 20000,
          jsonMode: 'prompt_only',
          useSearch: false,
          searchMode: 'single',
        },
        provider
      );

      if (!provider) {
        throw new AppApiError('invalid_request', 400, 'Provider tidak ditemukan.');
      }

      consumeModelCall();
      const testRes = await provider.testConnection(model);

      logCall({
        agentId: 'provider_test',
        providerId,
        status: 'ok',
        latencyMs: testRes.latencyMs,
      });

      const payload: ProviderTestResponse = {
        ok: true,
        providerId,
        model,
        latencyMs: testRes.latencyMs,
        isMock: providerId === 'mock',
        message: testRes.message,
      };
      res.json(payload);
    } catch (err) {
      logCall({
        agentId: 'provider_test',
        providerId: providerIdForLog,
        status: 'error',
        latencyMs: Date.now() - start,
        ...extractSafeErrorLogMeta(err),
      });
      handleRouteError(res, err);
    }
  });

  api.get('/oauth/nous/status', (_req: Request, res: Response) => {
    res.json(getNousOAuthStatus());
  });

  api.post('/oauth/nous/device/start', async (_req: Request, res: Response) => {
    try {
      const started = await startNousDeviceFlow();
      res.json(started);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  api.post('/oauth/nous/device/poll', async (req: Request, res: Response) => {
    try {
      const parsed = NousDevicePollRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppApiError(
          'invalid_request',
          400,
          'Payload polling OAuth Nous harus menyertakan flowId yang valid.'
        );
      }
      const polled = await pollNousDeviceFlow(parsed.data.flowId);
      res.json(polled);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  api.post('/oauth/nous/disconnect', (_req: Request, res: Response) => {
    res.json(disconnectNousOAuth());
  });

  api.get('/oauth/nous/models', async (_req: Request, res: Response) => {
    try {
      const list = await fetchNousModels();
      res.json(list);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  api.get('/providers/:providerId/models', async (req: Request, res: Response) => {
    try {
      const { providerId } = req.params;
      if (providerId === 'nous') {
        res.json(await fetchNousModels());
        return;
      }
      if (providerId === 'openrouter') {
        res.json(await fetchOpenRouterModels());
        return;
      }
      throw new AppApiError(
        'invalid_request',
        400,
        'Daftar model dinamis saat ini tersedia untuk provider OpenRouter dan Nous Portal.'
      );
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  api.post('/style/analyze', async (req: Request, res: Response) => {
    try {
      const parsed = StyleAnalyzeRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppApiError(
          'invalid_request',
          400,
          `Payload analisis gaya tidak valid: ${parsed.error.issues
            .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
            .join('; ')}`
        );
      }

      const result = await analyzeReference(parsed.data);
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.use('/api', api);
}
