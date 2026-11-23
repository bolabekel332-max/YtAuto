import type { KnowledgeBlock } from '../../shared/schemas';

/**
 * 8 blok pengetahuan awal sesuai BP 11.
 * Semua blok bertanggal 2026-11-22 dan menyertakan catatan bahwa ringkasan awal
 * bersumber dari informasi pihak ketiga dan memerlukan verifikasi ke dokumentasi resmi.
 */
export const DEFAULT_KNOWLEDGE: KnowledgeBlock[] = [
  {
    id: 'yt_surfaces',
    group: 'platformSignals',
    title: 'Permukaan Rekomendasi YouTube & Prioritas Metrik',
    content:
      'YouTube menilai video secara terpisah pada permukaan utama (Home, Suggested, Search, dan Shorts). Prioritas sinyal dapat berbeda di tiap permukaan; bobot spesifik algoritma tidak dipublikasikan secara resmi.',
    verifiedAt: '2026-11-22',
    certainty: 'reported',
    note: 'Ringkasan awal bersumber dari laporan pihak ketiga; bobot sinyal tidak dipublikasikan resmi. Verifikasi ke halaman bantuan resmi YouTube.',
  },
  {
    id: 'yt_longform',
    group: 'platformSignals',
    title: 'Sinyal Performa YouTube Long-Form',
    content:
      'Metrik yang kerap diamati meliputi CTR, retensi penonton, kepuasan penonton (survei/interaksi), kontribusi terhadap durasi sesi menonton, serta keterhubungan seri/playlist. Sumber kreator berbeda pendapat mengenai mana yang lebih dominan antara kepuasan penonton vs watch time mentah.',
    verifiedAt: '2026-11-22',
    certainty: 'creator_observation',
    note: 'Berdasarkan observasi kreator dan ringkasan sekunder; memerlukan verifikasi resmi dan pengujian di channel masing-masing.',
  },
  {
    id: 'yt_shorts',
    group: 'platformSignals',
    title: 'Sinyal & Pembaruan YouTube Shorts',
    content:
      'Indikator yang disorot meliputi rasio swipe-away vs ditonton, tingkat penyelesaian (completion), rewatch, serta penekanan pada orisinalitas konten (sejak 1 Okt 2026). Shorts mendukung durasi hingga 3 menit dan thumbnail kustom.',
    verifiedAt: '2026-11-22',
    certainty: 'reported',
    note: 'Ringkasan sumber sekunder per tanggal verifikasi; periksa dokumentasi resmi YouTube untuk detail syarat terkini.',
  },
  {
    id: 'tt_fyp',
    group: 'platformSignals',
    title: 'Sinyal Distribusi TikTok For You (FYP)',
    content:
      'Mengandalkan interest graph, watch time, completion rate, rewatch, shares, dan saves. Hook 3 detik pertama serta kejelasan teks layar sering memengaruhi retensi awal, sementara konten unggah-ulang (repost) mengalami penurunan distribusi.',
    verifiedAt: '2026-11-22',
    certainty: 'creator_observation',
    note: 'Observasi kreator dan ringkasan pihak ketiga; bobot internal FYP tidak dipublikasikan.',
  },
  {
    id: 'yt_inauthentic',
    group: 'policies',
    title: 'Kebijakan Konten Tidak Autentik YouTube',
    content:
      'Mencakup tiga kategori penilaian konten tidak autentik/berulang dengan evaluasi pada tingkat channel. Menurut ringkasan yang dilaporkan, penggunaan format faceless dan narasi AI (TTS) tidak dilarang selama memberikan nilai tambah dan orisinalitas yang jelas.',
    verifiedAt: '2026-11-22',
    certainty: 'reported',
    note: 'Ringkasan kebijakan dari sumber sekunder; selalu rujuk pedoman resmi Program Partner YouTube sebelum publikasi.',
  },
  {
    id: 'ai_labels',
    group: 'policies',
    title: 'Pelabelan AI & Larangan Peniruan Identitas',
    content:
      'YouTube dan TikTok mewajibkan pengungkapan/label untuk konten sintetis atau yang diubah secara realistis. Penggunaan suara maupun wajah orang nyata tanpa izin dilarang dan berisiko penindakan.',
    verifiedAt: '2026-11-22',
    certainty: 'reported',
    note: 'Ringkasan sumber sekunder; pastikan pemeriksaan manual terhadap pedoman label AI resmi masing-masing platform.',
  },
  {
    id: 'monetization',
    group: 'policies',
    title: 'Ringkasan Arah Monetisasi Platform',
    content:
      'Mencakup penyesuaian syarat monetisasi Shorts yang dilaporkan berlaku mulai Februari 2027, serta ekosistem monetisasi TikTok seperti Creator Rewards, TikTok One, dan TikTok Shop.',
    verifiedAt: '2026-11-22',
    certainty: 'reported',
    note: 'Angka ambang kelayakan spesifik tidak dikarang di sini; periksa halaman resmi kelayakan monetisasi YouTube dan TikTok.',
  },
  {
    id: 'quality_rules',
    group: 'qualityRules',
    title: 'Aturan Kualitas Internal Faceless Studio',
    content:
      'Setiap video wajib memberi nilai tambah nyata, menghindari pola duplikat/video kembar antar-unggahan, tidak menjanjikan viral atau pendapatan, serta menyajikan topik sensitif (kesehatan, hukum, keuangan) sebagai edukasi bersumber dan bukan saran personal.',
    verifiedAt: '2026-11-22',
    certainty: 'house_rule',
    note: 'Aturan mutu internal studio untuk menjaga kualitas dan kepatuhan paket konten.',
  },
];
