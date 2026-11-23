import { ACCESS_CODE_HEADER } from '../../shared/constants';
import type {
  AccessInfo,
  AgentRunRequest,
  AgentRunResponse,
  AgentTestRequest,
  ApiErrorBody,
  ApiErrorCode,
  NousDevicePollResponse,
  NousDeviceStartResponse,
  NousModelsResponse,
  NousOAuthStatusResponse,
  ProviderModelsResponse,
  ProviderTestRequest,
  ProviderTestResponse,
  ProvidersStatusResponse,
  StyleAnalyzeRequest,
  StyleAnalyzeResponse,
} from '../../shared/api';

export class ClientApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface ApiCallHandlers {
  onUnauthorized?: () => void;
}

let globalHandlers: ApiCallHandlers = {};

export function registerApiHandlers(handlers: ApiCallHandlers): void {
  globalHandlers = handlers;
}

async function requestJson<T>(
  path: string,
  options: {
    method: 'GET' | 'POST';
    accessCode?: string;
    body?: unknown;
  }
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.accessCode && options.accessCode.trim().length > 0) {
    headers[ACCESS_CODE_HEADER] = options.accessCode.trim();
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    throw new ClientApiError(
      0,
      'provider_error',
      `Tidak dapat terhubung ke server aplikasi: ${err instanceof Error ? err.message : 'jaringan terputus'}`
    );
  }

  let parsedBody: unknown = null;
  try {
    parsedBody = await response.json();
  } catch {
    parsedBody = null;
  }

  if (!response.ok) {
    const errPayload = parsedBody as Partial<ApiErrorBody> | null;
    const code: ApiErrorCode =
      errPayload?.error?.code ??
      (response.status === 401
        ? 'unauthorized'
        : response.status === 413
        ? 'payload_too_large'
        : response.status === 429
        ? 'rate_limited'
        : response.status === 504
        ? 'timeout'
        : 'provider_error');

    const message =
      errPayload?.error?.message ??
      `Permintaan gagal dengan status HTTP ${response.status}.`;

    if (response.status === 401 && globalHandlers.onUnauthorized) {
      globalHandlers.onUnauthorized();
    }

    throw new ClientApiError(response.status, code, message);
  }

  return parsedBody as T;
}

export function getAccessInfo(): Promise<AccessInfo> {
  return requestJson<AccessInfo>('/api/access', { method: 'GET' });
}

export function getProviderStatus(accessCode?: string): Promise<ProvidersStatusResponse> {
  return requestJson<ProvidersStatusResponse>('/api/providers/status', {
    method: 'GET',
    accessCode,
  });
}

export function runAgent(
  payload: AgentRunRequest,
  accessCode?: string
): Promise<AgentRunResponse> {
  return requestJson<AgentRunResponse>('/api/agent/run', {
    method: 'POST',
    body: payload,
    accessCode,
  });
}

export function testAgent(
  payload: AgentTestRequest,
  accessCode?: string
): Promise<AgentRunResponse> {
  return requestJson<AgentRunResponse>('/api/agent/test', {
    method: 'POST',
    body: payload,
    accessCode,
  });
}

export function testProvider(
  payload: ProviderTestRequest,
  accessCode?: string
): Promise<ProviderTestResponse> {
  return requestJson<ProviderTestResponse>('/api/providers/test', {
    method: 'POST',
    body: payload,
    accessCode,
  });
}

export function analyzeStyle(
  payload: StyleAnalyzeRequest,
  accessCode?: string
): Promise<StyleAnalyzeResponse> {
  return requestJson<StyleAnalyzeResponse>('/api/style/analyze', {
    method: 'POST',
    body: payload,
    accessCode,
  });
}

export function getNousOAuthStatus(accessCode?: string): Promise<NousOAuthStatusResponse> {
  return requestJson<NousOAuthStatusResponse>('/api/oauth/nous/status', {
    method: 'GET',
    accessCode,
  });
}

export function startNousDeviceAuth(accessCode?: string): Promise<NousDeviceStartResponse> {
  return requestJson<NousDeviceStartResponse>('/api/oauth/nous/device/start', {
    method: 'POST',
    accessCode,
  });
}

export function pollNousDeviceAuth(
  flowId: string,
  accessCode?: string
): Promise<NousDevicePollResponse> {
  return requestJson<NousDevicePollResponse>('/api/oauth/nous/device/poll', {
    method: 'POST',
    body: { flowId },
    accessCode,
  });
}

export function disconnectNousOAuth(accessCode?: string): Promise<NousOAuthStatusResponse> {
  return requestJson<NousOAuthStatusResponse>('/api/oauth/nous/disconnect', {
    method: 'POST',
    accessCode,
  });
}

export function getNousModels(accessCode?: string): Promise<NousModelsResponse> {
  return requestJson<NousModelsResponse>('/api/oauth/nous/models', {
    method: 'GET',
    accessCode,
  });
}

export function getProviderModels(
  providerId: 'openrouter' | 'nous',
  accessCode?: string
): Promise<ProviderModelsResponse> {
  return requestJson<ProviderModelsResponse>(`/api/providers/${providerId}/models`, {
    method: 'GET',
    accessCode,
  });
}
