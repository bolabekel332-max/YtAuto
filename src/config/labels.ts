/**
 * Pemetaan tunggal semua nilai enum internal berbahasa Inggris ke label tampilan Bahasa Indonesia (BP 12.4).
 * UI tidak boleh menampilkan nilai enum mentah seperti running, paused, reject, atau high secara langsung.
 */
export const LABELS: Record<string, string> = {
  // Platform
  youtube_long: 'YouTube Long-Form',
  youtube_shorts: 'YouTube Shorts',
  tiktok: 'TikTok',

  // AgentId & PipelineStepId
  orchestrator: 'Orkestrator',
  researcher: 'Periset',
  scriptwriter: 'Penulis Naskah',
  visual: 'Pengarah Visual',
  packaging: 'Packaging & SEO',
  compliance: 'Kepatuhan',
  analyst: 'Analis Performa',
  style_analyst: 'Analis Gaya Visual',

  // StepState
  idle: 'Menunggu',
  running: 'Sedang Berjalan',
  done: 'Selesai',
  failed: 'Gagal',
  skipped: 'Dilewati',

  // PipelineRunStatus
  paused: 'Dijeda (Ada Kendala)',
  completed: 'Selesai',
  blocked: 'Diblokir Kepatuhan',
  interrupted: 'Terputus',

  // Compliance Verdict
  pass: 'Layak (Lolos)',
  revise: 'Perlu Revisi',
  reject: 'Ditolak',

  // Severity & Confidence & RiskLevel
  high: 'Tinggi',
  medium: 'Sedang',
  low: 'Rendah',

  // Knowledge Group
  platformSignals: 'Sinyal Platform',
  policies: 'Kebijakan',
  qualityRules: 'Aturan Kualitas',

  // Knowledge Certainty
  official: 'Resmi',
  reported: 'Laporan Sekunder',
  creator_observation: 'Observasi Kreator',
  house_rule: 'Aturan Internal',

  // StyleReferenceType
  youtube_link: 'Link YouTube',
  upload_video: 'Unggah Video',
  upload_images: 'Unggah Gambar / Screenshot',
  description: 'Deskripsi Manual',

  // StyleReferenceStatus
  new: 'Belum Dianalisis',
  analyzed: 'Sudah Dianalisis',

  // AttributeSource
  local_metric: 'Metrik Lokal Browser',
  model: 'Analisis Model AI',
  manual: 'Edit Manual',

  // ProviderId
  mock: 'Mock (Simulasi)',
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter',
  nous: 'Nous Portal',
  apinex: 'APInex',
  custom: 'Provider Kustom',

  // JsonMode
  json_schema: 'Skema JSON Ketat',
  json_object: 'Objek JSON',
  prompt_only: 'Instruksi Prompt Saja',

  // SearchMode
  two_step: 'Dua Langkah (Riset -> JSON)',
  single: 'Satu Langkah (Uji)',

  // ApiErrorCode
  invalid_request: 'Permintaan Tidak Valid',
  capability_missing: 'Kemampuan Provider Tidak Tersedia',
  payload_too_large: 'Ukuran Data Terlalu Besar',
  rate_limited: 'Batas Kecepatan Permintaan Tercapai',
  daily_cap: 'Batas Panggilan Harian Tercapai',
  provider_error: 'Gangguan Provider AI',
  output_invalid: 'Format Output Tidak Sesuai Skema',
  output_truncated: 'Output Model Terpotong',
  timeout: 'Batas Waktu Habis',
};

export function label(enumValue: string | undefined | null): string {
  if (!enumValue) return 'Tidak Diketahui';
  return LABELS[enumValue] ?? enumValue;
}
