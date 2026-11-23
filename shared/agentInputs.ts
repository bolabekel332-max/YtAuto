import { z } from 'zod';
import {
  MAX_AUDIT_VIDEOS,
  MAX_IMAGES_MAX,
  MAX_IMAGES_MIN,
  MAX_PASTE_CHARS,
  MAX_RECENT_VIDEOS,
} from './constants';
import {
  ChannelProfileSchema,
  PlatformSchema,
  RevisionFeedbackSchema,
  RunInputSchema,
  StyleReferenceTypeSchema,
} from './schemas';
import {
  complianceOut,
  packagingOut,
  researcherOut,
  scriptwriterOut,
  visualOut,
} from './agentSchemas';

export const RecentVideoSchema = z.object({
  title: z.string().min(1),
  hook: z.string(),
  openingPattern: z.string(),
});
export type RecentVideo = z.infer<typeof RecentVideoSchema>;

export const orchestratorIn = z.object({
  runInput: RunInputSchema,
  profile: ChannelProfileSchema,
  stepStatuses: z.record(z.string(), z.string()),
  researchOutput: researcherOut.optional(),
  scriptOutput: scriptwriterOut.optional(),
  visualOutput: visualOut.optional(),
  packagingOutput: packagingOut.optional(),
  complianceOutput: complianceOut.optional(),
  complianceSkipped: z.boolean(),
  recentVideos: z.array(RecentVideoSchema).max(MAX_RECENT_VIDEOS).optional(),
});
export type OrchestratorInput = z.infer<typeof orchestratorIn>;

export const ALLOWED_YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
]);

