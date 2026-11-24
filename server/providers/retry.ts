import { MAX_FALLBACKS } from '../../shared/constants';
import { ProviderCallError, type LLMProvider, type LLMRequest, type LLMResponse } from './types';

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(
      new ProviderCallError('timeout', 499, 'Permintaan dibatalkan.', false, {
        errorKind: 'local_timeout',
        errorName: 'AbortError',
      })
    );
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(
        new ProviderCallError('timeout', 499, 'Permintaan dibatalkan.', false, {
          errorKind: 'local_timeout',
          errorName: 'AbortError',
        })
      );
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export interface RetryAttemptResult {
  response: LLMResponse;
  modelUsed: string;
}

function getFreeFallbackModel(providerId: string): string | undefined {
  if (providerId === 'apinex') return 'free/gemini-4-hydrogen';
  if (providerId === 'openrouter') return 'nvidia/nemotron-3-ultra-550b-a55b:free';
  if (providerId === 'nous') return 'qwen/qwen4-max:free';
  return undefined;
}

/**
 * Aturan retry dan fallback (BP 9.4 / NFR-02):
 * 1. Error 429 atau 5xx (retryable): retry dengan jeda + jitter maks 2x per model.
 * 2. Jika masih gagal, pindah ke model cadangan (fallbackModels) pada provider yang sama (maks 3).
 * 3. Auth/permission error, output_truncated, capability_missing, atau abort: TIDAK di-retry maupun pindah fallback.
 * 4. Setiap panggilan model aktual memanggil beforeModelCall() (consumeModelCall).
 */
export async function withRetryAndFallback(
  provider: LLMProvider,
  req: LLMRequest,
  primaryModel: string,
  fallbackModels: string[],
  beforeModelCall: () => void
): Promise<RetryAttemptResult> {
  const modelsToTry = [primaryModel, ...fallbackModels.slice(0, MAX_FALLBACKS)].filter(
    (m, idx, arr) => m.trim().length > 0 && arr.indexOf(m) === idx
  );

  let lastError: unknown;

  for (const model of modelsToTry) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (req.signal?.aborted) {
        throw new ProviderCallError('timeout', 499, 'Permintaan dibatalkan.', false, {
          errorKind: 'local_timeout',
          errorName: 'AbortError',
        });
      }

      if (attempt > 0) {
        const baseDelay = attempt === 1 ? 450 : 1100;
        const jitterMs = Math.floor(Math.random() * 250);
        const retryAfterMs =
          lastError instanceof ProviderCallError &&
          typeof lastError.meta?.retryAfterMs === 'number' &&
          Number.isFinite(lastError.meta.retryAfterMs)
            ? Math.min(10_000, Math.max(0, lastError.meta.retryAfterMs))
            : 0;
        const delayMs = Math.max(baseDelay + jitterMs, retryAfterMs);
        await sleep(delayMs, req.signal);
      }

      try {
        beforeModelCall();
        const response = await provider.generate(req, model);
        if (response.truncated) {
          throw new ProviderCallError(
            'output_truncated',
            502,
            `Output model (${model}) terpotong sebelum selesai. Naikkan nilai Max Tokens pada Pengaturan Model lalu ulangi langkah.`,
            false
          );
        }
        return { response, modelUsed: model };
      } catch (err) {
        lastError = err;
        if (req.signal?.aborted) {
          if (err instanceof ProviderCallError) throw err;
          throw new ProviderCallError('timeout', 499, 'Permintaan dibatalkan.', false, {
            errorKind: 'local_timeout',
            errorName: 'AbortError',
          });
        }
        if (err instanceof ProviderCallError) {
          if (err.meta?.errorKind === 'insufficient_balance') {
            const freeFallback = getFreeFallbackModel(provider.id);
            if (freeFallback && !modelsToTry.includes(freeFallback)) {
              modelsToTry.push(freeFallback);
              console.warn(
                `[Auto-Fallback] Saldo tidak mencukupi (402) untuk model ${model} pada provider ${provider.id}. Berpindah otomatis ke model gratis ${freeFallback}.`
              );
              break;
            }
          }
          // Hentikan langsung pada error yang tidak dapat diselesaikan dengan fallback model
          if (
            err.code === 'output_truncated' ||
            err.code === 'capability_missing' ||
            err.code === 'invalid_request' ||
            err.meta?.errorKind === 'authentication_error' ||
            err.meta?.errorKind === 'permission_error' ||
            err.meta?.errorKind === 'invalid_request' ||
            err.meta?.errorKind === 'not_found'
          ) {
            throw err;
          }
          if (!err.retryable) {
            break;
          }
        } else {
          // Error non-ProviderCallError (misal DailyCapError atau kesalahan tak terduga)
          const errObj = err as { code?: string };
          if (errObj?.code === 'daily_cap') {
            throw err;
          }
          break;
        }
      }
    }
  }

  if (lastError instanceof ProviderCallError) {
    throw lastError;
  }

  throw new ProviderCallError(
    'provider_error',
    502,
    lastError instanceof Error
      ? `Gagal memanggil provider ${provider.name}: ${lastError.message}`
      : `Gagal memanggil provider ${provider.name} setelah mencoba semua model cadangan.`,
    false
  );
}
