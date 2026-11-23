import type { StyleAnalystOutput } from '../shared/agentSchemas';
import type { StyleAnalyzeRequest, StyleAnalyzeResponse } from '../shared/api';
import type { StyleProfile } from '../shared/schemas';
import { runAgent } from './agentRunner';
import type { LLMMediaItem } from './providers/types';
import { AppApiError } from './validation';

/**
 * Menganalisis tepat satu referensi gaya (FR-06):
 * - Link YouTube (dikirim sebagai youtube_url ke provider berkapasitas video)
 * - Video unggahan (key frame JPEG + metrik lokal browser, video asli tidak pernah dikirim)
 * - Gambar unggahan (3-8 gambar)
 * - Deskripsi manual
 */
export async function analyzeReference(
  req: StyleAnalyzeRequest,
  options: { signal?: AbortSignal } = {}
): Promise<StyleAnalyzeResponse> {
  const ref = req.reference;
  const media: LLMMediaItem[] = [];

  if (ref.referenceType === 'youtube_link') {
    if (!ref.youtubeUrl) {
      throw new AppApiError(
        'invalid_request',
        400,
        'URL YouTube wajib diisi untuk referensi bertipe link YouTube.'
      );
    }
    media.push({ type: 'youtube_url', ref: ref.youtubeUrl });
  } else if (ref.referenceType === 'upload_video') {
    if (!ref.framesBase64 || ref.framesBase64.length === 0) {
      throw new AppApiError(
        'invalid_request',
        400,
        'Key frame hasil ekstraksi browser tidak ditemukan. Ulangi ekstraksi atau gunakan screenshot/deskripsi.'
      );
    }
    for (const frame of ref.framesBase64) {
      media.push({
        type: 'image',
        ref: frame.data,
        mime: frame.mimeType || 'image/jpeg',
      });
    }
  } else if (ref.referenceType === 'upload_images') {
    if (!ref.imagesBase64 || ref.imagesBase64.length < 3) {
      throw new AppApiError(
        'invalid_request',
        400,
        'Unggah minimal 3 gambar dan maksimal 8 gambar untuk analisis gaya.'
      );
    }
    for (const img of ref.imagesBase64) {
      media.push({
        type: 'image',
        ref: img.data,
        mime: img.mimeType || 'image/jpeg',
      });
    }
  } else if (ref.referenceType === 'description') {
    if (!ref.descriptionText || ref.descriptionText.trim().length < 10) {
      throw new AppApiError(
        'invalid_request',
        400,
        'Deskripsi manual minimal 10 karakter agar dapat dianalisis.'
      );
    }
  }

  // Kirim metadata & metrik lokal tanpa mengirim ulang base64 sebagai teks prompt
  const promptInputPayload = {
    referenceId: ref.referenceId,
    referenceType: ref.referenceType,
    youtubeUrl: ref.youtubeUrl,
    descriptionText: ref.descriptionText,
    note: ref.note,
    localMetrics: ref.localMetrics,
    frameCountProvided: ref.framesBase64?.length ?? 0,
    imageCountProvided: ref.imagesBase64?.length ?? 0,
  };

  const agentResult = await runAgent(
    {
      agentId: 'style_analyst',
      mode: 'default',
      input: promptInputPayload,
      profile: req.profile,
      knowledge: req.knowledge,
      config: {
        ...req.config,
        agentId: 'style_analyst',
      },
    },
    { media, signal: options.signal }
  );

  const parsedOut = agentResult.output as StyleAnalystOutput;
  const mergedAttributes = structuredClone(parsedOut.attributes);

  // Jangkar nilai metrik lokal browser bila tersedia agar tidak tertimpa angka karangan
  if (ref.localMetrics) {
    if (
      ref.localMetrics.avgShotSec !== null ||
      ref.localMetrics.estimatedCutsPerMin !== null
    ) {
      mergedAttributes.rhythm = {
        value: {
          pattern: mergedAttributes.rhythm.value.pattern,
          avgShotSec: ref.localMetrics.avgShotSec ?? mergedAttributes.rhythm.value.avgShotSec,
          cutsPerMin:
            ref.localMetrics.estimatedCutsPerMin ?? mergedAttributes.rhythm.value.cutsPerMin,
        },
        confidence:
          ref.localMetrics.denseFrameCount >= 12 ? 'medium' : mergedAttributes.rhythm.confidence,
        source: 'local_metric',
      };
    }

    if (ref.localMetrics.dominantColors.length > 0) {
      mergedAttributes.color = {
        value: {
          mood: mergedAttributes.color.value.mood,
          dominantColors: ref.localMetrics.dominantColors,
        },
        confidence: 'medium',
        source: 'local_metric',
      };
    }
  }

  const profileDraft: StyleProfile = {
    id: `style_${Date.now()}`,
    name: parsedOut.suggestedName || `Profil Gaya (${ref.referenceId})`,
    referenceIds: [ref.referenceId],
    weights: { [ref.referenceId]: 1 },
    attributes: mergedAttributes,
    edited: false,
  };

  return {
    profile: profileDraft,
    result: agentResult,
  };
}
