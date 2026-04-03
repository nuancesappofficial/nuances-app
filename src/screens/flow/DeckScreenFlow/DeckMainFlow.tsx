import React from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  measure,
  runOnJS,
  type SharedValue,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { FolderIcon } from '../../../components/UI/DeckScreenUI/FolderIcon';
import CreateAlbumModalUI from '../../../components/UI/DeckScreenUI/CreateAlbumModalUI';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import { resolveCardImageUri } from '@services/media/cardImage';

type Props = {
  navigation: any;
};

type AlbumPreviewCard = {
  imageUrl?: string;
  cardTypeText: string;
  previewText?: string;
  createdAtMs: number;
};

type Album = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  cardIds: string[];
  wordCount: number;
  latestCards: AlbumPreviewCard[];
  isDefault?: boolean;
};

type AlbumGridItemProps = {
  item: Album;
  onPress: (album: Album) => void;
  isMenuVisible: SharedValue<boolean>;
  startX: SharedValue<number>;
  startY: SharedValue<number>;
  hoveredAction: SharedValue<'none' | 'edit' | 'delete'>;
  activeAlbumId: string | null;
  onMenuStart: (album: Album, layout: { x: number; y: number; width: number; height: number }) => void;
  onMenuFinish: () => void;
  onActionEnd: (album: Album, action: 'none' | 'edit' | 'delete') => void;
};

const ELEGANT_SPRING = { damping: 30, stiffness: 140, mass: 1 } as const;
const MENU_BUTTON_HALF_SIZE = 25;
const MENU_BUTTON_OFFSET_X = 45;
const MENU_MIN_TOP = 72;
const WINDOW_WIDTH = Dimensions.get('window').width || 390;

function triggerSelectionHaptic() {
  void Haptics.selectionAsync();
}

function canUseSFSymbolsOnDevice() {
  if (Platform.OS !== 'ios') return false;
  const version =
    typeof Platform.Version === 'string'
      ? parseInt(Platform.Version.split('.')[0] || '0', 10)
      : Platform.Version;
  return Number.isFinite(version) && version >= 17;
}

function MenuSymbol({
  name,
  color,
  fallback,
}: {
  name: 'square.and.pencil' | 'trash.fill';
  color: string;
  fallback: string;
}) {
  if (!canUseSFSymbolsOnDevice()) {
    return <Text style={{ fontSize: 22 }}>{fallback}</Text>;
  }

  return (
    <SymbolView
      name={name}
      size={22}
      tintColor={color}
      type="hierarchical"
      style={{ width: 22, height: 22 }}
      fallback={<Text style={{ fontSize: 22 }}>{fallback}</Text>}
    />
  );
}

