import type { NextFunction, Request, Response } from 'express';
import type { ApiErrorBody } from '../shared/api';
import { getEnv } from './config';

interface WindowCounter {
  count: number;
  resetAt: number;
}

const RATE_WINDOW_MS = 60_000;
const CLEANUP_INTERVAL_MS = 60_000;

const rateCounters = new Map<string, WindowCounter>();
const strictRateCounters = new Map<string, WindowCounter>();

let dailyDateKey = currentDateKey();
let dailyCallCount = 0;
let dailyTokenCount = 0;

function currentDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function syncDailyWindow(): void {
  const today = currentDateKey();
  if (today !== dailyDateKey) {
    dailyDateKey = today;
    dailyCallCount = 0;
    dailyTokenCount = 0;
  }
}

function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function cleanupExpiredAuthState(now = Date.now()): void {
  for (const [ip, counter] of rateCounters.entries()) {
    if (now >= counter.resetAt) {
      rateCounters.delete(ip);
    }
  }
  for (const [ip, counter] of strictRateCounters.entries()) {
    if (now >= counter.resetAt) {
      strictRateCounters.delete(ip);
    }
  }
}

const cleanupTimer = setInterval(() => {
  cleanupExpiredAuthState();
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();

function sendApiError(
  res: Response,
  status: number,
  code: ApiErrorBody['error']['code'],
  message: string
): void {
  const body: ApiErrorBody = {
    error: { code, message },
  };
  res.status(status).json(body);
}

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const { rateLimitPerMin } = getEnv();
  const ip = getClientIp(req);
  const now = Date.now();
  const existing = rateCounters.get(ip);

  if (!existing || now >= existing.resetAt) {
    rateCounters.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    next();
    return;
  }

  if (existing.count >= rateLimitPerMin) {
    sendApiError(
      res,
      429,
      'rate_limited',
      `Terlalu banyak permintaan dalam 1 menit (batas ${rateLimitPerMin}/menit). Tunggu sebentar lalu coba lagi.`
    );
    return;
  }

  existing.count += 1;
  next();
}

export function strictRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const { strictRateLimitPerMin } = getEnv();
  const strictLimit = strictRateLimitPerMin;
  const ip = getClientIp(req);
  const now = Date.now();
  const existing = strictRateCounters.get(ip);

  if (!existing || now >= existing.resetAt) {
    strictRateCounters.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    next();
    return;
  }

  if (existing.count >= strictLimit) {
    sendApiError(
      res,
      429,
      'rate_limited',
      `Terlalu banyak permintaan tes/katalog/OAuth dalam 1 menit (batas ${strictLimit}/menit). Tunggu sebentar lalu coba lagi.`
    );
    return;
  }

  existing.count += 1;
  next();
}

export class DailyCapError extends Error {
  readonly code = 'daily_cap' as const;
  readonly httpStatus = 429;
}

/**
 * Menghitung setiap panggilan model aktual & anggaran token harian di memori server (best-effort, reset saat server restart).
 * Dipanggil sebelum setiap request ke adapter (termasuk search tahap 1 & 2, retry, fallback, tes).
 */
export function consumeModelCall(): { used: number; cap: number } {
  const { dailyCallCap, dailyTokenCap } = getEnv();
  syncDailyWindow();

  if (dailyCallCount >= dailyCallCap) {
    throw new DailyCapError(
      `Batas panggilan model harian tercapai (${dailyCallCount}/${dailyCallCap}). Penghitung ini berbasis memori server dan akan reset otomatis keesokan hari atau saat server dimulai ulang.`
    );
  }

  if (dailyTokenCount >= dailyTokenCap) {
    throw new DailyCapError(
      `Anggaran token harian server tercapai (${dailyTokenCount}/${dailyTokenCap} token). Penghitung ini berbasis memori server dan akan reset otomatis keesokan hari atau saat server dimulai ulang.`
    );
  }

  dailyCallCount += 1;
  return { used: dailyCallCount, cap: dailyCallCap };
}

export function recordModelTokens(tokens: number | undefined): void {
  if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens <= 0) {
    return;
  }
  syncDailyWindow();
  dailyTokenCount += Math.round(tokens);
}

export function getDailyCallUsage(): { used: number; cap: number } {
  const { dailyCallCap } = getEnv();
  syncDailyWindow();
  return { used: dailyCallCount, cap: dailyCallCap };
}

export function getDailyTokenUsage(): { used: number; cap: number } {
  const { dailyTokenCap } = getEnv();
  syncDailyWindow();
  return { used: dailyTokenCount, cap: dailyTokenCap };
}

export function resetAuthStateForTests(): void {
  rateCounters.clear();
  strictRateCounters.clear();
  dailyDateKey = currentDateKey();
  dailyCallCount = 0;
  dailyTokenCount = 0;
}

export function getAuthStateSizesForTests(): {
  rateCounters: number;
} {
  return {
    rateCounters: rateCounters.size,
  };
}

export function seedExpiredAuthEntryForTests(ip: string, expiredAt: number): void {
  rateCounters.set(ip, { count: 1, resetAt: expiredAt });
}
