import type { SchemaId } from '../../shared/agentSchemas';

export const FIXTURES: Record<SchemaId, unknown> = {
  orchestrator: {
    finalSummary:
      '[SIMULASI MOCK] Ringkasan kontrol kualitas: Paket video tersusun lengkap dengan alur hook yang konsisten dari naskah, storyboard visual, hingga judul packaging. Tidak ditemukan klaim performa palsu.',
    consistencyNotes: [
      '[SIMULASI MOCK] Hook terpilih selaras dengan segmen pembuka storyboard dan janji judul.',
      '[SIMULASI MOCK] Bahasa serta gaya penyampaian mengikuti Profil Channel aktif.',
    ],
  },
  researcher: {
    nicheMap:
      '[SIMULASI MOCK] Peta topik berfokus pada penjelasan konsep kompleks secara visual dan ringkas untuk penonton pemula hingga menengah tanpa klaim hasil instan.',
    contentPillars: [
      {
        name: '[SIMULASI MOCK] Mekanisme di Balik Benda Sehari-hari',
        description: 'Mengurai cara kerja teknologi atau fenomena yang sering ditemui namun jarang dipahami.',
      },
      {
        name: '[SIMULASI MOCK] Perbandingan Fakta vs Mitos Populer',
        description: 'Meluruskan kesalahpahaman umum menggunakan penjelasan logis dan sumber tepercaya.',
      },
    ],
    series: [
      {
        name: '[SIMULASI MOCK] 60 Detik Paham Sistem',
        format: 'Narasi cepat + diagram teks minimalis',
        platform: 'youtube_shorts',
      },
      {
        name: '[SIMULASI MOCK] Bedah Fakta Tersembunyi',
        format: 'Storytelling visual berurutan',
        platform: 'tiktok',
      },
    ],
    ideas: [
      {
        title: '[SIMULASI MOCK] Mengapa Lampu Lalu Lintas Memakai Warna Merah, Kuning, Hijau',
        reason: 'Relevan dengan audiens luas dan mudah divisualisasikan tanpa wajah.',
        score: 86,
      },
      {
        title: '[SIMULASI MOCK] Bagaimana Kabel Bawah Laut Menghubungkan Internet Antarbenua',
        reason: 'Memiliki elemen rasa ingin tahu tinggi dan cocok untuk grafik peta.',
        score: 82,
      },
      {
        title: '[SIMULASI MOCK] Kenapa Suara Kita Terdengar Berbeda di Rekaman',
        reason: 'Dekat dengan pengalaman sehari-hari dan memicu komentar diskusi.',
        score: 79,
      },
    ],
    calendar: [
      {
        day: 'Senin',
        topic: '[SIMULASI MOCK] Lampu Lalu Lintas dan Sejarah Standar Warna',
        platform: 'youtube_shorts',
      },
      {
        day: 'Rabu',
        topic: '[SIMULASI MOCK] Kabel Internet Bawah Laut',
        platform: 'tiktok',
      },
      {
        day: 'Jumat',
        topic: '[SIMULASI MOCK] Mengapa Suara Rekaman Terdengar Asing',
        platform: 'youtube_shorts',
      },
    ],
    sources: [],
  },
  scriptwriter: {
    hooks: [
      '[SIMULASI MOCK] Pernah sadar kenapa detail kecil ini bekerja tanpa pernah kita perhatikan?',
      '[SIMULASI MOCK] Banyak orang mengira proses ini terjadi otomatis, padahal ada mekanisme unik di baliknya.',
      '[SIMULASI MOCK] Dalam 45 detik ke depan, kita bedah cara kerja sistem ini dari awal sampai akhir.',
    ],
    script: [
      {
        section: 'Hook (0-4 detik)',
        durationSec: 4,
        narration:
          '[SIMULASI MOCK] Pernah sadar kenapa detail kecil ini bekerja tanpa pernah kita perhatikan?',
        onScreenText: 'Mekanisme Tersembunyi',
      },
      {
        section: 'Konteks Masalah (4-15 detik)',
        durationSec: 11,
        narration:
          '[SIMULASI MOCK] Kebanyakan orang hanya melihat hasil akhirnya saja, padahal ada aturan teknis yang menjaga semuanya tetap stabil.',
        onScreenText: 'Bukan Kebetulan',
      },
      {
        section: 'Penjelasan Inti (15-38 detik)',
        durationSec: 23,
        narration:
          '[SIMULASI MOCK] Pertama, sistem memfilter masukan awal. Kedua, komponen utama menyeimbangkan beban agar tidak terjadi kesalahan berulang.',
        onScreenText: '2 Tahap Utama',
      },
      {
        section: 'Penutup & Nilai Tambah (38-45 detik)',
        durationSec: 7,
        narration:
          '[SIMULASI MOCK] Jadi, setiap detail kecil dirancang untuk keandalan. Menurut Anda, sistem sehari-hari apa lagi yang menarik dibahas?',
        onScreenText: 'Tulis di Komentar',
      },
    ],
    cta: '[SIMULASI MOCK] Tulis topik berikutnya yang ingin Anda bedah di komentar.',
    estimatedDurationSec: 45,
  },
  visual: {
    shotList: [
      {
        no: 1,
        visual:
          '[SIMULASI MOCK] Close-up objek sehari-hari dengan transisi cepat ke teks pertanyaan besar di tengah layar.',
        assetSource: 'Rekaman stok netral + overlay tipografi bersih (belum diunduh)',
        durationSec: 4,
      },
      {
        no: 2,
        visual:
          '[SIMULASI MOCK] Diagram alur sederhana dua kolom membandingkan anggapan umum dan cara kerja asli.',
        assetSource: 'Animasi motion graphic 2D sederhana',
        durationSec: 11,
      },
      {
        no: 3,
        visual:
          '[SIMULASI MOCK] Animasi langkah 1 dan langkah 2 dengan sorotan warna kontras pada kata kunci.',
        assetSource: 'Grafik vektor & screen layout bersih',
        durationSec: 23,
      },
      {
        no: 4,
        visual:
          '[SIMULASI MOCK] Ringkasan satu kalimat di atas latar gelap tenang beserta ajakan diskusi.',
        assetSource: 'Template penutup channel',
        durationSec: 7,
      },
    ],
    voiceDirection:
      '[SIMULASI MOCK] Tempo sedang (sekitar 135-150 kata/menit), artikulasi jelas, jeda singkat 0,3 detik sebelum poin inti.',
    editingGuide: [
      '[SIMULASI MOCK] Pertahankan area aman teks agar tidak tertutup UI Shorts/TikTok.',
      '[SIMULASI MOCK] Gunakan transisi cut bersih tanpa efek kilatan berlebihan.',
    ],
    variationNotes: [
      '[SIMULASI MOCK] Ubah struktur visual pembuka dan palet aksen di episode berikutnya agar tidak identik.',
    ],
  },
  packaging: {
    titles: [
      '[SIMULASI MOCK] Cara Kerja Sistem di Balik Kebiasaan Sehari-hari',
      '[SIMULASI MOCK] Mengapa Detail Kecil Ini Sangat Menentukan Hasil Akhir',
      '[SIMULASI MOCK] Bedah Mekanisme Sederhana yang Sering Terlewatkan',
      '[SIMULASI MOCK] Fakta Teknis di Balik Proses yang Terlihat Biasa',
      '[SIMULASI MOCK] Penjelasan Singkat Cara Kerja Teknologi Harian Ini',
    ],
    thumbnailConcepts: [
      {
        mainText: 'CARA KERJA ASLI',
        visualElements: 'Ilustrasi skema dua tahap yang kontras dan bersih',
        colors: 'Latar gelap #0F172A, teks putih #F8FAFC, aksen biru #38BDF8',
      },
      {
        mainText: 'BUKAN KEBETULAN',
        visualElements: 'Perbandingan visual sebelum dan sesudah mekanisme bekerja',
        colors: 'Arang gelap, kuning lembut, putih bersih',
      },
    ],
    captions: [
      '[SIMULASI MOCK] Ringkasan cara kerja mekanisme harian dalam waktu kurang dari satu menit.',
      '[SIMULASI MOCK] Penjelasan edukatif singkat tanpa istilah berbelit.',
    ],
    keywords: ['edukasi singkat', 'cara kerja', 'fakta teknis', 'penjelasan visual'],
    hashtags: ['#Edukasi', '#FaktaSingkat', '#PenjelasanVisual'],
    playlistSuggestion: '[SIMULASI MOCK] Seri Bedah Cara Kerja Sehari-hari',
  },
  compliance: {
    verdict: 'pass',
    issues: [],
    similarityRisks: [
      {
        referenceId: 'simulasi-mock',
        level: 'low',
        reason:
          '[SIMULASI MOCK] Pemeriksaan simulasi: struktur paket bersifat abstrak dan tidak menyalin identitas kreator lain.',
      },
    ],
    notes:
      '[SIMULASI MOCK] Ini adalah output simulasi lokal (bukan hasil pemeriksaan model AI nyata). Tetap lakukan peninjauan manual terhadap kebijakan platform terbaru.',
    sources: [],
  },
  audit: {
    perVideo: [
      {
        title: '[SIMULASI MOCK] Contoh Video Audit',
        riskLevel: 'low',
        reasons: [
          '[SIMULASI MOCK] Judul dan ringkasan menunjukkan topik edukatif yang berbeda dan tidak repetitif.',
        ],
      },
    ],
    variationScore: 78,
    findings: [
      {
        severity: 'low',
        problem: '[SIMULASI MOCK] Pola pembuka video dapat dibuat lebih bervariasi antar-episode.',
        fix: '[SIMULASI MOCK] Variasikan jenis hook antara pertanyaan, kontras data, dan studi kasus.',
      },
    ],
    notes:
      '[SIMULASI MOCK] Hasil audit simulasi ini bukan penilaian kebijakan resmi platform.',
  },
  analyst: {
    diagnosis: [
      {
        finding: '[SIMULASI MOCK] Retensi awal perlu diperhatikan pada 3-5 detik pertama.',
        evidence: 'Berdasarkan pola umum data tempelan contoh (output simulasi).',
        confidence: 'medium',
      },
    ],
    recommendations: [
      '[SIMULASI MOCK] Uji variasi hook yang langsung menunjukkan inti pembahasan di kalimat pertama.',
      '[SIMULASI MOCK] Tambahkan teks layar singkat sebagai jangkar visual di segmen tengah.',
    ],
    testPlan: [
      {
        hypothesis: '[SIMULASI MOCK] Hook berbasis pertanyaan spesifik menurunkan swipe-away awal.',
        change: 'Ubah kalimat pembuka 3 detik pertama pada 3 video berikutnya.',
        successMetric: 'Penurunan angka swipe-away pada data unggahan berikutnya.',
      },
    ],
    dataWarnings: [
      '[SIMULASI MOCK] Output ini berasal dari provider Mock. Gunakan provider AI nyata untuk menganalisis data metrik tempelan Anda secara aktual.',
    ],
  },
  styleAnalyst: {
    suggestedName: '[SIMULASI MOCK] Gaya Visual Edukatif Bersih',
    attributes: {
      rhythm: {
        value: {
          pattern: '[SIMULASI MOCK] Ritme sedang dengan pergantian poin teratur',
          avgShotSec: 3.2,
          cutsPerMin: 18,
        },
        confidence: 'low',
        source: 'model',
      },
      hookVisual: {
        value: '[SIMULASI MOCK] Teks pembuka kontras tinggi di tengah bingkai',
        confidence: 'low',
        source: 'model',
      },
      color: {
        value: {
          mood: 'Gelap profesional dan bersih',
          dominantColors: ['#0F172A', '#38BDF8', '#E2E8F0'],
        },
        confidence: 'low',
        source: 'model',
      },
      onScreenText: {
        value: '[SIMULASI MOCK] Sans-serif tebal ringkas per 1 frasa kunci',
        confidence: 'low',
        source: 'model',
      },
      subtitle: {
        value: '[SIMULASI MOCK] Subtitle terbaca di sepertiga bawah dengan kontras tinggi',
        confidence: 'low',
        source: 'model',
      },
      assets: {
        value: '[SIMULASI MOCK] Kombinasi B-roll netral dan diagram sederhana',
        confidence: 'low',
        source: 'model',
      },
      composition: {
        value: '[SIMULASI MOCK] Fokus objek di tengah dengan ruang aman atas-bawah',
        confidence: 'low',
        source: 'model',
      },
      transitions: {
        value: '[SIMULASI MOCK] Hard cut bersih antar kalimat',
        confidence: 'low',
        source: 'model',
      },
      audio: {
        value: '[SIMULASI MOCK] Narasi tenang dan jelas tanpa musik dominan',
        confidence: 'low',
        source: 'model',
      },
      thumbnail: {
        value: '[SIMULASI MOCK] Maksimal 4 kata utama dengan latar kontras',
        confidence: 'low',
        source: 'model',
      },
    },
  },
};