function AlbumGridItem({
  item,
  onPress,
  isMenuVisible,
  startX,
  startY,
  hoveredAction,
  activeAlbumId,
  onMenuStart,
  onMenuFinish,
  onActionEnd,
}: AlbumGridItemProps) {
  const cardRef = useAnimatedRef<Reanimated.View>();
  const isActive = useSharedValue(0);
  const liftScale = useSharedValue(1);

  const albumContainerStyle = useAnimatedStyle(() => ({
    zIndex: isActive.value ? 50 : 1,
    transform: [{ scale: withSpring(isActive.value ? 1.05 : 1, ELEGANT_SPRING) }, { scale: liftScale.value }],
  }));

  const gesture = Gesture.Pan()
    .activateAfterLongPress(250)
    .onStart((e) => {
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Heavy);
      isActive.value = 1;
      liftScale.value = withSpring(1.02, ELEGANT_SPRING);
      isMenuVisible.value = true;
      hoveredAction.value = 'none';

      const measured = measure(cardRef);
      if (measured) {
        const anchorX = Math.min(
          WINDOW_WIDTH - (MENU_BUTTON_HALF_SIZE + MENU_BUTTON_OFFSET_X + 8),
          Math.max(MENU_BUTTON_HALF_SIZE + MENU_BUTTON_OFFSET_X + 8, measured.pageX + measured.width / 2)
        );
        const anchorY = Math.max(MENU_MIN_TOP, measured.pageY - 16);
        startX.value = anchorX;
        startY.value = anchorY;

        runOnJS(onMenuStart)(item, {
          x: measured.pageX,
          y: measured.pageY,
          width: measured.width,
          height: measured.height,
        });
      } else {
        startX.value = e.absoluteX;
        startY.value = Math.max(MENU_MIN_TOP, e.absoluteY - 16);
      }
    })
    .onUpdate((e) => {
      const editX = startX.value - MENU_BUTTON_OFFSET_X;
      const editY = startY.value;
      const deleteX = startX.value + MENU_BUTTON_OFFSET_X;
      const deleteY = startY.value;
      const radius = 40;

      const editDistance = Math.hypot(e.absoluteX - editX, e.absoluteY - editY);
      const deleteDistance = Math.hypot(e.absoluteX - deleteX, e.absoluteY - deleteY);

      let nextAction: 'none' | 'edit' | 'delete' = 'none';
      if (editDistance <= radius) nextAction = 'edit';
      if (deleteDistance <= radius) nextAction = 'delete';

      if (nextAction !== hoveredAction.value) {
        hoveredAction.value = nextAction;
        if (nextAction === 'edit' || nextAction === 'delete') {
          runOnJS(triggerSelectionHaptic)();
        }
      }
    })
    .onEnd(() => {
      const action = hoveredAction.value;
      isMenuVisible.value = false;
      hoveredAction.value = 'none';
      isActive.value = 0;
      liftScale.value = withSpring(1, ELEGANT_SPRING);
      runOnJS(onMenuFinish)();
      runOnJS(onActionEnd)(item, action);
    })
    .onFinalize(() => {
      isMenuVisible.value = false;
      hoveredAction.value = 'none';
      isActive.value = 0;
      liftScale.value = withSpring(1, ELEGANT_SPRING);
      runOnJS(onMenuFinish)();
    });

  return (
    <GestureDetector gesture={gesture}>
      <Reanimated.View
        ref={cardRef}
        style={[styles.albumItem, albumContainerStyle, activeAlbumId === item.id ? styles.activeAlbumHidden : null]}
      >
        <TouchableOpacity style={styles.albumPressArea} activeOpacity={0.92} onPress={() => onPress(item)}>
          <FolderIcon
            title={item.name}
            wordCount={item.wordCount}
            latestCards={item.latestCards}
            style={styles.folderIcon}
          />
        </TouchableOpacity>
      </Reanimated.View>
    </GestureDetector>
  );
}

