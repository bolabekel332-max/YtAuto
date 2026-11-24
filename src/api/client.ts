import type { CatalogProviderId } from '../../shared/constants';
import type {
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

async function requestJson<T>(
  path: string,
  options: {
    method: 'GET' | 'POST';
    body?: unknown;
    signal?: AbortSignal;
    extraHeaders?: Record<string, string>;
  }
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.extraHeaders ?? {}),
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (err) {
    if (
      options.signal?.aborted ||
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err instanceof Error && err.name === 'AbortError')
    ) {
      throw new DOMException('Permintaan dibatalkan oleh pengguna.', 'AbortError');
    }
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

    throw new ClientApiError(response.status, code, message);
  }

  if (parsedBody === null || typeof parsedBody !== 'object') {
    throw new ClientApiError(
      response.status,
      'provider_error',
      'Respons server kosong atau bukan format JSON yang valid.'
    );
  }

  return parsedBody as T;
}

export function getProviderStatus(): Promise<ProvidersStatusResponse> {
  return requestJson<ProvidersStatusResponse>('/api/providers/status', {
    method: 'GET',
  });
}

export function runAgent(
  payload: AgentRunRequest,
  signal?: AbortSignal
): Promise<AgentRunResponse> {
  return requestJson<AgentRunResponse>('/api/agent/run', {
    method: 'POST',
    body: payload,
    signal,
  });
}

export function testAgent(
  payload: AgentTestRequest,
  signal?: AbortSignal
): Promise<AgentRunResponse> {
  return requestJson<AgentRunResponse>('/api/agent/test', {
    method: 'POST',
    body: payload,
    signal,
  });
}

export function testProvider(payload: ProviderTestRequest): Promise<ProviderTestResponse> {
  return requestJson<ProviderTestResponse>('/api/providers/test', {
    method: 'POST',
    body: payload,
  });
}

export function analyzeStyle(
  payload: StyleAnalyzeRequest,
  signal?: AbortSignal
): Promise<StyleAnalyzeResponse> {
  return requestJson<StyleAnalyzeResponse>('/api/style/analyze', {
    method: 'POST',
    body: payload,
    signal,
  });
}

export function getNousOAuthStatus(): Promise<NousOAuthStatusResponse> {
  return requestJson<NousOAuthStatusResponse>('/api/oauth/nous/status', {
    method: 'GET',
  });
}

export function startNousDeviceAuth(): Promise<NousDeviceStartResponse> {
  return requestJson<NousDeviceStartResponse>('/api/oauth/nous/device/start', {
    method: 'POST',
  });
}

export function pollNousDeviceAuth(flowId: string): Promise<NousDevicePollResponse> {
  return requestJson<NousDevicePollResponse>('/api/oauth/nous/device/poll', {
    method: 'POST',
    body: { flowId },
  });
}

export function disconnectNousOAuth(): Promise<NousOAuthStatusResponse> {
  return requestJson<NousOAuthStatusResponse>('/api/oauth/nous/disconnect', {
    method: 'POST',
  });
}

export function getNousModels(): Promise<NousModelsResponse> {
  return requestJson<NousModelsResponse>('/api/oauth/nous/models', {
    method: 'GET',
  });
}

export function getProviderModels(
  providerId: CatalogProviderId
): Promise<ProviderModelsResponse> {
  return requestJson<ProviderModelsResponse>(`/api/providers/${providerId}/models`, {
    method: 'GET',
  });
}
