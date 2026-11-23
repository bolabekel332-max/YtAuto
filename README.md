# Faceless Studio

Aplikasi web multi-agent berbahasa Indonesia untuk merancang paket konten faceless per video pada YouTube (long-form dan Shorts) serta TikTok.

## Arsitektur 3 Lapisan

- `shared/` — Kontrak data Zod, konstanta, registry 8 agent, skema input/output, dan kontrak API.
- `server/` — Server Node.js + Express stateless: validasi, rate limiter, penghitung panggilan harian, PromptBuilder (dengan pembungkus anti prompt-injection), StyleAnalyzer, dan adapter provider (`mock`, `gemini`, `openrouter`, `nous`, `custom`).
- `src/` — Aplikasi React SPA: state global, persistensi `localStorage` tahan-korup (+ fallback in-memory & ekspor/impor JSON), ErrorBoundary, pipeline deterministik dengan dukungan pembatalan (`AbortController`), ekstraksi frame & metrik visual lokal, serta antarmuka 8 halaman + 10 renderer.

## Variabel Lingkungan (Server-Side)

Semua kunci API dan rahasia disimpan di sisi server (`.env` atau panel Secrets), **tidak pernah** dikirim ke browser atau dibundel ke client:

| Nama | Fungsi | Nilai Awal |
| --- | --- | --- |
| `PORT` | Port HTTP server Express | `3000` |
| `TRUST_PROXY` | Pengaturan `trust proxy` Express (`false`, `true`, atau jumlah hop seperti `1` di Cloud Run) | `false` |
| `GEMINI_API_KEY` | Kunci Google Gemini API (`@google/genai`) | Disiapkan server |
| `GEMINI_MODEL_ALLOWLIST` | Daftar opsional ID model Gemini yang diizinkan (dipisah koma) | Kosong (Semua diizinkan) |
| `OPENROUTER_API_KEY` | Kunci opsional OpenRouter API | Kosong (Nonaktif) |
| `NOUS_API_KEY` | Kunci opsional Nous Portal (opsional selain login OAuth di UI) | Kosong (Nonaktif) |
| `NOUS_OAUTH_CLIENT_ID` | Client ID OAuth Device Flow untuk Nous Portal | `hermes-cli` |
| `CUSTOM_API_KEY` | Kunci API opsional provider kustom OpenAI-compatible | Kosong (Nonaktif) |
| `RATE_LIMIT_PER_MIN` | Batas request per menit per IP | `20` |
| `DAILY_CALL_CAP` | Batas panggilan model harian (best-effort di memori server) | `300` |
| `BODY_LIMIT_MB` | Batas ukuran body JSON request (MB) | `10` |

## Menjalankan Aplikasi (Windows & Linux)

```bash
npm install
npm run dev      # Menjalankan Express + Vite dev middleware pada port 3000
npm run lint     # Memeriksa typecheck TypeScript strict
npm test         # Menjalankan suite unit test node:test
npm run build    # Membangun bundel produksi ke dist/
npm start        # Menjalankan server produksi (tsx server.ts --prod)
```

## Menjalankan via Docker / Cloud Run

```bash
docker build -t faceless-studio .
docker run -p 3000:3000 \
  -e GEMINI_API_KEY="..." \
  -e TRUST_PROXY="1" \
  faceless-studio
```

Catatan deployment:
- Pada Google Cloud Run atau di belakang satu reverse proxy HTTPS, set `TRUST_PROXY=1` agar `rateLimiter` membaca IP klien asli dari `X-Forwarded-For`. Tanpa reverse proxy, biarkan `TRUST_PROXY=false`.
- Health check produksi tersedia di `GET /api/healthz` (`{ "ok": true }`).

## Catatan, Privasi & Asumsi Implementasi

1. **Privasi Data Lokal**: Profil channel, pengaturan model, suntingan pengetahuan, dan hingga 30 riwayat run disimpan di browser pengguna (`localStorage`). Video yang diunggah diproses langsung di browser; hanya frame ringkas (JPEG ≤ 768 px) dan metrik numerik yang dikirim saat menganalisis gaya.
2. **Penghitung & Sesi Memori Server**: Rate limiter, token OAuth Nous sementara, dan penghitung batas harian (`DAILY_CALL_CAP`) disimpan di memori proses server (*best-effort*) dan reset saat server restart. Ini bukan pengganti *billing cap* di akun provider.
3. **Deteksi Cut Lokal (`src/style/localMetrics.ts`)**: Menggunakan heuristik deterministik berbasis Mean Absolute Difference (MAD) piksel RGB pada thumbnail `64x36` setiap `0,25` detik (ambang adaptif `meanDiff + 2.0 * stdDev`, minimal `0.12`, jarak antar-cut minimal `0,5` detik). Hasilnya bersifat **perkiraan** dan hanya menjadi acuan bagi model.
4. **Bobot Referensi Gaya Default**: Jika bobot manual belum diatur pengguna, profil referensi digabung dengan bobot relatif seimbang (*equal weights*) sebagai nilai awal netral.
5. **Kepatuhan & Basis Pengetahuan**: Penilaian Kepatuhan bersifat **pemeriksaan heuristik**, bukan jaminan lolos kebijakan platform.
6. **Provider OpenRouter, Nous Portal, & Kustom**: OpenRouter & Nous Portal mendukung katalog model gratis dinamis; provider Kustom tetap nonaktif hingga URL tepercaya ditambahkan ke `BASE_URL_ALLOWLIST` pada `server/config.ts`.
7. **Telemetri Fallback**: Peristiwa fallback model dicatat ke log terstruktur stdout server dan dikembalikan pada respons JSON agar UI dapat menampilkannya.