function ActionMenuOverlay({
  isMenuVisible,
  startX,
  startY,
  hoveredAction,
  activeAlbum,
  activeLayout,
}: {
  isMenuVisible: SharedValue<boolean>;
  startX: SharedValue<number>;
  startY: SharedValue<number>;
  hoveredAction: SharedValue<'none' | 'edit' | 'delete'>;
  activeAlbum: Album | null;
  activeLayout: { x: number; y: number; width: number; height: number } | null;
}) {
  const { width: windowWidth, height: windowHeight } = Dimensions.get('window');
  const AnimatedBlurView = React.useMemo(() => Reanimated.createAnimatedComponent(BlurView), []);

  const blurStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: -windowHeight,
    bottom: -windowHeight,
    left: -windowWidth,
    right: -windowWidth,
    opacity: withTiming(isMenuVisible.value ? 1 : 0, { duration: 160 }),
  }));

  const editButtonStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isMenuVisible.value ? 1 : 0, { duration: 120 }),
    transform: [{ scale: withSpring(hoveredAction.value === 'edit' ? 1.5 : 1, ELEGANT_SPRING) }],
    left: startX.value - MENU_BUTTON_OFFSET_X - MENU_BUTTON_HALF_SIZE,
    top: startY.value - MENU_BUTTON_HALF_SIZE,
  }));

  const deleteButtonStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isMenuVisible.value ? 1 : 0, { duration: 120 }),
    transform: [{ scale: withSpring(hoveredAction.value === 'delete' ? 1.5 : 1, ELEGANT_SPRING) }],
    left: startX.value + MENU_BUTTON_OFFSET_X - MENU_BUTTON_HALF_SIZE,
    top: startY.value - MENU_BUTTON_HALF_SIZE,
  }));

  const cloneStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isMenuVisible.value ? 1 : 0, { duration: 120 }),
    transform: [{ scale: withSpring(isMenuVisible.value ? 1.06 : 1, ELEGANT_SPRING) }],
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <AnimatedBlurView
        tint="dark"
        intensity={100}
        pointerEvents="none"
        style={[styles.menuBlurLayer, blurStyle]}
      />
      <Reanimated.View style={[styles.menuDimLayer, blurStyle]} />

      {activeAlbum && activeLayout ? (
        <Reanimated.View
          style={[
            styles.activeAlbumClone,
            cloneStyle,
            {
              top: activeLayout.y,
              left: activeLayout.x,
              width: activeLayout.width,
              height: activeLayout.height,
            },
          ]}
        >
          <FolderIcon
            title={activeAlbum.name}
            wordCount={activeAlbum.wordCount}
            latestCards={activeAlbum.latestCards}
            style={styles.activeAlbumCloneInner}
          />
        </Reanimated.View>
      ) : null}

      <Reanimated.View style={[styles.floatingActionButton, styles.menuButtonLayer, editButtonStyle]}>
        <MenuSymbol name="square.and.pencil" color="#1C1C1E" fallback="✏️" />
      </Reanimated.View>

      <Reanimated.View style={[styles.floatingActionButton, styles.menuButtonLayer, deleteButtonStyle]}>
        <MenuSymbol name="trash.fill" color="#FF3B30" fallback="🗑️" />
      </Reanimated.View>
    </View>
  );
}

