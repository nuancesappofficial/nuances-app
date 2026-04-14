import { supabase } from '@services/supabase/client';
import {
  getLocalCardImageUri,
  persistLocalCardImage,
  persistRemoteCardImage,
} from './localCardImageStore';

function toSignedUrlCandidatePath(rawUri: string): string | null {
  const uri = rawUri.trim();
  if (!uri) return null;

  if (uri.startsWith('file://') || uri.startsWith('/')) return null;

  if (/^https?:\/\//i.test(uri)) {
    const publicMarker = '/storage/v1/object/public/cached-images/';
    const publicIdx = uri.indexOf(publicMarker);
    if (publicIdx >= 0) {
      const encodedPath = uri.slice(publicIdx + publicMarker.length).split('?')[0] || '';
      return decodeURIComponent(encodedPath);
    }

    const signMarker = '/storage/v1/object/sign/cached-images/';
    const signIdx = uri.indexOf(signMarker);
    if (signIdx >= 0) {
      const encodedPath = uri.slice(signIdx + signMarker.length).split('?')[0] || '';
      return decodeURIComponent(encodedPath);
    }
    return null;
  }

  return uri;
}

export async function resolveCardImageUri(params: {
  cardId?: string | null;
  remoteUri?: string | null;
}): Promise<string | null> {
  const normalizedCardId = (params.cardId || '').trim();
  const localUri = await getLocalCardImageUri(params.cardId);
  if (localUri) {
    return localUri;
  }

  const uri = (params.remoteUri || '').trim();
  if (!uri) return null;

  // If caller passes a local path directly, keep it and also persist mapping for stability.
  if (uri.startsWith('file://') || uri.startsWith('/')) {
    if (normalizedCardId) {
      const persisted = await persistLocalCardImage(normalizedCardId, uri);
      return persisted || uri;
    }
    return uri;
  }

  const signPath = toSignedUrlCandidatePath(uri);
  if (!signPath) return uri;

  const { data, error } = await supabase.storage
    .from('cached-images')
    .createSignedUrl(signPath, 60 * 60);

  if (!error && data?.signedUrl) {
    if (normalizedCardId) {
      const cached = await persistRemoteCardImage(normalizedCardId, data.signedUrl);
      if (cached) return cached;
    }
    return data.signedUrl;
  }
  if (error) {
    console.warn('[CardImage] createSignedUrl failed', {
      rawUri: uri,
      signPath,
      signError: error.message,
    });
  }

  const { data: publicData } = supabase.storage.from('cached-images').getPublicUrl(signPath);
  const publicUrl = (publicData?.publicUrl || '').trim();
  if (/^https?:\/\//i.test(publicUrl)) {
    if (normalizedCardId) {
      const cached = await persistRemoteCardImage(normalizedCardId, publicUrl);
      if (cached) return cached;
    }
    return publicUrl;
  }

  console.warn('[CardImage] Failed to resolve signed/public URL for image path', {
    rawUri: uri,
    signPath,
    signError: error?.message,
  });
  return null;
}
