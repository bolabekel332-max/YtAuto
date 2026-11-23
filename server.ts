import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ApiErrorBody } from './shared/api';
import { getEnv } from './server/config';
import { registerRoutes } from './server/routes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createApp() {
  const env = getEnv();
  const app = express();

  // Diperlukan agar req.ip membaca IP klien sebenarnya di balik reverse proxy (Cloud Run / AI Studio)
  app.set('trust proxy', 1);

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

  if (env.nodeEnv !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return app;
}

const isMainModule =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMainModule) {
  const env = getEnv();
  createApp()
    .then((app) => {
      app.listen(env.port, '0.0.0.0', () => {
        console.info(`Faceless Studio server berjalan di http://0.0.0.0:${env.port}`);
      });
    })
    .catch((err) => {
      console.error('Gagal memulai server:', err);
      process.exit(1);
    });
}
