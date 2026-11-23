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

let dailyDateKey = currentDateKey();
let dailyCallCount = 0;

function currentDateKey(): string {
  return new Date().toISOString().slice(0, 10);
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

export class DailyCapError extends Error {
  readonly code = 'daily_cap' as const;
  readonly httpStatus = 429;
}

/**
 * Menghitung setiap panggilan model aktual di memori server (best-effort, reset saat server restart).
 * Dipanggil sebelum setiap request ke adapter (termasuk search tahap 1 & 2, retry, fallback, tes).
 */
export function consumeModelCall(): { used: number; cap: number } {
  const { dailyCallCap } = getEnv();
  const today = currentDateKey();
  if (today !== dailyDateKey) {
    dailyDateKey = today;
    dailyCallCount = 0;
  }

  if (dailyCallCount >= dailyCallCap) {
    throw new DailyCapError(
      `Batas panggilan model harian tercapai (${dailyCallCount}/${dailyCallCap}). Penghitung ini berbasis memori server dan akan reset otomatis keesokan hari atau saat server dimulai ulang.`
    );
  }

  dailyCallCount += 1;
  return { used: dailyCallCount, cap: dailyCallCap };
}

export function getDailyCallUsage(): { used: number; cap: number } {
  const { dailyCallCap } = getEnv();
  const today = currentDateKey();
  if (today !== dailyDateKey) {
    dailyDateKey = today;
    dailyCallCount = 0;
  }
  return { used: dailyCallCount, cap: dailyCallCap };
}

export function resetAuthStateForTests(): void {
  rateCounters.clear();
  dailyDateKey = currentDateKey();
  dailyCallCount = 0;
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
