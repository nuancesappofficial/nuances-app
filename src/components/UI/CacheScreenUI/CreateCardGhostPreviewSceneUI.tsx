import React from 'react';
import { Animated, Image, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import Reanimated, {
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { MODAL_CTA_COLOR, resolveThemeColors } from '../../../theme/colors';

export type GhostPreviewCard = {
  displayWord: string;
  partOfSpeech: string;
  definition: string;
  cultural: string;
  collocationsText: string;
  note: string;
  sourceSentence: string;
  manualMode: boolean;
  isFavorite?: boolean;
  isBookmarked?: boolean;
};

export type PreviewPhase = 'frontThinking' | 'frontReveal' | 'backReveal' | 'complete';

export type PreviewRevealState = {
  showFrontWord: boolean;
  showFrontDefinition: boolean;
  showFrontSentence: boolean;
  showFrontTranslation: boolean;
  showFrontNotes: boolean;
  showBackCollocation: boolean;
  showBackExample: boolean;
  showBackCultural: boolean;
  showBackNote: boolean;
};

export const GHOST_CARD_STATUS_TEXT = [
  'Extracting vocabulary...',
  'Analyzing linguistic context...',
  'Structuring premium flashcard...',
  'Finalizing definitions...',
] as const;

const PREVIEW_TYPE_INTERVAL_MS = 78;
const PREVIEW_TYPE_STEPS = 52;

export function getPreviewTypingDuration(text: string): number {
  const length = Math.max(1, text.length);
  const increment = Math.max(1, Math.ceil(length / PREVIEW_TYPE_STEPS));
  const ticks = Math.ceil(length / increment);
  return ticks * PREVIEW_TYPE_INTERVAL_MS + 180;
}

function collocationsFromText(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

export function buildSentenceTranslationText(card: GhostPreviewCard): string {
  const raw = (card.cultural || '').trim();
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = lines[0] || `${card.displayWord}：${card.definition || 'Generating meaning...'}`;
  const quotedWord = `「${card.displayWord}」`;
  return firstLine.includes(quotedWord) ? firstLine : `${quotedWord}：${firstLine}`;
}

export function buildSentenceNotesText(card: GhostPreviewCard): string {
  const raw = (card.cultural || '').trim();
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1) return lines.slice(1).join('\n');
  if (raw) return raw;
  return card.manualMode ? 'Add your own sentence note.' : 'Context note is being prepared.';
}

export function buildCulturalBackgroundText(card: GhostPreviewCard): string {
  return (card.cultural || '').trim() || 'No cultural background generated.';
}

export function buildExampleSentenceText(card: GhostPreviewCard): string {
  const firstCollocation = collocationsFromText(card.collocationsText)[0] || card.displayWord;
  const baseSentence = (card.sourceSentence || '').trim();
  if (!baseSentence) return `Try using "${firstCollocation}" in a sentence today.`;
  return `A natural example using "${firstCollocation}" is: "${baseSentence}"`;
}

function getGhostCardTone(params: {
  palette: ReturnType<typeof resolveThemeColors>;
  isLight: boolean;
}) {
  const { palette, isLight } = params;
  if (isLight) {
    return {
      pulseShadowColor: '#0F172A',
      chipBg: 'rgba(15,23,42,0.06)',
      chipBorder: 'rgba(15,23,42,0.08)',
      divider: '#E2E8F0',
      statusBg: 'rgba(15,23,42,0.035)',
      statusBorder: 'rgba(15,23,42,0.08)',
      footerBg: 'rgba(15,23,42,0.03)',
      footerBorder: 'rgba(15,23,42,0.08)',
      outlineBase: 0.22,
      outlinePulse: 0.22,
      shadowBase: 0.08,
      shadowPulse: 0.08,
    };
  }

  return {
    pulseShadowColor: MODAL_CTA_COLOR,
    chipBg: '#334155',
    chipBorder: 'rgba(148,163,184,0.22)',
    divider: '#334155',
    statusBg: 'rgba(255,255,255,0.03)',
    statusBorder: 'rgba(148,163,184,0.18)',
    footerBg: 'rgba(255,255,255,0.02)',
    footerBorder: 'rgba(148,163,184,0.18)',
    outlineBase: 0.58,
    outlinePulse: 0.28,
    shadowBase: 0.18,
    shadowPulse: 0.16,
  };
}

function ProgressiveText({
  text,
  active,
  animate = true,
  style,
}: {
  text: string;
  active: boolean;
  animate?: boolean;
  style: any;
}) {
  const [visibleCount, setVisibleCount] = React.useState(active && !animate ? text.length : 0);

  React.useEffect(() => {
    if (!active) {
      setVisibleCount(0);
      return;
    }
    const totalLength = text.length;
    if (!animate) {
      setVisibleCount(totalLength);
      return;
    }
    if (totalLength === 0) {
      setVisibleCount(0);
      return;
    }
    setVisibleCount(0);
    const interval = setInterval(() => {
      setVisibleCount((prev) => {
        const next = Math.min(totalLength, prev + Math.max(1, Math.ceil(totalLength / PREVIEW_TYPE_STEPS)));
        if (next >= totalLength) {
          clearInterval(interval);
        }
        return next;
      });
    }, PREVIEW_TYPE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [active, text]);

  return <Text style={style}>{active ? text.slice(0, visibleCount) : ''}</Text>;
}

export function CreateCardGhostPreviewScene({
  processingWord,
  card,
  palette,
  isLight,
  hasImage,
  imageUri,
  statusText,
  revealState,
  phase,
  isFavorite = false,
  isBookmarked = false,
  onOpenPronunciationModal,
  onToggleFavorite,
  onOpenAlbumSheet,
}: {
  processingWord: string;
  card: GhostPreviewCard | null;
  palette: ReturnType<typeof resolveThemeColors>;
  isLight: boolean;
  hasImage: boolean;
  imageUri: string | null;
  statusText: string;
  revealState: PreviewRevealState;
  phase: PreviewPhase;
  isFavorite?: boolean;
  isBookmarked?: boolean;
  onOpenPronunciationModal?: () => void;
  onToggleFavorite?: () => void;
  onOpenAlbumSheet?: () => void;
}) {
  const frontCaptureRef = React.useRef<View | null>(null);
  const backCaptureRef = React.useRef<View | null>(null);
  const combinedShareRef = React.useRef<View | null>(null);
  const [isSharePickerVisible, setIsSharePickerVisible] = React.useState(false);
  const [shareSelection, setShareSelection] = React.useState<{ front: boolean; back: boolean }>({
    front: true,
    back: false,
  });
  const [sharePreviewUri, setSharePreviewUri] = React.useState<{ front: string | null; back: string | null }>({
    front: null,
    back: null,
  });
  const shareModalAnim = React.useRef(new Animated.Value(0)).current;
  const pulse = useSharedValue(0);
  const tone = React.useMemo(() => getGhostCardTone({ palette, isLight }), [isLight, palette]);
  const ui = React.useMemo(
    () =>
      isLight
        ? {
            icon: '#1F2937',
            folderIcon: '#1F2937',
            starActive: '#EF4444',
            starInactive: '#1F2937',
          }
        : {
            icon: '#94A3B8',
            folderIcon: '#94A3B8',
            starActive: '#EF4444',
            starInactive: '#94A3B8',
          },
    [isLight]
  );
  const previewWord = card?.displayWord || processingWord;
  const previewPartOfSpeech = card?.partOfSpeech || 'Generating';
  const previewDefinition = card?.definition || statusText;
  const previewSourceSentence = card?.sourceSentence || processingWord;
  const previewTranslation = card ? buildSentenceTranslationText(card) : statusText;
  const previewSentenceNotes = card ? buildSentenceNotesText(card) : statusText;
  const previewCollocation = (card ? collocationsFromText(card.collocationsText)[0] : undefined) || previewWord;
  const previewExample = card ? buildExampleSentenceText(card) : statusText;
  const previewCultural = card ? buildCulturalBackgroundText(card) : statusText;
  const previewPersonalNote = card?.note?.trim() || 'No personal note yet.';
  const isThinking = phase === 'frontThinking';
  const backVisible = phase === 'backReveal' || phase === 'complete';
  const shouldAnimateText = phase !== 'complete';

  React.useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400 }), -1, true);
    return () => {
      cancelAnimation(pulse);
    };
  }, [pulse]);

  const animatedCardStyle = useAnimatedStyle(() => {
    const borderTint = tone.outlineBase + pulse.value * tone.outlinePulse;
    return {
      borderColor: `rgba(78,175,244,${borderTint})`,
      shadowOpacity: tone.shadowBase + pulse.value * tone.shadowPulse,
      transform: [{ scale: 0.998 + pulse.value * 0.002 }],
    };
  }, [tone]);

  const captureFacePreview = React.useCallback(async (face: 'front' | 'back') => {
    const ref = face === 'front' ? frontCaptureRef.current : backCaptureRef.current;
    if (!ref) return null;
    try {
      return await captureRef(ref, {
        format: 'png',
        quality: 0.9,
        result: 'tmpfile',
      });
    } catch {
      return null;
    }
  }, []);

  const captureAndShareFace = React.useCallback(
    async (face: 'front' | 'back') => {
      const ref = face === 'front' ? frontCaptureRef.current : backCaptureRef.current;
      if (!ref) return;
      const uri = await captureRef(ref, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      await Share.share({
        url: uri,
        message: `${previewWord} (${face})`,
      });
    },
    [previewWord]
  );

  const openSharePicker = React.useCallback(async () => {
    setIsSharePickerVisible(true);
    const [front, back] = await Promise.all([captureFacePreview('front'), captureFacePreview('back')]);
    setSharePreviewUri({ front, back });
  }, [captureFacePreview]);

  React.useEffect(() => {
    if (!isSharePickerVisible) return;
    shareModalAnim.setValue(0);
    Animated.spring(shareModalAnim, {
      toValue: 1,
      damping: 18,
      stiffness: 240,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [isSharePickerVisible, shareModalAnim]);

  const toggleShareSelection = React.useCallback((key: 'front' | 'back') => {
    setShareSelection((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const submitShareSelection = React.useCallback(async () => {
    const selectedCount = Number(shareSelection.front) + Number(shareSelection.back);
    if (!selectedCount) return;
    setIsSharePickerVisible(false);
    if (shareSelection.front && shareSelection.back && combinedShareRef.current) {
      const uri = await captureRef(combinedShareRef.current, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      await Share.share({
        url: uri,
        message: `${previewWord} (front + back)`,
      });
      return;
    }
    if (shareSelection.front) {
      await captureAndShareFace('front');
      return;
    }
    if (shareSelection.back) {
      await captureAndShareFace('back');
    }
  }, [captureAndShareFace, previewWord, shareSelection.back, shareSelection.front]);

  return (
    <View style={styles.previewScene}>
      <Reanimated.View
        ref={frontCaptureRef}
        collapsable={false}
        style={[styles.previewCardShell, { backgroundColor: palette.containerBg, shadowColor: tone.pulseShadowColor }, animatedCardStyle]}
      >
        {hasImage && imageUri ? <Image source={{ uri: imageUri }} style={styles.previewHeroImage} resizeMode="cover" /> : null}
        <View style={styles.previewBody}>
          <View style={styles.previewHeaderRow}>
            <View style={styles.previewHeaderMain}>
              <Reanimated.View entering={FadeIn.duration(240)}>
                <ProgressiveText text={previewWord} active={revealState.showFrontWord || isThinking} animate={shouldAnimateText} style={[styles.previewWord, { color: palette.textOnContainer }]} />
              </Reanimated.View>
              <Reanimated.View entering={FadeIn.duration(220)} style={[styles.previewPosChip, { backgroundColor: tone.chipBg, borderColor: tone.chipBorder }]}>
                <ProgressiveText text={previewPartOfSpeech} active={revealState.showFrontWord || isThinking} animate={shouldAnimateText} style={[styles.previewPosChipText, { color: palette.secondaryText }]} />
              </Reanimated.View>
            </View>
            <View style={styles.previewAudioWrap}>
              <Ionicons name="volume-medium-outline" size={28} color={palette.secondaryText} />
            </View>
          </View>

          <View style={styles.previewDefinitionRow}>
            <ProgressiveText text={previewDefinition} active={revealState.showFrontDefinition} animate={shouldAnimateText} style={[styles.previewDefinitionText, { color: palette.textOnContainer }]} />
            {isThinking && !revealState.showFrontDefinition ? (
              <View style={[styles.previewStatusSlot, { backgroundColor: tone.statusBg, borderColor: tone.statusBorder }]}>
                <Reanimated.Text key={statusText} entering={FadeIn.duration(280)} exiting={FadeOut.duration(220)} style={[styles.previewStatusText, { color: palette.secondaryText }]}>
                  {statusText}
                </Reanimated.Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.previewDivider, { backgroundColor: tone.divider }]} />

          <View style={styles.previewFrontSection}>
            <ProgressiveText text={previewSourceSentence} active={revealState.showFrontSentence} animate={shouldAnimateText} style={[styles.previewSentenceText, { color: palette.textOnContainer }]} />
            <ProgressiveText text={previewTranslation} active={revealState.showFrontTranslation} animate={shouldAnimateText} style={[styles.previewSentenceText, styles.previewTranslationText, { color: palette.textOnContainer }]} />
          </View>

          <View style={styles.previewSectionBlock}>
            <Reanimated.Text entering={FadeIn.duration(200)} style={[styles.previewSectionLabel, { color: palette.secondaryText }]}>Sentence notes</Reanimated.Text>
            <ProgressiveText text={previewSentenceNotes} active={revealState.showFrontNotes} animate={shouldAnimateText} style={[styles.previewSectionBody, { color: palette.secondaryText }]} />
          </View>

          <View style={styles.previewFooterRow}>
            <Pressable
              style={({ pressed }) => [styles.previewActionIconBtn, pressed ? styles.previewActionIconBtnPressed : null]}
              onPress={onOpenPronunciationModal}
              hitSlop={styles.previewActionHitSlop}
            >
              <Ionicons name="mic-outline" size={28} color={ui.icon} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.previewActionIconBtn, pressed ? styles.previewActionIconBtnPressed : null]}
              onPress={() => void openSharePicker()}
              hitSlop={styles.previewActionHitSlop}
            >
              <Ionicons name="share-outline" size={28} color={ui.icon} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.previewActionIconBtn, pressed ? styles.previewActionIconBtnPressed : null]}
              onPress={onToggleFavorite}
              hitSlop={styles.previewActionHitSlop}
            >
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={28}
                color={isFavorite ? ui.starActive : ui.starInactive}
              />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.previewActionIconBtn, pressed ? styles.previewActionIconBtnPressed : null]}
              onPress={onOpenAlbumSheet}
              hitSlop={styles.previewActionHitSlop}
            >
              <Ionicons
                name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                size={28}
                color={isBookmarked ? '#4EAFF4' : ui.folderIcon}
              />
            </Pressable>
          </View>
        </View>
      </Reanimated.View>

      <Reanimated.View
        ref={backCaptureRef}
        collapsable={false}
        style={[styles.previewCardShell, { backgroundColor: palette.containerBg, shadowColor: tone.pulseShadowColor, opacity: backVisible ? 1 : 0.9 }, animatedCardStyle]}
      >
        <View style={styles.previewBody}>
          <View style={styles.previewSectionBlock}>
            <Text style={[styles.previewSectionLabel, { color: palette.secondaryText }]}>Collocation</Text>
            <ProgressiveText text={`• ${previewCollocation}`} active={revealState.showBackCollocation} animate={shouldAnimateText} style={[styles.previewBackMainText, { color: palette.textOnContainer }]} />
          </View>

          <View style={styles.previewSectionBlock}>
            <Text style={[styles.previewSectionLabel, { color: palette.secondaryText }]}>Example sentence</Text>
            <ProgressiveText text={previewExample} active={revealState.showBackExample} animate={shouldAnimateText} style={[styles.previewBackMainText, { color: palette.textOnContainer }]} />
          </View>

          <View style={[styles.previewDivider, { backgroundColor: tone.divider }]} />

          <View style={styles.previewSectionBlock}>
            <Text style={[styles.previewSectionLabel, { color: palette.secondaryText }]}>Cultural background</Text>
            <ProgressiveText text={previewCultural} active={revealState.showBackCultural} animate={shouldAnimateText} style={[styles.previewSectionBodyStrong, { color: palette.textOnContainer }]} />
          </View>

          <View style={[styles.previewDivider, { backgroundColor: tone.divider }]} />

          <View style={styles.previewSectionBlock}>
            <Text style={[styles.previewSectionLabel, { color: palette.secondaryText }]}>Personal notes</Text>
            <ProgressiveText text={previewPersonalNote} active={revealState.showBackNote} animate={shouldAnimateText} style={[styles.previewSectionBody, { color: palette.textOnContainer }]} />
          </View>
        </View>
      </Reanimated.View>

      <Modal
        visible={isSharePickerVisible}
        transparent
        animationType="none"
        onRequestClose={() => setIsSharePickerVisible(false)}
      >
        <Pressable style={styles.shareModalBackdrop} onPress={() => setIsSharePickerVisible(false)}>
          <Animated.View
            style={[
              styles.shareModalSheet,
              {
                opacity: shareModalAnim,
                transform: [
                  {
                    scale: shareModalAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.92, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable onPress={() => undefined}>
              <Text style={styles.shareModalTitle}>Share screens</Text>
              <View style={styles.sharePreviewRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.sharePreviewCard,
                    pressed ? styles.sharePreviewCardPressed : null,
                  ]}
                  onPress={() => toggleShareSelection('front')}
                >
                  <View style={[styles.sharePreviewMedia, shareSelection.front ? styles.sharePreviewMediaActive : null]}>
                    {sharePreviewUri.front ? (
                      <Image source={{ uri: sharePreviewUri.front }} style={styles.sharePreviewImage} resizeMode="cover" />
                    ) : (
                      <Text style={styles.sharePreviewFallback}>Front</Text>
                    )}
                  </View>
                  <View style={styles.sharePreviewMetaRow}>
                    <Ionicons name={shareSelection.front ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={shareSelection.front ? '#4EAFF4' : '#94A3B8'} />
                    <Text style={styles.sharePreviewLabel}>Front</Text>
                  </View>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.sharePreviewCard,
                    pressed ? styles.sharePreviewCardPressed : null,
                  ]}
                  onPress={() => toggleShareSelection('back')}
                >
                  <View style={[styles.sharePreviewMedia, shareSelection.back ? styles.sharePreviewMediaActive : null]}>
                    {sharePreviewUri.back ? (
                      <Image source={{ uri: sharePreviewUri.back }} style={styles.sharePreviewImage} resizeMode="cover" />
                    ) : (
                      <Text style={styles.sharePreviewFallback}>Back</Text>
                    )}
                  </View>
                  <View style={styles.sharePreviewMetaRow}>
                    <Ionicons name={shareSelection.back ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={shareSelection.back ? '#4EAFF4' : '#94A3B8'} />
                    <Text style={styles.sharePreviewLabel}>Back</Text>
                  </View>
                </Pressable>
              </View>

              <View style={styles.shareActionRow}>
                <Pressable
                  style={({ pressed }) => [styles.shareCancelBtn, pressed ? styles.shareActionBtnPressed : null]}
                  onPress={() => setIsSharePickerVisible(false)}
                >
                  <Text style={styles.shareCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.shareConfirmBtn, pressed ? styles.shareActionBtnPressed : null]}
                  onPress={() => void submitShareSelection()}
                >
                  <Text style={styles.shareConfirmText}>Share</Text>
                </Pressable>
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      <View pointerEvents="none" style={styles.hiddenCombinedCaptureWrap}>
        <View ref={combinedShareRef} collapsable={false} style={styles.combinedCaptureSheet}>
          {sharePreviewUri.front ? (
            <Image source={{ uri: sharePreviewUri.front }} style={styles.combinedCaptureHalf} resizeMode="cover" />
          ) : null}
          {sharePreviewUri.back ? (
            <Image source={{ uri: sharePreviewUri.back }} style={styles.combinedCaptureHalf} resizeMode="cover" />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  previewScene: { gap: 16 },
  previewCardShell: {
    borderWidth: 1,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    shadowOffset: { width: 0, height: 14 },
    shadowRadius: 22,
    elevation: 10,
  },
  previewHeroImage: {
    width: '100%',
    height: 214,
    borderRadius: 18,
    marginBottom: 18,
  },
  previewBody: { flex: 1 },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  previewHeaderMain: { flex: 1, paddingRight: 12 },
  previewWord: { fontSize: 34, fontWeight: '800', lineHeight: 38 },
  previewPosChip: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  previewPosChipText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.35 },
  previewAudioWrap: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  previewDefinitionRow: { marginTop: 18 },
  previewDefinitionText: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
  previewStatusSlot: {
    minHeight: 78,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  previewStatusText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: 0.3,
    opacity: 0.56,
  },
  previewDivider: { marginTop: 18, height: 1, borderRadius: 999 },
  previewFrontSection: { marginTop: 18, gap: 12 },
  previewSentenceText: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  previewTranslationText: { marginTop: 2 },
  previewSectionBlock: { marginTop: 18 },
  previewSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  previewSectionBody: { fontSize: 18, lineHeight: 26, fontWeight: '500' },
  previewSectionBodyStrong: { fontSize: 19, lineHeight: 27, fontWeight: '600' },
  previewBackMainText: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  previewFooterRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 1,
  },
  previewActionIconBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    backgroundColor: 'transparent',
  },
  previewActionIconBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.94 }],
  },
  previewActionHitSlop: {
    top: 10,
    right: 10,
    bottom: 10,
    left: 10,
  },
  shareModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  shareModalSheet: {
    borderRadius: 18,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    padding: 14,
  },
  shareModalTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
  sharePreviewRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sharePreviewCard: {
    flex: 1,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    padding: 0,
  },
  sharePreviewCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  sharePreviewMedia: {
    width: '100%',
    aspectRatio: 0.72,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharePreviewMediaActive: {
    borderWidth: 1,
    borderColor: '#4EAFF4',
  },
  sharePreviewImage: {
    width: '100%',
    height: '100%',
  },
  sharePreviewFallback: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  sharePreviewMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
  },
  sharePreviewLabel: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  shareActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  shareCancelBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  shareCancelText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '600',
  },
  shareConfirmBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#4EAFF4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  shareConfirmText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  shareActionBtnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  hiddenCombinedCaptureWrap: {
    position: 'absolute',
    left: -9999,
    top: -9999,
    opacity: 0,
  },
  combinedCaptureSheet: {
    width: 360,
    backgroundColor: '#0F172A',
    padding: 8,
    gap: 8,
  },
  combinedCaptureHalf: {
    width: '100%',
    height: 540,
    borderRadius: 12,
  },
});
