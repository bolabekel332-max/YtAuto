# Faceless Studio

Aplikasi web multi-agent berbahasa Indonesia untuk merancang paket konten faceless per video pada YouTube (long-form dan Shorts) serta TikTok.

## Arsitektur 3 Lapisan

- `shared/` — Kontrak data Zod, konstanta, registry 8 agent, skema input/output, dan kontrak API.
- `server/` — Server Node.js + Express stateless: validasi, rate limiter, penghitung panggilan harian, PromptBuilder (dengan pembungkus anti prompt-injection), StyleAnalyzer, dan adapter provider (`mock`, `gemini`, `openrouter`, `nous`, `apinex`, `custom`).
- `src/` — Aplikasi React SPA: state global, persistensi `localStorage` tahan-korup (+ fallback in-memory & ekspor/impor JSON), ErrorBoundary, pipeline deterministik dengan dukungan pembatalan (`AbortController`), ekstraksi frame & metrik visual lokal, serta antarmuka 8 halaman + 10 renderer.

## Variabel Lingkungan (Server-Side)

Semua kunci API dan rahasia disimpan di sisi server (`.env` atau panel Secrets), **tidak pernah** dikirim ke browser atau dibundel ke client:

| Nama | Fungsi | Nilai Awal |
| --- | --- | --- |
| `PORT` | Port HTTP server Express | `3000` |
| `HOST` | Alamat bind HTTP server (`127.0.0.1` lokal; `0.0.0.0` untuk container/Cloud Run hanya di balik gateway privat) | `127.0.0.1` |
| `TRUST_PROXY` | Pengaturan `trust proxy` Express (`false`, atau jumlah hop numerik seperti `1` di Cloud Run; hindari `true` pada jaringan terbuka) | `false` |
| `GEMINI_API_KEY` | Kunci Google Gemini API (`@google/genai`) | Disiapkan server |
| `GEMINI_MODEL_ALLOWLIST` | Daftar ID model Gemini yang diizinkan (dipisah koma; saat `HOST` non-loopback dan kosong, otomatis dibatasi hanya ke model default `gemini-4-hydrogen`) | Kosong (`gemini-4-hydrogen` saat non-loopback) |
| `OPENROUTER_API_KEY` | Kunci opsional OpenRouter API | Kosong (Nonaktif) |
| `NOUS_API_KEY` | Kunci opsional Nous Portal (opsional selain login OAuth di UI) | Kosong (Nonaktif) |
| `NOUS_OAUTH_CLIENT_ID` | Client ID OAuth Device Flow untuk Nous Portal | `hermes-cli` |
| `ENABLE_NOUS_OAUTH` | Izinkan rute `/api/oauth/nous/*` saat `HOST` non-loopback (`true`/`false`; otomatis aktif jika loopback) | `false` |
| `APINEX_API_KEY` | Kunci opsional APInex (`https://apinex.bond`, format `sk-apx...`) untuk model gratis/berbayar & Web Search | Kosong (Nonaktif) |
| `CUSTOM_API_KEY` | Kunci API opsional provider kustom OpenAI-compatible | Kosong (Nonaktif) |
| `RATE_LIMIT_PER_MIN` | Batas request API umum per menit per IP | `20` |
| `STRICT_RATE_LIMIT_PER_MIN` | Batas ketat per menit per IP untuk rute tes provider, tes agent, daftar model, dan OAuth Nous | `6` |
| `DAILY_CALL_CAP` | Batas panggilan model harian (best-effort di memori server) | `300` |
| `DAILY_TOKEN_CAP` | Batas estimasi token harian (best-effort di memori server) | `2000000` |
| `SERVER_MAX_TOKENS_CAP` | Plafon keras `maxTokens` per panggilan agent di server | `16384` |
| `BODY_LIMIT_MB` | Batas ukuran body JSON request (MB) | `10` |
| `AUTO_FREE_FALLBACK` | Beralih otomatis ke model gratis bawaan provider ketika model berbayar mengembalikan HTTP 402 (`true`/`false`) | `true` |

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
  -e HOST="0.0.0.0" \
  -e GEMINI_API_KEY="..." \
  -e GEMINI_MODEL_ALLOWLIST="gemini-4-hydrogen" \
  -e TRUST_PROXY="1" \
  faceless-studio
