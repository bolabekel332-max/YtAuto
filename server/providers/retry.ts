import { MAX_FALLBACKS } from '../../shared/constants';
import { ProviderCallError, type LLMProvider, type LLMRequest, type LLMResponse } from './types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryAttemptResult {
  response: LLMResponse;
  modelUsed: string;
}

/**
 * Aturan retry dan fallback (BP 9.4 / NFR-02):
 * 1. Error 429 atau 5xx (retryable): retry dengan jeda maksimal 2x per model.
 * 2. Jika masih gagal, pindah ke model cadangan (fallbackModels) pada provider yang sama (maks 3).
 * 3. Output terpotong (truncated): TIDAK di-retry otomatis; langsung lempar output_truncated.
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
      if (attempt > 0) {
        const delayMs = attempt === 1 ? 450 : 1100;
        await sleep(delayMs);
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
        if (err instanceof ProviderCallError) {
          // Jangan retry output_truncated, capability_missing, atau timeout berulang
          if (err.code === 'output_truncated' || err.code === 'capability_missing') {
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
