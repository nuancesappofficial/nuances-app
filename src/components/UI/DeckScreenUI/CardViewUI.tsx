import React from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing as ReanimatedEasing,
  runOnJS,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type Card from '@database/models/Card';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';
import {
  MODAL_CTA_COLOR,
  SCREEN_BG,
  resolveThemeColors,
} from '../../../theme/colors';
import LightPressable from '../shared/LightPressable';
import type { UILanguage } from '../../../services/settings/userSettings';
import { tUI } from '../../../i18n/uiLanguage';
import BatchActionDockUI from './BatchActionDockUI';

type LearningStatus = {
  label: 'NEW' | 'LEARNING';
  icon: string;
  bgColor: string;
};

type Props = {
  themeColor: string;
  albumName: string;
  uiLanguage: UILanguage;
  processedCards: Card[];
  learnedPercent: number;
  searchQuery: string;
  onChangeSearchQuery: (value: string) => void;
  isSearchVisible: boolean;
  searchInputRef: React.RefObject<TextInput | null>;
  onPressBack: () => void;
  onPressSearch: () => void;
  onPressSort: () => void;
  onPressPlay: () => void;
  onPressReviewTuning: () => void;
  onPressCard: (card: Card) => void;
  onPressMoreCard?: (card: Card) => void;
  cardImageMap: Record<string, string>;
  getWordText: (card: Card) => string;
  getLearningStatus: (card: Card) => LearningStatus | null;
  withHexAlpha: (color: string, alphaHex: string) => string;
  isBatchSelectionActive?: boolean;
  selectedCardIds?: Set<string>;
  onLongPressCard?: (card: Card) => void;
  onToggleSelectCard?: (cardId: string) => void;
  onExitBatchSelection?: () => void;
  onToggleSelectAll?: () => void;
  onPressBatchMove?: () => void;
  onPressBatchDelete?: () => void;
};

