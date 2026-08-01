export type AlbumPreviewCard = {
  imageUrl?: string;
  cardTypeText: string;
  previewText?: string;
  createdAtMs: number;
};

export type DeckAlbum = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  coverImageUri?: string;
  cardIds: string[];
  wordCount: number;
  latestCards: AlbumPreviewCard[];
  isDefault?: boolean;
  isNameCustomized?: boolean;
};
