import React from 'react';
import { Image } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { extractTextFromImage, isOCRAvailable, type OCRBlock } from '@services/ocr';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import { logDiagnosticEvent } from '@services/logging/diagnosticsLog';

type UseCacheOcrBackfillArgs = {
  cacheItems: CachedItem[];
  getDetectedPreview: (annotations: unknown) => string | undefined;
};

const MAX_OCR_ITEMS_PER_PASS = 3;

function hasOCRAnnotations(annotations: unknown): boolean {
  if (annotations == null) return false;

  if (Array.isArray(annotations)) {
    return annotations.length > 0;
  }
  if (typeof annotations === 'string') {
    try {
      const parsed = JSON.parse(annotations);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  }
  return false;
}

async function normalizeImageUriForCache(imageUri: string): Promise<string> {
  if (!imageUri) return imageUri;
  try {
    const normalized = await ImageManipulator.manipulateAsync(
      imageUri,
      [],
      { compress: 0.98, format: ImageManipulator.SaveFormat.JPEG }
    );
    return normalized.uri || imageUri;
  } catch (error) {
    void logDiagnosticEvent({
      severity: 'warn',
      category: 'ocr',
      event: 'cache_image_normalize_failed',
      context: { errorName: error instanceof Error ? error.name : 'UnknownError' },
    });
    return imageUri;
  }
}

async function runLocalOCRForPreview(imageUri: string): Promise<OCRBlock[] | undefined> {
  if (!imageUri || !isOCRAvailable()) return undefined;
  try {
    const imageSize = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      Image.getSize(
        imageUri,
        (width, height) => resolve({ width, height }),
        (error) => reject(error)
      );
    });

    const sideInset = Math.round(imageSize.width * 0.04);
    const topInset = Math.round(imageSize.height * 0.12);
    const cropWidth = Math.max(1, imageSize.width - sideInset * 2);
    const cropHeight = Math.max(1, imageSize.height - topInset);

    const cropped = await ImageManipulator.manipulateAsync(
      imageUri,
      [
        {
          crop: {
            originX: sideInset,
            originY: topInset,
            width: cropWidth,
            height: cropHeight,
          },
        },
      ],
      {
        compress: 1,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    const result = await extractTextFromImage(cropped.uri);
    if (!Array.isArray(result.blocks) || result.blocks.length === 0) return undefined;
    return result.blocks;
  } catch (error) {
    void logDiagnosticEvent({
      severity: 'warn',
      category: 'ocr',
      event: 'cache_ocr_preview_failed',
      context: { errorName: error instanceof Error ? error.name : 'UnknownError' },
    });
    return undefined;
  }
}

export function useCacheOcrBackfill({
  cacheItems,
  getDetectedPreview,
}: UseCacheOcrBackfillArgs) {
  const ocrProcessingIdsRef = React.useRef(new Set<string>());
  const ocrSettledIdsRef = React.useRef(new Set<string>());
  const [liveDetectedPreviewById, setLiveDetectedPreviewById] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    const activeIds = new Set(cacheItems.map((item) => item.id));
    for (const id of Array.from(ocrSettledIdsRef.current)) {
      if (!activeIds.has(id)) ocrSettledIdsRef.current.delete(id);
    }
    for (const id of Array.from(ocrProcessingIdsRef.current)) {
      if (!activeIds.has(id)) ocrProcessingIdsRef.current.delete(id);
    }
    setLiveDetectedPreviewById((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(next)) {
        if (!activeIds.has(key)) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [cacheItems]);

  React.useEffect(() => {
    let cancelled = false;

    const runBackfillOCR = async () => {
      const targets = cacheItems
        .filter((item) => {
          const imageUri =
            item.imageStoragePath ||
            item.mediaUri ||
            (item.contentType === 'image' ? item.contentUrl || undefined : undefined);
          if (!imageUri) return false;
          if (hasOCRAnnotations(item.imageAnnotations)) return false;
          if (ocrProcessingIdsRef.current.has(item.id)) return false;
          if (ocrSettledIdsRef.current.has(item.id)) return false;
          return true;
        })
        .sort((a, b) => {
          const aTs = a.createdAt?.getTime?.() ?? 0;
          const bTs = b.createdAt?.getTime?.() ?? 0;
          return bTs - aTs;
        })
        .slice(0, MAX_OCR_ITEMS_PER_PASS);

      for (const item of targets) {
        if (cancelled) return;
        const baseUri =
          item.imageStoragePath ||
          item.mediaUri ||
          (item.contentType === 'image' ? item.contentUrl || undefined : undefined);
        if (!baseUri) continue;

        ocrProcessingIdsRef.current.add(item.id);
        setLiveDetectedPreviewById((prev) => ({ ...prev, [item.id]: 'text scanning...' }));
        try {
          const normalizedUri = await normalizeImageUriForCache(baseUri);
          const ocrBlocks = await runLocalOCRForPreview(normalizedUri);
          if (cancelled) return;

          const detectedPreview = getDetectedPreview(ocrBlocks);
          setLiveDetectedPreviewById((prev) => ({
            ...prev,
            [item.id]: detectedPreview || 'No text recognized',
          }));

          await database.write(async () => {
            await item.update((record) => {
              if ((!record.imageStoragePath || !record.imageStoragePath.startsWith('file://')) && normalizedUri) {
                record.imageStoragePath = normalizedUri;
              }
              record.imageAnnotations = (ocrBlocks || []) as any;
            });
          });
        } catch (error) {
          void logDiagnosticEvent({
            severity: 'warn',
            category: 'ocr',
            event: 'cache_ocr_backfill_failed',
            context: {
              cacheItemId: item.id,
              errorName: error instanceof Error ? error.name : 'UnknownError',
            },
            userId: item.userId,
          });
        } finally {
          ocrProcessingIdsRef.current.delete(item.id);
          ocrSettledIdsRef.current.add(item.id);
        }
      }
    };

    void runBackfillOCR();
    return () => {
      cancelled = true;
    };
  }, [cacheItems, getDetectedPreview]);

  return { liveDetectedPreviewById };
}
