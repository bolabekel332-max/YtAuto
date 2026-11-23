import type { ChannelProfile } from '../../shared/schemas';

export const SENSITIVE_NICHES = [
  'Berita/pasar/keuangan edukatif',
  'Kesehatan',
  'Hukum edukatif',
] as const;

export function isDefaultSensitiveNiche(niche: string): boolean {
  return (SENSITIVE_NICHES as readonly string[]).includes(niche);
}

export const PROFILE_OPTIONS = {
  niches: [
    'Berita/pasar/keuangan edukatif',
    'Sains dan fakta unik',
    'Teknologi dan AI',
    'Sejarah',
    'Misteri dan storytelling',
    'Bisnis dan produktivitas',
    'Motivasi',
    'Gaming',
    'Kuliner',
    'Kesehatan',
    'Film/ulasan',
    'Hukum edukatif',
    'Lainnya',
  ],
  ageRanges: ['13-17', '18-24', '25-34', '35-44', '45+', 'Campuran', 'Lainnya'],
  interests: [
    'Teknologi',
    'Uang dan investasi',
    'Karier',
    'Hiburan',
    'Pendidikan',
    'Gaya hidup',
    'Olahraga',
    'Otomotif',
    'Parenting',
    'Spiritual',
    'Lainnya',
  ],
  levels: ['Pemula', 'Menengah', 'Ahli', 'Lainnya'],
  languages: ['Indonesia', 'Inggris', 'Campuran', 'Lainnya'],
  tones: [
    'Santai-informatif',
    'Tegas-analitis',
    'Storytelling dramatis',
    'Humor ringan',
    'Edukatif-formal',
    'Motivasional',
    'Lainnya',
  ],
  platforms: [
    { value: 'youtube_long' as const, label: 'YouTube long-form' },
    { value: 'youtube_shorts' as const, label: 'YouTube Shorts' },
    { value: 'tiktok' as const, label: 'TikTok' },
  ],
  postingFrequencies: [
    '1x/minggu',
    '2-3x/minggu',
    'Harian',
    'Lebih dari 1x/hari',
    'Lainnya',
  ],
  targetDurations: [
    'Di bawah 30 detik',
    '30-60 detik',
    '1-3 menit',
    '5-10 menit',
    '10+ menit',
    'Lainnya',
  ],
  voiceTypes: ['Narasi AI (TTS)', 'Voiceover manusia', 'Tanpa suara', 'Lainnya'],
  visualTemplates: [
    'Footage stok + teks',
    'Grafik dan animasi teks',
    'Ilustrasi',
    'Screen recording',
    'Campuran',
    'Berdasarkan referensi kreator',
    'Lainnya',
  ],
} as const;

export interface ProfilePreset {
  id: string;
  name: string;
  description: string;
  profile: ChannelProfile;
}

export const PROFILE_PRESETS: ProfilePreset[] = [
  {
    id: 'edukasi_santai',
    name: 'Edukasi santai',
    description: 'Sains dan fakta unik berdurasi pendek untuk audiens muda pemula.',
    profile: {
      niche: 'Sains dan fakta unik',
      sensitiveNiche: false,
      audience: {
        ageRange: '18-24',
        interests: ['Pendidikan', 'Teknologi'],
        level: 'Pemula',
      },
      language: 'Indonesia',
      tone: 'Santai-informatif',
      platform: 'youtube_shorts',
      postingFrequency: '2-3x/minggu',
      targetDuration: '30-60 detik',
      voiceType: 'Narasi AI (TTS)',
      visualStyle: {
        mode: 'template',
        template: 'Footage stok + teks',
      },
    },
  },
  {
    id: 'berita_analisis_tegas',
    name: 'Berita dan analisis tegas',
    description: 'Berita, pasar, dan keuangan edukatif harian (niche sensitif).',
    profile: {
      niche: 'Berita/pasar/keuangan edukatif',
      sensitiveNiche: true,
      audience: {
        ageRange: '25-34',
        interests: ['Uang dan investasi', 'Karier'],
        level: 'Menengah',
      },
      language: 'Indonesia',
      tone: 'Tegas-analitis',
      platform: 'youtube_shorts',
      postingFrequency: 'Harian',
      targetDuration: '1-3 menit',
      voiceType: 'Narasi AI (TTS)',
      visualStyle: {
        mode: 'template',
        template: 'Grafik dan animasi teks',
      },
    },
  },
  {
    id: 'storytelling_dramatis',
    name: 'Storytelling dramatis',
    description: 'Misteri dan storytelling berdurasi menengah-panjang dengan ilustrasi.',
    profile: {
      niche: 'Misteri dan storytelling',
      sensitiveNiche: false,
      audience: {
        ageRange: '18-24',
        interests: ['Hiburan'],
        level: 'Pemula',
      },
      language: 'Indonesia',
      tone: 'Storytelling dramatis',
      platform: 'youtube_long',
      postingFrequency: '2-3x/minggu',
      targetDuration: '5-10 menit',
      voiceType: 'Narasi AI (TTS)',
      visualStyle: {
        mode: 'template',
        template: 'Ilustrasi',
      },
    },
  },
];