export default function CardViewUI({
  themeColor,
  albumName,
  uiLanguage,
  processedCards,
  learnedPercent,
  searchQuery,
  onChangeSearchQuery,
  isSearchVisible,
  searchInputRef,
  onPressBack,
  onPressSearch,
  onPressSort,
  onPressPlay,
  onPressReviewTuning,
  onPressCard,
  onPressMoreCard,
  cardImageMap,
  getWordText,
  getLearningStatus,
  withHexAlpha,
  isBatchSelectionActive = false,
  selectedCardIds,
  onLongPressCard,
  onToggleSelectCard,
  onExitBatchSelection,
  onToggleSelectAll,
  onPressBatchMove,
  onPressBatchDelete,
}: Props) {
  const colorScheme = useColorScheme();
  const palette = React.useMemo(
    () => resolveThemeColors(colorScheme),
    [colorScheme]
  );
  const isLight = colorScheme === 'light';
  const headerIconColor = palette.textOnBg;
  const rowBg = palette.containerBg;
  const rowBorder = palette.borderSubtle;
  const rowText = palette.textOnContainer;
  const rowMuted = palette.secondaryText;
  const { width: screenWidth } = useWindowDimensions();
  const searchProgress = useSharedValue(isSearchVisible ? 1 : 0);
  const searchTranslateX = useSharedValue(isSearchVisible ? 0 : 30);

  const searchOverlayStyle = useAnimatedStyle(() => ({
    opacity: searchProgress.value,
    transform: [{ translateX: searchTranslateX.value }],
  }));

  const focusSearchInput = React.useCallback(() => {
    searchInputRef.current?.focus();
  }, [searchInputRef]);

  React.useEffect(() => {
    const easing = ReanimatedEasing.bezier(0.22, 1, 0.36, 1);
    if (isSearchVisible) {
      searchTranslateX.value = 30;
      searchProgress.value = withTiming(1, { duration: 250, easing });
      searchTranslateX.value = withTiming(0, { duration: 250, easing }, (finished) => {
        if (finished) {
          runOnJS(focusSearchInput)();
        }
      });
    } else {
      searchInputRef.current?.blur();
      searchProgress.value = withTiming(0, { duration: 200, easing });
      searchTranslateX.value = withTiming(30, { duration: 200, easing });
    }
  }, [focusSearchInput, isSearchVisible, searchInputRef, searchProgress, searchTranslateX]);

  const allSelected = React.useMemo(() => {
    if (!processedCards.length || !selectedCardIds) return false;
    return processedCards.every((card) => selectedCardIds.has(card.id));
  }, [processedCards, selectedCardIds]);

  const selectAllLabel = allSelected
    ? tUI(uiLanguage, 'deck.batchDeselectAll')
    : tUI(uiLanguage, 'deck.batchSelectAll');

  const doneLabel = tUI(uiLanguage, 'common.done');

  const listHeader = React.useMemo(
    () => (
      <View style={styles.headerWrap}>
        {isBatchSelectionActive ? (
          <View style={styles.batchTopBar}>
            <Pressable
              style={({ pressed }) => [
                styles.batchTopButton,
                pressed ? styles.iconButtonPressed : null,
              ]}
              onPress={onToggleSelectAll}
              hitSlop={8}
            >
              <Text
                style={[styles.batchTopButtonText, { color: palette.textOnBg }]}
              >
                {selectAllLabel}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.batchTopButton,
                styles.batchDoneButton,
                pressed ? styles.iconButtonPressed : null,
              ]}
              onPress={onExitBatchSelection}
              hitSlop={8}
            >
              <Text
                style={[
                  styles.batchTopButtonText,
                  styles.batchDoneButtonText,
                ]}
              >
                {doneLabel}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.topNavRow}>
            <Pressable
              onPress={onPressBack}
              style={({ pressed }) => [
                styles.iconHitArea,
                pressed ? styles.iconButtonPressed : null,
              ]}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={30} color={headerIconColor} />
            </Pressable>

            <View style={styles.topNavRightRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.rawIconButton,
                  pressed ? styles.iconButtonPressed : null,
                ]}
                onPress={onPressSearch}
                hitSlop={8}
              >
                <Ionicons name="search" size={30} color={headerIconColor} />
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.rawIconButton,
                  pressed ? styles.iconButtonPressed : null,
                ]}
                onPress={onPressSort}
                hitSlop={8}
              >
                <Ionicons
                  name="swap-vertical"
                  size={30}
                  color={headerIconColor}
                />
              </Pressable>
            </View>

            <Reanimated.View
              style={[
                styles.searchOverlayBar,
                {
                  backgroundColor: isLight ? 'rgba(255,255,255,0.96)' : 'rgba(18,29,45,0.95)',
                  borderColor: 'rgba(78,175,244,0.45)',
                },
                searchOverlayStyle,
              ]}
              pointerEvents={isSearchVisible ? 'auto' : 'none'}
            >
              <Ionicons
                name="search"
                size={20}
                color={palette.textOnBg}
                style={styles.searchLeadingIcon}
              />
              <TextInput
                ref={searchInputRef}
                value={searchQuery}
                onChangeText={onChangeSearchQuery}
                placeholder={tUI(uiLanguage, 'deck.searchPlaceholder')}
                placeholderTextColor={palette.secondaryText}
                style={[styles.searchInput, { color: palette.textOnBg }]}
                returnKeyType="search"
              />
              <Pressable
                style={({ pressed }) => [
                  styles.searchCloseButton,
                  pressed ? styles.iconButtonPressed : null,
                ]}
                onPress={onPressSearch}
                hitSlop={8}
              >
                <Ionicons name="close" size={26} color={headerIconColor} />
              </Pressable>
            </Reanimated.View>
          </View>
        )}

        <Text
          style={[styles.titleText, { color: palette.textOnBg }]}
          numberOfLines={1}
        >
          {albumName || tUI(uiLanguage, 'deck.madeForYou')}
        </Text>

        <View style={styles.progressRow}>
          <View
            style={[styles.progressDot, { backgroundColor: palette.textOnBg }]}
          />
          <Text style={[styles.progressText, { color: palette.secondaryText }]}>
            {processedCards.length} {tUI(uiLanguage, 'deck.words')}
          </Text>
        </View>

        <View style={styles.actionButtonsRow}>
          <Pressable
            style={({ pressed }) => [
              styles.playButton,
              { backgroundColor: MODAL_CTA_COLOR },
              pressed ? styles.primaryButtonPressed : null,
            ]}
            onPress={onPressPlay}
          >
            <Ionicons name="play" size={16} color={palette.screenBg} />
            <Text style={[styles.actionButtonText, { color: palette.screenBg }]}>
              {tUI(uiLanguage, 'deck.play')}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.tuningButton,
              {
                backgroundColor: palette.containerBg,
                borderColor: palette.borderSubtle,
              },
              pressed ? styles.iconButtonPressed : null,
            ]}
            onPress={onPressReviewTuning}
          >
            <Ionicons
              name="options-outline"
              size={18}
              color={palette.textOnContainer}
            />
          </Pressable>
        </View>
      </View>
    ),
    [
      albumName,
      doneLabel,
      headerIconColor,
      isBatchSelectionActive,
      isLight,
      isSearchVisible,
      onChangeSearchQuery,
      onExitBatchSelection,
      onPressBack,
      onPressPlay,
      onPressReviewTuning,
      onPressSearch,
      onPressSort,
      onToggleSelectAll,
      palette.borderSubtle,
      palette.containerBg,
      palette.screenBg,
      palette.secondaryText,
      palette.textOnBg,
      palette.textOnContainer,
      processedCards.length,
      searchInputRef,
      searchOverlayStyle,
      searchQuery,
      selectAllLabel,
      uiLanguage,
    ]
  );

  return (
    <View style={styles.screenWrap}>
      <SafeAreaView
        style={[styles.container, { backgroundColor: palette.screenBg }]}
        edges={['top']}
      >
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <LinearGradient
            colors={[
              palette.containerBg,
              withHexAlpha(themeColor, '26'),
              withHexAlpha(themeColor, '1A'),
              isLight ? 'rgba(248,250,252,0.16)' : 'rgba(30,41,59,0.15)',
            ]}
            locations={[0, 0.22, 0.52, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.topThemeGradient}
          />
          <LinearGradient
            colors={
              isLight
                ? [
                    'rgba(241,235,227,0)',
                    'rgba(241,235,227,0.72)',
                    palette.screenBg,
                  ]
                : ['rgba(15,23,42,0)', 'rgba(15,23,42,0.75)', palette.screenBg]
            }
            locations={[0, 0.56, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.bottomBlackGradient}
          />
        </View>
        <FlatList
          data={processedCards}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeader}
          contentContainerStyle={[
            styles.listContent,
            isBatchSelectionActive ? { paddingBottom: 110 } : null,
          ]}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item }) => {
            const status = getLearningStatus(item);
            const imageUri = cardImageMap[item.id];
            const isSelected = selectedCardIds?.has(item.id);

            return (
              <LightPressable
                style={styles.cardRowPressable}
                contentStyle={[
                  styles.cardRow,
                  {
                    backgroundColor: rowBg,
                    borderColor: isSelected ? '#4EAFF4' : rowBorder,
                  },
                ]}
                pressedScale={0.99}
                pressedOpacity={0.96}
                onPress={() => {
                  if (isBatchSelectionActive) {
                    onToggleSelectCard?.(item.id);
                  } else {
                    onPressCard(item);
                  }
                }}
                onLongPress={() => {
                  if (!isBatchSelectionActive) {
                    onLongPressCard?.(item);
                  }
                }}
              >
                <View style={styles.thumbnailWrap}>
                  {imageUri ? (
                    <Image
                      source={{ uri: imageUri }}
                      style={styles.thumbnailImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text
                      style={[styles.thumbnailFallbackText, { color: rowText }]}
                      numberOfLines={1}
                    >
                      {getWordText(item).slice(0, 1)}
                    </Text>
                  )}
                </View>

                <View style={styles.cardMiddle}>
                  <Text
                    style={[styles.wordText, { color: rowText }]}
                    numberOfLines={1}
                  >
                    {getWordText(item)}
                  </Text>

                  {status ? (
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: status.bgColor },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusIcon,
                          status.label === 'NEW' ? styles.statusTextNew : null,
                        ]}
                      >
                        {status.icon}
                      </Text>
                      <Text
                        style={[
                          styles.statusText,
                          status.label === 'NEW' ? styles.statusTextNew : null,
                        ]}
                      >
                        {status.label}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {isBatchSelectionActive ? (
                  <View style={styles.checkboxWrap}>
                    <View
                      style={[
                        styles.checkboxCircle,
                        isSelected
                          ? { backgroundColor: '#4EAFF4', borderColor: '#4EAFF4' }
                          : { borderColor: isLight ? '#CBD5E1' : '#475569' },
                      ]}
                    >
                      {isSelected ? (
                        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </LightPressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text
                style={[styles.emptyText, { color: palette.secondaryText }]}
              >
                {tUI(uiLanguage, 'deck.alertNoWordsTitle')}
              </Text>
            </View>
          }
        />
        <BatchActionDockUI
          visible={Boolean(isBatchSelectionActive)}
          selectedCount={selectedCardIds?.size ?? 0}
          uiLanguage={uiLanguage}
          onPressMove={onPressBatchMove ?? (() => {})}
          onPressDelete={onPressBatchDelete ?? (() => {})}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: SCREEN_BG,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  topThemeGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomBlackGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  headerWrap: {
    paddingTop: 8,
    marginBottom: 8,
  },
  topNavRow: {
    height: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    position: 'relative',
  },
  topNavRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconHitArea: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rawIconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  searchOverlayBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 8,
    zIndex: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  searchCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchLeadingIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 42,
    color: '#FFFFFF',
    paddingVertical: 0,
    fontSize: 15,
  },
  titleText: {
    color: '#F7F8FA',
    fontSize: 34,
    fontWeight: '700',
    marginBottom: 10,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F7F8FA',
  },
  progressText: {
    color: '#E6ECFA',
    fontSize: 14,
    fontWeight: '500',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  playButton: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4EAFF4',
  },
  tuningButton: {
    width: 52,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  actionButtonText: {
    color: '#0F172A',
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardRowPressable: {
    marginBottom: 10,
  },
  thumbnailWrap: {
    width: 68,
    height: 68,
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailImage: {
    ...StyleSheet.absoluteFillObject,
  },
  thumbnailFallbackText: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '700',
  },
  cardMiddle: {
    flex: 1,
    marginLeft: 12,
  },
  wordText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusIcon: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  statusTextNew: {
    color: '#FF6B6B',
  },
  moreWrap: {
    marginLeft: 6,
  },
  moreButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  moreIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 20,
  },
  emptyWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#E6ECFA',
    fontSize: 14,
    fontWeight: '500',
  },
  primaryButtonPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
  iconButtonPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.99 }],
  },
  batchTopBar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  batchTopButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  batchTopButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  batchDoneButton: {},
  batchDoneButtonText: {
    color: '#4EAFF4',
    fontWeight: '700',
  },
  checkboxWrap: {
    marginLeft: 12,
    marginRight: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
