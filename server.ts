import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ApiErrorBody } from './shared/api';
import { getEnv } from './server/config';
import { sanitizeErrorMessage } from './server/providers/types';
import { registerRoutes } from './server/routes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob:",
  'media-src blob:',
  "connect-src 'self'",
  "frame-ancestors 'none'",
].join('; ');

export async function createApp(options: { distDir?: string } = {}) {
  const env = getEnv();
  const app = express();

  app.set('trust proxy', env.trustProxy);

  // Header keamanan manual untuk semua respons
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (env.isProd) {
      res.setHeader('Content-Security-Policy', PRODUCTION_CSP);
    }
    next();
  });

  app.use(express.json({ limit: `${env.bodyLimitMb}mb` }));

  // Tangani payload melebihi BODY_LIMIT_MB dengan kode galat 413 payload_too_large
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const bodyErr = err as { type?: string; status?: number };
    if (bodyErr?.type === 'entity.too.large' || bodyErr?.status === 413) {
      const payload: ApiErrorBody = {
        error: {
          code: 'payload_too_large',
          message: `Ukuran payload melebihi batas server (${env.bodyLimitMb} MB). Kurangi jumlah frame atau ukuran gambar lalu coba lagi.`,
        },
      };
      res.status(413).json(payload);
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      const payload: ApiErrorBody = {
        error: {
          code: 'invalid_request',
          message: 'Format JSON pada body permintaan tidak valid.',
        },
      };
      res.status(400).json(payload);
      return;
    }
    next(err);
  });

  registerRoutes(app);

  if (!env.isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = options.distDir ?? path.resolve(__dirname, 'dist');
    const indexHtmlPath = path.join(distDir, 'index.html');
    if (!fs.existsSync(indexHtmlPath)) {
      console.error(
        `Kesalahan mode produksi: berkas "${indexHtmlPath}" tidak ditemukan. Jalankan "npm run build" terlebih dahulu.`
      );
      process.exit(1);
    }
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(indexHtmlPath);
    });
  }

  return app;
}

const isMainModule =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMainModule) {
  process.on('unhandledRejection', (reason) => {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        scope: 'unhandledRejection',
        message: sanitizeErrorMessage(reason),
      })
    );
  });

  process.on('uncaughtException', (err) => {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        scope: 'uncaughtException',
        message: sanitizeErrorMessage(err),
      })
    );
    process.exit(1);
  });

  const env = getEnv();

  createApp()
    .then((app) => {
      const server = app.listen(env.port, '0.0.0.0', () => {
        console.info(
          `Faceless Studio server (${env.isProd ? 'produksi' : 'pengembangan'}) berjalan di http://0.0.0.0:${env.port}`
        );
      });

      const shutdown = (signal: string) => {
        console.info(`Menerima sinyal ${signal}, menutup server secara anggun...`);
        server.close((closeErr) => {
          if (closeErr) {
            console.error(
              JSON.stringify({
                timestamp: new Date().toISOString(),
                level: 'error',
                scope: 'shutdown',
                message: sanitizeErrorMessage(closeErr),
              })
            );
            process.exit(1);
          }
          process.exit(0);
        });
      };

      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
    })
    .catch((err) => {
      console.error('Gagal memulai server:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