```

Peringatan keamanan & deployment:
- Secara bawaan server mengikat ke `127.0.0.1` agar tidak terbuka ke LAN/internet secara tidak sengaja. Aplikasi ini dirancang untuk pemakaian pribadi / tim internal tepercaya dan **tidak memiliki autentikasi pengguna maupun isolasi sesi multi-user**. Jika mengekspos `HOST` non-loopback (`0.0.0.0`, Docker/Cloud Run/VPS), wajib pasang autentikasi di lapis gateway/IAP/VPN. Saat `HOST` non-loopback, endpoint `/api/oauth/nous/*` otomatis dinonaktifkan (404) kecuali `ENABLE_NOUS_OAUTH=true`, dan `GEMINI_MODEL_ALLOWLIST` kosong otomatis dibatasi ke `gemini-4-hydrogen`.
- Pada Google Cloud Run atau di belakang satu reverse proxy HTTPS tepercaya, set `TRUST_PROXY=1` (angka hop spesifik, bukan `true`) agar `rateLimiter` dan `strictRateLimiter` (`STRICT_RATE_LIMIT_PER_MIN`, default `6`/menit/IP) membaca IP klien asli dari `X-Forwarded-For`. Tanpa reverse proxy, biarkan `TRUST_PROXY=false`.
- Health check produksi tersedia di `GET /api/healthz` (`{ "ok": true }`).

## Catatan, Privasi & Asumsi Implementasi

1. **Privasi & Pengiriman Data Pihak Ketiga**: Kunci API (`GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `NOUS_API_KEY`, `APINEX_API_KEY`, `CUSTOM_API_KEY`) dan token OAuth disimpan hanya di server. Profil channel, pengaturan model, suntingan pengetahuan, dan hingga 30 riwayat run disimpan di browser (`localStorage`). Video mentah tetap di browser; **namun** prompt, input topik, ringkasan teks, frame gambar ringkas (JPEG ≤ 768 px), dan kueri pencarian web dikirimkan ke provider AI pihak ketiga yang Anda pilih (Google Gemini, OpenRouter, Nous Portal, **APInex** yang berstatus gateway pihak ketiga belum terverifikasi kebijakan retensinya, atau endpoint Kustom). Gunakan mode `Mock` untuk pengujian tanpa mengirim data ke pihak ketiga.
2. **Penghitung & Sesi Memori Server**: Rate limiter, token OAuth Nous global sementara, dan penghitung batas harian (`DAILY_CALL_CAP` & `DAILY_TOKEN_CAP`) disimpan di memori proses server (*best-effort*) dan reset saat server restart. Ini bukan pengganti *billing cap* di akun provider.
3. **Deteksi Cut Lokal (`src/style/localMetrics.ts`)**: Menggunakan heuristik deterministik berbasis Mean Absolute Difference (MAD) piksel RGB pada thumbnail `64x36` setiap `0,25` detik (ambang adaptif `meanDiff + 2.0 * stdDev`, minimal `0.12`, jarak antar-cut minimal `0,5` detik). Hasilnya bersifat **perkiraan** dan hanya menjadi acuan bagi model.
4. **Bobot Referensi Gaya Default**: Jika bobot manual belum diatur pengguna, profil referensi digabung dengan bobot relatif seimbang (*equal weights*) sebagai nilai awal netral.
5. **Kepatuhan, Skor Ide, & Sumber Grounding**: Penilaian Kepatuhan dan skor ide `0–100` bersifat **perkiraan heuristik**, bukan jaminan lolos kebijakan platform. Tautan sumber pencarian disanitasi (`http:`/`https:`, dedupe, maks 20) langsung dari metadata grounding server (`AgentResult.sources`), bukan dari teks karangan model, dan dapat menyertakan URL pengalihan (redirect) milik provider.
6. **Provider OpenRouter, Nous Portal, APInex, & Kustom**: OpenRouter, Nous Portal, dan APInex mendukung katalog model gratis dinamis; provider Kustom tetap nonaktif hingga URL tepercaya ditambahkan ke `BASE_URL_ALLOWLIST` pada `server/config.ts`. Tes koneksi APInex memverifikasi kunci melalui `/v1/models` namun tidak memeriksa saldo USD.
7. **Auto-Fallback Model Gratis (HTTP 402)**: Bila model berbayar mengembalikan HTTP 402 (*Insufficient Balance*) dan `AUTO_FREE_FALLBACK=true` (bawaan), server mencoba model gratis bawaan provider (`free/gemini-4-hydrogen` untuk APInex, `nvidia/nemotron-3-ultra-550b-a55b:free` untuk OpenRouter, `qwen/qwen4-max:free` untuk Nous) satu kali; bila model gratis tetap gagal 402 atau mengalami error auth/400/404, eksekusi berhenti bersih. Peristiwa fallback dicatat dalam JSON log terstruktur stdout server dan dikembalikan ke UI (`fallbackUsed`, `requestedModel`).
