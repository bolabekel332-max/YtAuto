import express, { type Express, type Request, type Response } from 'express';
import {
  AgentRunRequestSchema,
  AgentTestRequestSchema,
  NousDevicePollRequestSchema,
  ProviderTestRequestSchema,
  StyleAnalyzeRequestSchema,
  type ApiErrorBody,
  type ProviderTestResponse,
  type ProvidersStatusResponse,
} from '../shared/api';
import type { ProviderId } from '../shared/schemas';
import { SAMPLE_INPUTS, SAMPLE_PROFILE_FOR_TEST } from '../shared/agentInputs';
import { schemaIdFor } from '../shared/agentRegistry';
import { runAgent } from './agentRunner';
import {
  consumeModelCall,
  DailyCapError,
  getDailyCallUsage,
  rateLimiter,
  strictRateLimiter,
} from './auth';
import { extractSafeErrorLogMeta, logCall } from './logger';
import { getEnv, isLoopbackHost } from './config';
import {
  disconnectNousOAuth,
  fetchNousModels,
  getNousOAuthStatus,
  pollNousDeviceFlow,
  startNousDeviceFlow,
} from './providers/nousAuth';
import { fetchApinexModels } from './providers/apinex';
import { fetchOpenRouterModels } from './providers/openrouter';
import { getProvider, listStatus } from './providers/registry';
import { ProviderCallError, sanitizeErrorMessage } from './providers/types';
import { analyzeReference } from './styleAnalyzer';
import { AppApiError, validateConfig } from './validation';

function bindRequestAbort(req: Request, res: Response): AbortController {
  const controller = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  };
  req.on('aborted', onClose);
  res.on('close', onClose);
  return controller;
}

export function handleRouteError(res: Response, err: unknown): void {
  if (!(err instanceof AppApiError)) {
    const safeMsg = sanitizeErrorMessage(err);
    const errName = err instanceof Error ? err.name : typeof err;
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        scope: 'api_route',
        errorName: errName,
        errorMessage: safeMsg,
      })
    );
  }

  if (res.headersSent || res.writableEnded || res.destroyed) {
    return;
  }

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
      message: 'Terjadi kesalahan internal pada server.',
    },
  };
  res.status(500).json(body);
}

export function registerRoutes(app: Express): void {
  const api = express.Router();

  // Pastikan seluruh respons API tidak disimpan di cache proxy/browser
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Urutan pemrosesan: Rate Limit -> Health -> Validasi -> Eksekusi
  api.use(rateLimiter);

  api.get('/healthz', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  api.get('/providers/status', (_req: Request, res: Response) => {
    const usage = getDailyCallUsage();
    const env = getEnv();
    const payload: ProvidersStatusResponse = {
      providers: listStatus(),
      dailyCallsUsed: usage.used,
      dailyCallCap: usage.cap,
      nousOAuthEnabled: isLoopbackHost(env.host) || env.enableNousOAuth,
    };
    res.json(payload);
  });

  api.post('/agent/run', async (req: Request, res: Response) => {
    const ac = bindRequestAbort(req, res);
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
      const result = await runAgent(parsed.data, { signal: ac.signal });
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  api.post('/agent/test', strictRateLimiter, async (req: Request, res: Response) => {
    const ac = bindRequestAbort(req, res);
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

      const result = await runAgent(
        {
          agentId,
          mode,
          input: sampleInput,
          profile: profile ?? SAMPLE_PROFILE_FOR_TEST,
          knowledge: knowledge ?? [],
          config: {
            ...config,
            agentId,
          },
        },
        { signal: ac.signal }
      );
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  api.post('/providers/test', strictRateLimiter, async (req: Request, res: Response) => {
    const start = Date.now();
    let providerIdForLog: ProviderId = 'mock';
    try {
      const parsed = ProviderTestRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppApiError(
          'invalid_request',
          400,
          'Payload tes koneksi provider harus berisi providerId dan nama model yang valid.'
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

  api.use('/oauth/nous', (_req: Request, res: Response, next) => {
    const env = getEnv();
    if (!isLoopbackHost(env.host) && !env.enableNousOAuth) {
      const payload: ApiErrorBody = {
        error: {
          code: 'invalid_request',
          message:
            'Endpoint OAuth Nous dinonaktifkan saat HOST non-loopback (atur ENABLE_NOUS_OAUTH=true bila dilindungi gateway akses).',
        },
      };
      res.status(404).json(payload);
      return;
    }
    next();
  });

  api.get('/oauth/nous/status', (_req: Request, res: Response) => {
    res.json(getNousOAuthStatus());
  });

  api.post('/oauth/nous/device/start', strictRateLimiter, async (_req: Request, res: Response) => {
    try {
      const started = await startNousDeviceFlow();
      res.json(started);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  api.post('/oauth/nous/device/poll', strictRateLimiter, async (req: Request, res: Response) => {
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

  api.post('/oauth/nous/disconnect', strictRateLimiter, (_req: Request, res: Response) => {
    res.json(disconnectNousOAuth());
  });

  api.get('/oauth/nous/models', strictRateLimiter, async (_req: Request, res: Response) => {
    try {
      const list = await fetchNousModels();
      res.json(list);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  api.get('/providers/:providerId/models', strictRateLimiter, async (req: Request, res: Response) => {
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
      if (providerId === 'apinex') {
        res.json(await fetchApinexModels());
        return;
      }
      throw new AppApiError(
        'invalid_request',
        400,
        'Daftar model dinamis saat ini tersedia untuk provider OpenRouter, Nous Portal, dan APInex.'
      );
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  api.post('/style/analyze', async (req: Request, res: Response) => {
    const ac = bindRequestAbort(req, res);
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

      const result = await analyzeReference(parsed.data, { signal: ac.signal });
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Endpoint /api/* tak dikenal selalu mengembalikan 404 JSON (tidak jatuh ke SPA HTML)
  api.use((_req: Request, res: Response) => {
    const payload: ApiErrorBody = {
      error: {
        code: 'invalid_request',
        message: 'Endpoint tidak ditemukan.',
      },
    };
    res.status(404).json(payload);
  });

  app.use('/api', api);
}
