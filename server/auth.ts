import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ACCESS_CODE_HEADER } from '../shared/constants';
import type { ApiErrorBody } from '../shared/api';
import { getEnv } from './config';

interface WindowCounter {
  count: number;
  resetAt: number;
}

interface AuthFailRecord {
  failures: number;
  windowStart: number;
  lockedUntil: number;
}

const RATE_WINDOW_MS = 60_000;
const AUTH_WINDOW_MS = 15 * 60_000;
const AUTH_LOCK_MS = 15 * 60_000;

const rateCounters = new Map<string, WindowCounter>();
const authFailRecords = new Map<string, AuthFailRecord>();

let dailyDateKey = currentDateKey();
let dailyCallCount = 0;

function currentDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function sendApiError(res: Response, status: number, code: ApiErrorBody['error']['code'], message: string): void {
  const body: ApiErrorBody = {
    error: { code, message },
  };
  res.status(status).json(body);
}

function timingSafeMatch(expected: string, provided: string): boolean {
  const expectedDigest = crypto.createHash('sha256').update(expected).digest();
  const providedDigest = crypto.createHash('sha256').update(provided).digest();
  return crypto.timingSafeEqual(expectedDigest, providedDigest);
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

export function authFailLimiter(ip: string): { locked: boolean; retryAfterSec: number } {
  const now = Date.now();
  const rec = authFailRecords.get(ip);
  if (!rec) return { locked: false, retryAfterSec: 0 };

  if (rec.lockedUntil > now) {
    return {
      locked: true,
      retryAfterSec: Math.ceil((rec.lockedUntil - now) / 1000),
    };
  }

  if (now - rec.windowStart > AUTH_WINDOW_MS) {
    authFailRecords.delete(ip);
    return { locked: false, retryAfterSec: 0 };
  }

  return { locked: false, retryAfterSec: 0 };
}

function recordAuthFailure(ip: string, limit: number): boolean {
  const now = Date.now();
  const existing = authFailRecords.get(ip);

  if (!existing || now - existing.windowStart > AUTH_WINDOW_MS) {
    const lockedUntil = limit <= 1 ? now + AUTH_LOCK_MS : 0;
    authFailRecords.set(ip, { failures: 1, windowStart: now, lockedUntil });
    return lockedUntil > now;
  }

  existing.failures += 1;
  if (existing.failures >= limit) {
    existing.lockedUntil = now + AUTH_LOCK_MS;
    return true;
  }
  return false;
}

export function accessGate(req: Request, res: Response, next: NextFunction): void {
  // Endpoint publik /api/access dikecualikan dari verifikasi kode akses
  if (req.method === 'GET' && (req.path === '/access' || req.originalUrl === '/api/access')) {
    next();
    return;
  }

  const { appAccessCode, authFailLimit } = getEnv();
  if (!appAccessCode) {
    next();
    return;
  }

  const ip = getClientIp(req);
  const lockStatus = authFailLimiter(ip);
  if (lockStatus.locked) {
    sendApiError(
      res,
      429,
      'auth_locked',
      `Terlalu banyak percobaan kode akses gagal. Coba lagi dalam ${lockStatus.retryAfterSec} detik.`
    );
    return;
  }

  const headerValue = req.header(ACCESS_CODE_HEADER);
  const provided = typeof headerValue === 'string' ? headerValue.trim() : '';

  if (!provided || !timingSafeMatch(appAccessCode, provided)) {
    const justLocked = recordAuthFailure(ip, authFailLimit);
    if (justLocked) {
      sendApiError(
        res,
        429,
        'auth_locked',
        'Terlalu banyak percobaan kode akses gagal. Akses dikunci sementara selama 15 menit.'
      );
      return;
    }

    sendApiError(
      res,
      401,
      'unauthorized',
      'Kode akses diperlukan atau tidak valid. Masukkan kode akses yang benar.'
    );
    return;
  }

  authFailRecords.delete(ip);
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
  authFailRecords.clear();
  dailyDateKey = currentDateKey();
  dailyCallCount = 0;
}