function getTagsArray(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return tags
      .filter((tag): tag is string => typeof tag === 'string')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  if (typeof tags === 'string') {
    const trimmed = tags.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((tag): tag is string => typeof tag === 'string')
          .map((tag) => tag.trim())
          .filter(Boolean);
      }
    } catch {
      return trimmed
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function buildPreviewCards(cards: Card[], cardImageMap: Record<string, string>): AlbumPreviewCard[] {
  return cards.slice(0, 3).map((card) => {
    const imageUrl = cardImageMap[card.id];
    return {
      ...(imageUrl ? { imageUrl } : {}),
      cardTypeText: card.partOfSpeech || 'word',
      previewText: (card.targetWord || card.definition || 'card').trim(),
      createdAtMs: new Date(card.createdAt).getTime(),
    };
  });
}

export default function DeckScreen({ navigation }: Props) {
  const [allCards, setAllCards] = React.useState<Card[]>([]);
  const [cardImageMap, setCardImageMap] = React.useState<Record<string, string>>({});
  const [imageReloadSeed, setImageReloadSeed] = React.useState(0);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [sortOrder, setSortOrder] = React.useState<'desc' | 'asc'>('desc');
  const [isModalVisible, setIsModalVisible] = React.useState(false);
  const [newAlbumName, setNewAlbumName] = React.useState('');
  const [customAlbums, setCustomAlbums] = React.useState<Album[]>([]);
  const [albumNameOverrides, setAlbumNameOverrides] = React.useState<Record<string, string>>({});
  const [deletedAlbumIds, setDeletedAlbumIds] = React.useState<string[]>([]);
  const [activeAlbum, setActiveAlbum] = React.useState<Album | null>(null);
  const [activeLayout, setActiveLayout] = React.useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const isMenuVisible = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const hoveredAction = useSharedValue<'none' | 'edit' | 'delete'>('none');

  const filterPills = ['群組', '隱私', '已封存'];

  React.useEffect(() => {
    const queryCards = database
      .get<Card>('cards')
      .query(Q.where('deleted_at', null), Q.sortBy('created_at', Q.desc));

    const load = async () => {
      try {
        const data = await queryCards.fetch();
        setAllCards(data);
      } catch (error) {
        console.error('[Deck] load cards failed:', error);
        setAllCards([]);
      }
    };

    void load();
    const sub = queryCards.observe().subscribe((data) => setAllCards(data));
    return () => sub.unsubscribe();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      setImageReloadSeed((prev) => prev + 1);
    }, [])
  );

  React.useEffect(() => {
    const timer = setInterval(() => {
      setImageReloadSeed((prev) => prev + 1);
    }, 25 * 60 * 1000);

    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const loadCardImages = async () => {
      const nextMap: Record<string, string> = {};
      await Promise.all(
        allCards.map(async (card) => {
          const uri = await resolveCardImageUri({
            cardId: card.id,
            remoteUri: card.imageUrl,
          });
          if (card.imageUrl && !uri) {
            console.warn('[DeckMain] card image resolve failed', {
              cardId: card.id,
              imageUrl: card.imageUrl,
            });
          }
          if (uri) {
            nextMap[card.id] = uri;
          }
        })
      );
      console.log('[DeckMain] card image map size:', {
        allCards: allCards.length,
        mapped: Object.keys(nextMap).length,
      });

      if (!cancelled) {
        setCardImageMap(nextMap);
      }
    };

    void loadCardImages();

    return () => {
      cancelled = true;
    };
  }, [allCards, imageReloadSeed]);

  const albums = React.useMemo<Album[]>(() => {
    const slangCards: Card[] = [];
    const cultureCards: Card[] = [];
    const workCards: Card[] = [];

    allCards.forEach((card) => {
      const tags = getTagsArray(card.tags).map((t) => t.toLowerCase());
      const albumTagIds = tags
        .filter((tag) => tag.startsWith('album:'))
        .map((tag) => tag.slice('album:'.length).trim());
      const source = (card.sourceApp || '').toLowerCase();
      const text = `${card.targetWord || ''} ${card.definition || ''}`.toLowerCase();

      if (
        tags.some((t) => ['slang', 'internet', 'social'].includes(t)) ||
        albumTagIds.includes('slang') ||
        /slang|internet|meme/.test(text)
      ) {
        slangCards.push(card);
      }

      if (
        tags.some((t) => ['culture', 'pop', 'movie'].includes(t)) ||
        albumTagIds.includes('culture') ||
        /culture|movie|music|pop/.test(text)
      ) {
        cultureCards.push(card);
      }

      if (
        tags.some((t) => ['work', 'business', 'office'].includes(t)) ||
        albumTagIds.includes('work') ||
        /work|business|office/.test(text) ||
        source.includes('slack')
      ) {
        workCards.push(card);
      }
    });

    return [
      {
        id: 'all',
        name: 'All cards',
        emoji: '📌',
        color: '#1B1B1F',
        cardIds: allCards.map((card) => card.id),
        wordCount: allCards.length,
        latestCards: buildPreviewCards(allCards, cardImageMap),
        isDefault: true,
      },
      {
        id: 'slang',
        name: 'Internet Slang',
        emoji: '💬',
        color: '#1B1B1F',
        cardIds: Array.from(new Set(slangCards.map((card) => card.id))),
        wordCount: slangCards.length,
        latestCards: buildPreviewCards(slangCards, cardImageMap),
      },
      {
        id: 'culture',
        name: 'Pop Culture',
        emoji: '🎬',
        color: '#1B1B1F',
        cardIds: Array.from(new Set(cultureCards.map((card) => card.id))),
        wordCount: cultureCards.length,
        latestCards: buildPreviewCards(cultureCards, cardImageMap),
      },
      {
        id: 'work',
        name: 'Work Phrases',
        emoji: '💼',
        color: '#1B1B1F',
        cardIds: Array.from(new Set(workCards.map((card) => card.id))),
        wordCount: workCards.length,
        latestCards: buildPreviewCards(workCards, cardImageMap),
      },
    ];
  }, [allCards, cardImageMap]);

  const mergedAlbums = React.useMemo(() => {
    const allMerged = [...albums, ...customAlbums].map((album) => ({
      ...album,
      name: albumNameOverrides[album.id] || album.name,
    }));

    return allMerged.filter((album) => !deletedAlbumIds.includes(album.id));
  }, [albums, customAlbums, albumNameOverrides, deletedAlbumIds]);

  const processedAlbums = React.useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    let result = [...mergedAlbums];

    if (keyword) {
      result = result.filter((album) => {
        const inName = album.name.toLowerCase().includes(keyword);
        const inCards = album.latestCards.some(
          (card) =>
            card.previewText?.toLowerCase().includes(keyword) ||
            card.cardTypeText.toLowerCase().includes(keyword)
        );
        return inName || inCards;
      });
    }

    result.sort((a, b) => {
      const aLatest = a.latestCards[0]?.createdAtMs ?? 0;
      const bLatest = b.latestCards[0]?.createdAtMs ?? 0;
      return sortOrder === 'desc' ? bLatest - aLatest : aLatest - bLatest;
    });

    return result;
  }, [mergedAlbums, searchQuery, sortOrder]);

  const handleAddAlbum = React.useCallback(() => {
    const trimmedName = newAlbumName.trim();
    if (!trimmedName) return;

    const newAlbum: Album = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmedName,
      emoji: '📁',
      color: '#E5E5EA',
      cardIds: [],
      wordCount: 0,
      latestCards: [],
    };

    setCustomAlbums((prev) => [newAlbum, ...prev]);
    setIsModalVisible(false);
    setNewAlbumName('');
  }, [newAlbumName]);

  const handleAlbumPress = React.useCallback(
    (album: Album) => {
      navigation.navigate('AlbumView', { album, isDefault: album.isDefault });
    },
    [navigation]
  );

  const handleRenameAlbum = React.useCallback((album: Album) => {
    Alert.prompt(
      '重命名相簿',
      '請輸入新名稱',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '確認',
          onPress: (name?: string) => {
            const nextName = (name || '').trim();
            if (!nextName) return;

            if (album.isDefault) {
              Alert.alert('無法重命名', '預設相簿不可重命名。');
              return;
            }

            const isCustomAlbum = customAlbums.some((it) => it.id === album.id);
            if (isCustomAlbum) {
              setCustomAlbums((prev) =>
                prev.map((it) => (it.id === album.id ? { ...it, name: nextName } : it))
              );
            } else {
              setAlbumNameOverrides((prev) => ({ ...prev, [album.id]: nextName }));
            }
          },
        },
      ],
      'plain-text',
      album.name
    );
  }, [customAlbums]);

  const handleDeleteAlbum = React.useCallback((album: Album) => {
    if (album.isDefault) {
      Alert.alert('無法刪除', 'All cards 是預設相簿，不能刪除。');
      return;
    }

    Alert.alert('刪除相簿', `確定要刪除「${album.name}」嗎？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: () => {
          const isCustomAlbum = customAlbums.some((it) => it.id === album.id);
          if (isCustomAlbum) {
            setCustomAlbums((prev) => prev.filter((it) => it.id !== album.id));
          } else {
            setDeletedAlbumIds((prev) => (prev.includes(album.id) ? prev : [...prev, album.id]));
          }
        },
      },
    ]);
  }, [customAlbums]);

  const handleActionEnd = React.useCallback(
    (album: Album, action: 'none' | 'edit' | 'delete') => {
      if (action === 'edit') {
        handleRenameAlbum(album);
        return;
      }
      if (action === 'delete') {
        handleDeleteAlbum(album);
      }
    },
    [handleDeleteAlbum, handleRenameAlbum]
  );

  const handleMenuStart = React.useCallback(
    (album: Album, layout: { x: number; y: number; width: number; height: number }) => {
      setActiveAlbum(album);
      setActiveLayout(layout);
    },
    []
  );

  const handleMenuFinish = React.useCallback(() => {
    setActiveAlbum(null);
    setActiveLayout(null);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="搜尋卡片關鍵字"
            placeholderTextColor="#8E8E93"
            style={styles.searchInput}
            returnKeyType="search"
          />
          <TouchableOpacity
            style={styles.clearSearchButton}
            activeOpacity={0.8}
            onPress={() => setSearchQuery('')}
          >
            <Text style={styles.clearSearchButtonText}>×</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.addAlbumButton}
          activeOpacity={0.85}
          onPress={() => setIsModalVisible(true)}
        >
          <Text style={styles.addAlbumText}>＋</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <TouchableOpacity
          style={styles.sortPill}
          activeOpacity={0.85}
          onPress={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
        >
          <Text style={styles.sortPillText}>↕︎</Text>
          <Text style={styles.sortPillChevron}>{sortOrder === 'desc' ? '新→舊' : '舊→新'}</Text>
        </TouchableOpacity>

        {filterPills.map((pill) => (
          <TouchableOpacity key={pill} style={styles.filterPill} activeOpacity={0.85}>
            <Text style={styles.filterPillText}>{pill}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={processedAlbums}
        numColumns={2}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.albumGridContent}
        columnWrapperStyle={styles.albumRow}
        renderItem={({ item }) => (
          <AlbumGridItem
            item={item}
            onPress={handleAlbumPress}
            isMenuVisible={isMenuVisible}
            startX={startX}
            startY={startY}
            hoveredAction={hoveredAction}
            activeAlbumId={activeAlbum?.id || null}
            onMenuStart={handleMenuStart}
            onMenuFinish={handleMenuFinish}
            onActionEnd={handleActionEnd}
          />
        )}
      />

      <CreateAlbumModalUI
        visible={isModalVisible}
        albumName={newAlbumName}
        onChangeAlbumName={setNewAlbumName}
        onCancel={() => {
          setIsModalVisible(false);
          setNewAlbumName('');
        }}
        onConfirm={handleAddAlbum}
      />

      <ActionMenuOverlay
        isMenuVisible={isMenuVisible}
        startX={startX}
        startY={startY}
        hoveredAction={hoveredAction}
        activeAlbum={activeAlbum}
        activeLayout={activeLayout}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInputWrap: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: '#0B0B0F',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  searchIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    paddingVertical: 0,
  },
  clearSearchButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  clearSearchButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 14,
  },
  addAlbumButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0B0F',
  },
  addAlbumText: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '300',
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 8,
  },
  sortPill: {
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#111317',
    gap: 6,
  },
  sortPillText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  sortPillChevron: {
    color: '#C7C7CC',
    fontSize: 12,
  },
  filterPill: {
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  filterPillText: {
    color: '#F2F2F7',
    fontSize: 14,
    fontWeight: '600',
  },
  albumGridContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 120,
    gap: 16,
  },
  albumRow: {
    justifyContent: 'space-between',
  },
  albumItem: {
    width: '48.3%',
    overflow: 'visible',
  },
  albumPressArea: {
    width: '100%',
    overflow: 'visible',
  },
  folderIcon: {
    width: '100%',
  },
  activeAlbumHidden: {
    opacity: 0,
  },
  menuBlurLayer: {
    zIndex: 10,
  },
  menuDimLayer: {
    zIndex: 11,
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  menuButtonLayer: {
    zIndex: 100,
  },
  activeAlbumClone: {
    position: 'absolute',
    zIndex: 60,
    overflow: 'visible',
  },
  activeAlbumCloneInner: {
    width: '100%',
    height: '100%',
  },
  floatingActionButton: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 10,
  },
});
