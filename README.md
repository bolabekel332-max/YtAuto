# Faceless Studio

Aplikasi web multi-agent berbahasa Indonesia untuk merancang paket konten faceless per video pada YouTube (long-form dan Shorts) serta TikTok.

## Arsitektur 3 Lapisan

- `shared/` — Kontrak data Zod, konstanta, registry 8 agent, skema input/output, dan kontrak API.
- `server/` — Server Node.js + Express stateless: validasi, gerbang akses, rate limiter, penghitung panggilan harian, PromptBuilder (dengan proteksi prompt-injection), StyleAnalyzer, dan adapter provider (`mock`, `gemini`, `openrouter`, `custom`).
- `src/` — Aplikasi React SPA: state global, persistensi `localStorage` (+ fallback in-memory & ekspor/impor JSON), pipeline deterministik di browser, ekstraksi frame & metrik visual lokal, serta antarmuka 8 halaman + 10 renderer.

## Variabel Lingkungan (Server-Side)

Semua kunci API dan rahasia disimpan di sisi server (`.env` atau panel Secrets), **tidak pernah** dikirim ke browser atau dibundel ke client:

| Nama | Fungsi | Nilai Awal |
| --- | --- | --- |
| `GEMINI_API_KEY` | Kunci Google Gemini API (`@google/genai`) | Disiapkan AI Studio |
| `OPENROUTER_API_KEY` | Kunci opsional OpenRouter API | Kosong (Nonaktif) |
| `CUSTOM_API_KEY` | Kunci opsional provider kustom OpenAI-compatible | Kosong (Nonaktif) |
| `APP_ACCESS_CODE` | Kode akses gerbang aplikasi (**disarankan minimal 16 karakter**) | Kosong (terbuka + banner peringatan merah) |
| `RATE_LIMIT_PER_MIN` | Batas request per menit per IP (dipasang sebelum gerbang akses) | `20` |
| `DAILY_CALL_CAP` | Batas panggilan model harian (best-effort di memori server) | `300` |
| `BODY_LIMIT_MB` | Batas ukuran body JSON request (MB) | `10` |
| `AUTH_FAIL_LIMIT` | Batas percobaan kode akses gagal per IP per 15 menit | `10` |

## Menjalankan Aplikasi

```bash
npm install
npm run dev      # Menjalankan Express + Vite pada port 3000
npm run lint     # Memeriksa typecheck TypeScript strict
npm run build    # Membangun bundel produksi ke dist/
```

## Catatan & Asumsi Implementasi

1. **Penghitung Memori Server**: Rate limiter, penguncian kegagalan akses (`auth_locked`), dan penghitung batas harian (`DAILY_CALL_CAP`) disimpan di memori proses server (*best-effort*) dan akan reset saat server restart. Ini bukan pengganti batas biaya (*billing cap*) di akun provider.
2. **Deteksi Cut Lokal (`src/style/localMetrics.ts`)**: Menggunakan heuristik deterministik berbasis Mean Absolute Difference (MAD) piksel RGB pada thumbnail `64x36` setiap `0,25` detik (ambang adaptif `meanDiff + 2.0 * stdDev`, minimal `0.12`, jarak antar-cut minimal `0,5` detik). Hasilnya bersifat **perkiraan** dan hanya menjadi acuan bagi model.
3. **Bobot Referensi Gaya Default**: Jika bobot manual belum diatur pengguna, profil referensi digabung dengan bobot relatif seimbang (*equal weights*) sebagai nilai awal netral.
4. **Kepatuhan & Basis Pengetahuan**: Penilaian Kepatuhan bersifat **pemeriksaan heuristik**, bukan jaminan lolos kebijakan platform. Blok pengetahuan awal bersumber dari ringkasan pihak ketiga per `2026-11-22` dan ditandai perlu verifikasi ke dokumentasi resmi.
5. **Provider OpenRouter & Kustom**: Adapter disediakan di sisi server, berstatus nonaktif dan *belum teruji* hingga kunci API tersedia dan (untuk Kustom) URL tepercaya ditambahkan ke `BASE_URL_ALLOWLIST` pada `server/config.ts`.
