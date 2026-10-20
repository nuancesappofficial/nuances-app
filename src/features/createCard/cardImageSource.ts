export type CardImageSourceParams = {
  croppedImageUri?: string | null;
  cachedItemImageStoragePath?: string | null;
  routeOriginalImageUri?: string | null;
  cachedItemMediaUri?: string | null;
};

export function resolveCardCroppedImage(
  params: CardImageSourceParams
): string | null {
  return (
    params.croppedImageUri ||
    params.cachedItemImageStoragePath ||
    params.routeOriginalImageUri ||
    params.cachedItemMediaUri ||
    null
  );
}

export function resolveCardOriginalImage(
  params: CardImageSourceParams
): string | null {
  return (
    params.routeOriginalImageUri ||
    params.cachedItemMediaUri ||
    params.croppedImageUri ||
    params.cachedItemImageStoragePath ||
    null
  );
}

export type CardDetailImageCandidatesParams = {
  cachedItemImageStoragePath?: string | null;
  cardImageUrl?: string | null;
  cachedItemMediaUri?: string | null;
};

export function resolveCardDetailImageCandidates(
  params: CardDetailImageCandidatesParams
): string[] {
  return [
    params.cardImageUrl || null,
    params.cachedItemImageStoragePath || null,
    params.cachedItemMediaUri || null,
  ].filter((value): value is string => Boolean(value));
}