export function isValidYoutubeUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    return (
      parsed.protocol === 'https:' &&
      ALLOWED_YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export const MediaImagePayloadSchema = z.object({
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  data: z.string().min(1).max(1_500_000),
});

export const researcherIn = z.object({
  targetPlatform: PlatformSchema,
  topic: z.string().max(MAX_PASTE_CHARS).optional(),
  profile: ChannelProfileSchema,
  existingIdeas: z.array(z.string().max(300)).max(50).optional(),
});
export type ResearcherInput = z.infer<typeof researcherIn>;

export const scriptwriterIn = z.object({
  topic: z.string().min(1).max(MAX_PASTE_CHARS),
  targetPlatform: PlatformSchema,
  researchResult: researcherOut.optional(),
  styleHints: z
    .object({
      rhythmPattern: z.string().max(2000).optional(),
      avgShotSec: z.number().nullable().optional(),
      cutsPerMin: z.number().nullable().optional(),
      hookVisual: z.string().max(2000).optional(),
    })
    .optional(),
  revisionFeedback: RevisionFeedbackSchema.optional(),
});
export type ScriptwriterInput = z.infer<typeof scriptwriterIn>;

export const visualIn = z.object({
  script: scriptwriterOut,
  targetPlatform: PlatformSchema,
  styleSummary: z.record(z.string(), z.unknown()).optional(),
  revisionFeedback: RevisionFeedbackSchema.optional(),
});
export type VisualInput = z.infer<typeof visualIn>;

export const packagingIn = z.object({
  topic: z.string().min(1).max(MAX_PASTE_CHARS),
  scriptSummary: z.string().max(MAX_PASTE_CHARS),
  hooks: z.array(z.string().max(1000)).min(1).max(20),
  targetPlatform: PlatformSchema,
  thumbnailStylePattern: z.string().max(2000).optional(),
  revisionFeedback: RevisionFeedbackSchema.optional(),
});
export type PackagingInput = z.infer<typeof packagingIn>;

export const complianceIn = z.object({
  topic: z.string().min(1).max(MAX_PASTE_CHARS),
  targetPlatform: PlatformSchema,
  script: scriptwriterOut,
  visual: visualOut,
  packaging: packagingOut,
  activeStyleReferenceIds: z.array(z.string().max(200)).max(20).optional(),
  styleSummary: z.record(z.string(), z.unknown()).optional(),
  recentVideos: z.array(RecentVideoSchema).max(MAX_RECENT_VIDEOS).optional(),
});
export type ComplianceInput = z.infer<typeof complianceIn>;

export const AuditVideoItemSchema = z.object({
  title: z.string().min(1).max(500),
  summary: z.string().max(MAX_PASTE_CHARS),
  platform: PlatformSchema,
  date: z.string().max(32),
});
export type AuditVideoItem = z.infer<typeof AuditVideoItemSchema>;

export const auditIn = z.object({
  videos: z.array(AuditVideoItemSchema).min(1).max(MAX_AUDIT_VIDEOS),
  activeStyleReferenceIds: z.array(z.string().max(200)).max(20).optional(),
});
export type AuditInput = z.infer<typeof auditIn>;

export const analystIn = z.object({
  targetPlatform: PlatformSchema,
  metricsText: z.string().min(1).max(MAX_PASTE_CHARS),
  period: z.string().max(200).optional(),
});
export type AnalystInput = z.infer<typeof analystIn>;

export const LocalMetricsInputSchema = z.object({
  estimatedCutsPerMin: z.number().nullable(),
  avgShotSec: z.number().nullable(),
  dominantColors: z.array(z.string().max(64)).max(20),
  sampledDurationSec: z.number().min(0),
  denseFrameCount: z.number().int().min(0),
});

export const styleAnalystIn = z.object({
  referenceId: z.string().min(1).max(120),
  referenceType: StyleReferenceTypeSchema,
  youtubeUrl: z
    .string()
    .max(500)
    .refine(isValidYoutubeUrl, {
      message:
        'URL YouTube harus berawalan https:// dengan host youtube.com, www.youtube.com, m.youtube.com, atau youtu.be.',
    })
    .optional(),
  descriptionText: z.string().max(MAX_PASTE_CHARS).optional(),
  note: z.string().max(1000).optional(),
  localMetrics: LocalMetricsInputSchema.optional(),
  framesBase64: z.array(MediaImagePayloadSchema).max(12).optional(),
  imagesBase64: z
    .array(MediaImagePayloadSchema)
    .min(MAX_IMAGES_MIN)
    .max(MAX_IMAGES_MAX)
    .optional(),
});
export type StyleAnalystInput = z.infer<typeof styleAnalystIn>;

export const INPUT_SCHEMAS = {
  orchestrator: orchestratorIn,
  researcher: researcherIn,
  scriptwriter: scriptwriterIn,
  visual: visualIn,
  packaging: packagingIn,
  compliance: complianceIn,
  audit: auditIn,
  analyst: analystIn,
  styleAnalyst: styleAnalystIn,
} as const;

export const SAMPLE_PROFILE_FOR_TEST = {
  niche: 'Sains dan fakta unik',
  sensitiveNiche: false,
  audience: {
    ageRange: '18-24',
    interests: ['Pendidikan', 'Teknologi'],
    level: 'Pemula',
  },
  language: 'Indonesia',
  tone: 'Santai-informatif',
  platform: 'youtube_shorts' as const,
  postingFrequency: '2-3x/minggu',
  targetDuration: '30-60 detik',
  voiceType: 'Narasi AI (TTS)',
  visualStyle: {
    mode: 'template' as const,
    template: 'Footage stok + teks',
  },
};

const SAMPLE_SCRIPT_FOR_TEST = {
  hooks: [
    '[INPUT CONTOH TES] Mengapa jam atom bisa lebih presisi dari rotasi Bumi?',
    '[INPUT CONTOH TES] Jam dinding rumah Anda tidak pernah benar-benar tepat jika diukur per abad.',
    '[INPUT CONTOH TES] Satu detik di gunung ternyata sedikit berbeda dengan di tepi pantai.',
  ],
  script: [
    {
      section: 'Hook',
      durationSec: 4,
      narration: '[INPUT CONTOH TES] Mengapa jam atom bisa lebih presisi dari rotasi Bumi?',
      onScreenText: 'Presisi Jam Atom',
    },
    {
      section: 'Isi Utama',
      durationSec: 32,
      narration:
        '[INPUT CONTOH TES] Jam mekanik mengandalkan ayunan fisik, sedangkan jam atom menghitung getaran alami atom sesium yang sangat stabil.',
      onScreenText: 'Getaran Atom Sesium',
    },
    {
      section: 'Penutup',
      durationSec: 8,
      narration: '[INPUT CONTOH TES] Ikuti pembahasan sains harian untuk eksperimen berikutnya.',
      onScreenText: 'Simpan & Ikuti',
    },
  ],
  cta: 'Tulis topik fisika lain yang ingin dibahas di kolom komentar.',
  estimatedDurationSec: 44,
};

const SAMPLE_VISUAL_FOR_TEST = {
  shotList: [
    {
      no: 1,
      visual: '[INPUT CONTOH TES] B-roll jam mekanik close-up beralih ke ilustrasi kisi atom.',
      assetSource: 'Footage stok berlisensi / animasi grafik sederhana',
      durationSec: 4,
    },
    {
      no: 2,
      visual: '[INPUT CONTOH TES] Diagram perbandingan frekuensi bandul vs getaran sesium.',
      assetSource: 'Motion graphic teks & ikon vektor',
      durationSec: 32,
    },
    {
      no: 3,
      visual: '[INPUT CONTOH TES] Kartu ringkasan 1 kalimat dengan ajakan diskusi.',
      assetSource: 'Template layar penutup channel',
      durationSec: 8,
    },
  ],
  voiceDirection: '[INPUT CONTOH TES] Tempo sedang, artikulasi jelas, intonasi penasaran yang tenang.',
  editingGuide: ['Gunakan cut bersih setiap pergantian ide', 'Jaga ukuran teks layar mudah dibaca'],
  variationNotes: ['Ubah sudut analogi pembuka pada video berikutnya agar tidak repetitif'],
};

const SAMPLE_PACKAGING_FOR_TEST = {
  titles: [
    '[INPUT CONTOH TES] Cara Kerja Jam Atom Dibanding Jam Biasa',
    '[INPUT CONTOH TES] Kenapa 1 Detik Diukur dari Atom Sesium',
    '[INPUT CONTOH TES] Rahasia Waktu Super Presisi di GPS dan Internet',
    '[INPUT CONTOH TES] Perbedaan Rotasi Bumi vs Jam Atom Modern',
    '[INPUT CONTOH TES] Mengapa Jam Terakurat di Dunia Bukan Pakai Roda Gigi',
  ],
  thumbnailConcepts: [
    {
      mainText: '1 DETIK = 9 MILIAR GETARAN',
      visualElements: 'Ilustrasi atom bercahaya sederhana bersebelahan dengan jarum jam',
      colors: 'Biru tua, putih bersih, aksen kuning lembut',
    },
  ],
  captions: ['[INPUT CONTOH TES] Penjelasan singkat mengenai standar pengukuran waktu modern.'],
  keywords: ['jam atom', 'fakta sains', 'pengukuran waktu'],
  hashtags: ['#FaktaSains', '#EdukasiSingkat', '#FisikaSehariHari'],
  playlistSuggestion: 'Seri Sains di Balik Benda Sehari-hari',
};

export const SAMPLE_INPUTS = {
  orchestrator: {
    runInput: {
      topic: '[INPUT CONTOH TES] Cara kerja jam atom',
      targetPlatform: 'youtube_shorts' as const,
      includeResearch: false,
    },
    profile: SAMPLE_PROFILE_FOR_TEST,
    stepStatuses: {
      researcher: 'skipped',
      scriptwriter: 'done',
      visual: 'done',
      packaging: 'done',
      compliance: 'done',
      orchestrator: 'running',
    },
    scriptOutput: SAMPLE_SCRIPT_FOR_TEST,
    visualOutput: SAMPLE_VISUAL_FOR_TEST,
    packagingOutput: SAMPLE_PACKAGING_FOR_TEST,
    complianceOutput: {
      verdict: 'pass' as const,
      issues: [],
      notes: '[INPUT CONTOH TES] Paket edukatif contoh untuk verifikasi Orkestrator.',
    },
    complianceSkipped: false,
    recentVideos: [],
  } satisfies OrchestratorInput,

  researcher: {
    targetPlatform: 'youtube_shorts' as const,
    topic: '[INPUT CONTOH TES] Sains benda sehari-hari yang jarang disadari',
    profile: SAMPLE_PROFILE_FOR_TEST,
    existingIdeas: ['[INPUT CONTOH TES] Kenapa es mengapung di air'],
  } satisfies ResearcherInput,

  scriptwriter: {
    topic: '[INPUT CONTOH TES] Cara kerja jam atom dalam 45 detik',
    targetPlatform: 'youtube_shorts' as const,
    styleHints: {
      rhythmPattern: 'Cepat dan terstruktur per poin',
      avgShotSec: 3.0,
      cutsPerMin: 20,
      hookVisual: 'Teks besar kontras tinggi + B-roll relevan',
    },
  } satisfies ScriptwriterInput,

  visual: {
    script: SAMPLE_SCRIPT_FOR_TEST,
    targetPlatform: 'youtube_shorts' as const,
  } satisfies VisualInput,

  packaging: {
    topic: '[INPUT CONTOH TES] Cara kerja jam atom',
    scriptSummary:
      '[INPUT CONTOH TES] Penjelasan singkat perbedaan jam mekanik dan jam atom sesium.',
    hooks: SAMPLE_SCRIPT_FOR_TEST.hooks,
    targetPlatform: 'youtube_shorts' as const,
    thumbnailStylePattern: 'Teks 3-4 kata berlatar gelap bersih',
  } satisfies PackagingInput,

  compliance: {
    topic: '[INPUT CONTOH TES] Cara kerja jam atom',
    targetPlatform: 'youtube_shorts' as const,
    script: SAMPLE_SCRIPT_FOR_TEST,
    visual: SAMPLE_VISUAL_FOR_TEST,
    packaging: SAMPLE_PACKAGING_FOR_TEST,
    recentVideos: [],
  } satisfies ComplianceInput,

  audit: {
    videos: [
      {
        title: '[INPUT CONTOH TES] Cara Kerja Jam Atom',
        summary: 'Video edukasi singkat tentang getaran atom sesium.',
        platform: 'youtube_shorts' as const,
        date: '2026-11-20',
      },
      {
        title: '[INPUT CONTOH TES] Kenapa Langit Berwarna Biru',
        summary: 'Penjelasan hamburan cahaya Rayleigh untuk pemula.',
        platform: 'youtube_shorts' as const,
        date: '2026-11-21',
      },
    ],
  } satisfies AuditInput,

  analyst: {
    targetPlatform: 'youtube_shorts' as const,
    metricsText:
      '[INPUT CONTOH TES - BUKAN DATA AKUN NYATA]\nJudul,Tayangan,Persentase_Selesai,Swipe_Away\nContoh Video A,1200,62%,38%\nContoh Video B,950,54%,46%',
    period: '7 hari terakhir (data uji)',
  } satisfies AnalystInput,

  styleAnalyst: {
    referenceId: 'sample-ref-test',
    referenceType: 'description' as const,
    descriptionText:
      '[INPUT CONTOH TES] Video edukasi vertikal tempo sedang, potongan tiap 3 detik, teks layar putih tebal di tengah bawah dengan latar gelap lembut, tanpa wajah kreator.',
    note: 'Input uji otomatis untuk verifikasi agent style_analyst.',
  } satisfies StyleAnalystInput,
};
