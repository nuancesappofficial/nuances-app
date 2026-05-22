import React from 'react';
import { Alert } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { useFocusEffect } from '@react-navigation/native';
import { useSharedValue } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { TabSwipeContext } from '../../../contexts/TabSwipeContext';
import { useAppTour } from '../../../contexts/AppTourContext';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import { resolveCardImageUri } from '@services/media/cardImage';
import { getCurrentAuthUserId } from '@services/auth/userIdentity';
import CreateAlbumModalUI from '../../../components/UI/DeckScreenUI/CreateAlbumModalUI';
import DeckMainScreenUI from '../../../components/UI/DeckScreenUI/DeckMainScreenUI';
import AlbumSettingsModalUI from '../../../components/UI/DeckScreenUI/AlbumSettingsModalUI';
import AlbumActionMenuOverlayUI from '../../../components/UI/DeckScreenUI/AlbumActionMenuOverlayUI';
import ReviewTuningModalUI from '../../../components/UI/DeckScreenUI/ReviewTuningModalUI';
import ImageCropperModal from '../../../components/ImageCropperModal';
import type { DeckAlbum } from '../../../components/UI/DeckScreenUI/deckTypes';
import {
  buildDeckAlbums,
  ALL_CARDS_ALBUM_ID,
  createCustomAlbum,
  loadDeckAlbumPreferences,
  saveDeckAlbumPreferences,
  type DeckAlbumPreferences,
} from '../../../features/deck/albums';
import { primeAlbumPreload } from '../../../features/deck/albumPreloadCache';
import { supabase } from '@services/supabase/client';
import { loadQuizReviewedCardIds, loadSeenCardIds } from '../../../features/deck/cardDetailSeen';
import {
  DEFAULT_ALBUM_REVIEW_PREFERENCES,
  loadAlbumReviewPreferences,
  saveAlbumReviewPreferences,
  type ReviewQuestionType,
} from '../../../features/deck/reviewPreferences';
import {
  DEFAULT_USER_SETTINGS,
  isMainScreenEmptyAlbumSlot,
  loadUserSettings,
  subscribeUserSettings,
  type MainScreenAlbumGridCount,
} from '@services/settings/userSettings';

type Props = {
  navigation: any;
  onPressAvatar?: () => void;
  onPressCacheFab?: () => void;
};

const ALBUM_COVER_DIR = `${FileSystem.documentDirectory || ''}album-covers/`;

async function persistAlbumCoverImage(sourceUri: string): Promise<string> {
  if (!ALBUM_COVER_DIR) return sourceUri;
  const dirInfo = await FileSystem.getInfoAsync(ALBUM_COVER_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(ALBUM_COVER_DIR, { intermediates: true });
  }
  const targetUri = `${ALBUM_COVER_DIR}album-cover-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.jpg`;
  await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
  return targetUri;
}

export default function DeckMainFlow({ navigation, onPressAvatar, onPressCacheFab }: Props) {
  const tabSwipeContext = React.useContext(TabSwipeContext);
  const [allCards, setAllCards] = React.useState<Card[]>([]);
  const [cardImageMap, setCardImageMap] = React.useState<Record<string, string>>({});
  const [imageReloadSeed, setImageReloadSeed] = React.useState(0);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [sortOrder, setSortOrder] = React.useState<'desc' | 'asc'>('desc');
  const [isCreateModalVisible, setIsCreateModalVisible] = React.useState(false);
  const [newAlbumName, setNewAlbumName] = React.useState('');
  const [customAlbums, setCustomAlbums] = React.useState<DeckAlbum[]>([]);
  const [albumNameOverrides, setAlbumNameOverrides] = React.useState<Record<string, string>>({});
  const [albumEmojiOverrides, setAlbumEmojiOverrides] = React.useState<Record<string, string>>({});
  const [albumColorOverrides, setAlbumColorOverrides] = React.useState<Record<string, string>>({});
  const [albumCoverOverrides, setAlbumCoverOverrides] = React.useState<Record<string, string>>({});
  const [deletedAlbumIds, setDeletedAlbumIds] = React.useState<string[]>([]);
  const [isAlbumPrefsHydrated, setIsAlbumPrefsHydrated] = React.useState(false);
  const [settingsVisible, setSettingsVisible] = React.useState(false);
  const [settingsAlbum, setSettingsAlbum] = React.useState<DeckAlbum | null>(null);
  const [settingsName, setSettingsName] = React.useState('');
  const [settingsEmoji, setSettingsEmoji] = React.useState('📁');
  const [settingsColor, setSettingsColor] = React.useState('#1E293B');
  const [settingsCoverImageUri, setSettingsCoverImageUri] = React.useState('');
  const [pendingAlbumCoverCropUri, setPendingAlbumCoverCropUri] = React.useState<string | null>(null);
  const [activeAlbum, setActiveAlbum] = React.useState<DeckAlbum | null>(null);
  const [activeLayout, setActiveLayout] = React.useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [seenCardIds, setSeenCardIds] = React.useState<Set<string>>(new Set());
  const [quizReviewedCardIds, setQuizReviewedCardIds] = React.useState<Set<string>>(new Set());
  const [showTodayReviewTuningModal, setShowTodayReviewTuningModal] = React.useState(false);
  const [todayReviewQuestionCount, setTodayReviewQuestionCount] = React.useState(
    DEFAULT_ALBUM_REVIEW_PREFERENCES.questionCount
  );
  const [todayNewWordsOnly, setTodayNewWordsOnly] = React.useState(
    DEFAULT_ALBUM_REVIEW_PREFERENCES.todayNewWordsOnly ?? false
  );
  const [todayReviewQuestionTypes, setTodayReviewQuestionTypes] = React.useState<ReviewQuestionType[]>(
    DEFAULT_ALBUM_REVIEW_PREFERENCES.selectedQuestionTypes
  );
  const [wordPopSlideMs, setWordPopSlideMs] = React.useState<number>(DEFAULT_USER_SETTINGS.wordPopSlideMs);
  const [mainScreenAlbumGridCount, setMainScreenAlbumGridCount] = React.useState<MainScreenAlbumGridCount>(
    DEFAULT_USER_SETTINGS.mainScreenAlbumGridCount
  );
  const [mainScreenWordPopEnabled, setMainScreenWordPopEnabled] = React.useState(
    DEFAULT_USER_SETTINGS.mainScreenWordPopEnabled
  );
  const [mainScreenAlbumOrder, setMainScreenAlbumOrder] = React.useState<string[]>(
    DEFAULT_USER_SETTINGS.mainScreenAlbumOrder
  );
  const isMenuVisible = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const hoveredAction = useSharedValue<'none' | 'edit' | 'delete'>('none');
  const albumCoverCropOpenTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const appTour = useAppTour();
  const didCheckTourRef = React.useRef(false);
  const didCompleteTourRef = React.useRef(false);

  const filterPills = ['群組', '隱私', '已封存'];

  const markTourSeen = React.useCallback(async () => {
    if (didCompleteTourRef.current) return;
    didCompleteTourRef.current = true;
    try {
      const userId = await getCurrentAuthUserId();
      if (!userId) return;
      const { error } = await supabase
        .from('profiles')
        .update({ has_seen_tour: true, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (error) throw error;
    } catch (error) {
      didCompleteTourRef.current = false;
      console.warn('[AppTour] mark tour seen failed:', error);
    }
  }, []);

  const completeTour = React.useCallback(() => {
    appTour.skipTour();
    void markTourSeen();
  }, [appTour, markTourSeen]);

  const handleTourTargetPress = React.useCallback(() => {
    if (appTour.step === 'STEP_2_COACH') {
      const targetCard = allCards[0];
      if (!targetCard) {
        Alert.alert('還沒有卡片', '先新增一張卡片，再使用 Pronunciation Coach。');
        return;
      }
      const scopedCardIds = allCards.map((card) => card.id);
      appTour.nextStep();
      navigation.navigate('CardDetail', {
        cardId: targetCard.id,
        cardIds: scopedCardIds,
        albumName: 'All cards',
        headerTitle: 'All cards',
      });
      return;
    }

    if (appTour.step === 'STEP_3_QUIZ') {
      completeTour();
      return;
    }
    appTour.nextStep();
  }, [allCards, appTour, completeTour, navigation]);

  const applyMainScreenSettings = React.useCallback((settings: {
    wordPopSlideMs: number;
    mainScreenAlbumGridCount: MainScreenAlbumGridCount;
    mainScreenWordPopEnabled: boolean;
    mainScreenAlbumOrder: string[];
  }) => {
    setWordPopSlideMs(settings.wordPopSlideMs);
    setMainScreenAlbumGridCount(settings.mainScreenAlbumGridCount);
    setMainScreenWordPopEnabled(settings.mainScreenWordPopEnabled);
    setMainScreenAlbumOrder(settings.mainScreenAlbumOrder);
  }, []);

  const toDayKey = React.useCallback((input: Date | string) => {
    const date = new Date(input);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const hydrateAlbumPrefs = React.useCallback(async () => {
    try {
      const prefs = await loadDeckAlbumPreferences();
      setCustomAlbums(prefs.customAlbums);
      setAlbumNameOverrides(prefs.albumNameOverrides);
      setAlbumEmojiOverrides(prefs.albumEmojiOverrides);
      setAlbumColorOverrides(prefs.albumColorOverrides);
      setAlbumCoverOverrides(prefs.albumCoverOverrides);
      setDeletedAlbumIds(prefs.deletedAlbumIds);
    } finally {
      setIsAlbumPrefsHydrated(true);
    }
  }, []);

  React.useEffect(() => {
    void hydrateAlbumPrefs();
  }, [hydrateAlbumPrefs]);

  React.useEffect(() => {
    if (didCheckTourRef.current) return;
    didCheckTourRef.current = true;
    let cancelled = false;

    const checkTourStatus = async () => {
      try {
        const userId = await getCurrentAuthUserId();
        if (!userId || cancelled) return;
        const { data, error } = await supabase
          .from('profiles')
          .select('onboarding_completed, has_seen_tour')
          .eq('id', userId)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled && data?.onboarding_completed === true && data?.has_seen_tour !== true) {
          appTour.startTour();
        }
      } catch (error) {
        console.warn('[AppTour] check tour status failed:', error);
      }
    };

    void checkTourStatus();
    return () => {
      cancelled = true;
    };
  }, [appTour]);

  useFocusEffect(
    React.useCallback(() => {
      void hydrateAlbumPrefs();
    }, [hydrateAlbumPrefs])
  );

  React.useEffect(() => {
    if (!isAlbumPrefsHydrated) return;
    const payload: DeckAlbumPreferences = {
      customAlbums,
      albumNameOverrides,
      albumEmojiOverrides,
      albumColorOverrides,
      albumCoverOverrides,
      deletedAlbumIds,
    };
    saveDeckAlbumPreferences(payload).catch((error) => {
      console.warn('[DeckMain] save album preferences failed:', error);
    });
  }, [
    isAlbumPrefsHydrated,
    customAlbums,
    albumNameOverrides,
    albumEmojiOverrides,
    albumColorOverrides,
    albumCoverOverrides,
    deletedAlbumIds,
  ]);

  React.useEffect(() => {
    return () => {
      if (albumCoverCropOpenTimeoutRef.current) {
        clearTimeout(albumCoverCropOpenTimeoutRef.current);
        albumCoverCropOpenTimeoutRef.current = null;
      }
    };
  }, []);

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

  const fallbackUserId = allCards[0]?.userId;

  React.useEffect(() => {
    let cancelled = false;
    const ensureMockVisualCard = async () => {
      try {
        const mockQuery = database
          .get<Card>('cards')
          .query(
            Q.where('deleted_at', null),
            Q.where('source_app', 'mock-visual')
          );
        const existingMockCards = await mockQuery.fetch();
        if (cancelled) return;
        if (existingMockCards.length > 0) return;

        const userId = await getCurrentAuthUserId();
        const effectiveUserId = userId || fallbackUserId;
        if (!effectiveUserId || cancelled) return;

        const mockImageUrl = 'https://picsum.photos/seed/nuances-mock/900/1200';

        await database.write(async () => {
          await database.get<Card>('cards').create((card) => {
            card.userId = effectiveUserId;
            card.targetWord = 'mock';
            card.targetPhrase = 'mock interview';
            card.originalSentence =
              'I have a mock interview tomorrow, so I am practicing common questions tonight.';
            card.definition = '模擬的；用來練習真實情境的';
            card.partOfSpeech = 'noun';
            card.contextualExplanation =
              '我明天有一場「模擬面試」，所以今晚正在練習常見問題。\n這裡的「mock」表示「模擬、演練」，通常用於考試、面試或法庭等正式情境前的練習。';
            card.frequentCollocations =
              'mock interview, mock exam, mock trial';
            card.phoneticTranscription = '/mɑːk/';
            card.tags = ['mock_visual', 'album_all'];
            card.sourceApp = 'mock-visual';
            card.imageUrl = mockImageUrl;
            card.easeFactor = 2.5;
            card.intervalDays = 1;
            card.repetitions = 0;
            card.nextReviewAt = new Date();
          });
        });
      } catch (error) {
        console.warn('[DeckMain] ensure mock visual card failed:', error);
      }
    };
    void ensureMockVisualCard();
    return () => {
      cancelled = true;
    };
  }, [fallbackUserId]);

  useFocusEffect(
    React.useCallback(() => {
      setImageReloadSeed((prev) => prev + 1);
    }, [])
  );

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      const hydrateSeenCards = async () => {
        try {
          const nextSeen = await loadSeenCardIds();
          if (active) setSeenCardIds(nextSeen);
        } catch (error) {
          console.warn('[DeckMain] load seen cards failed:', error);
          if (active) setSeenCardIds(new Set());
        }
      };
      void hydrateSeenCards();
      return () => {
        active = false;
      };
    }, [])
  );

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      const hydrateSeenCards = async () => {
        try {
          const nextReviewed = await loadQuizReviewedCardIds();
          if (active) setQuizReviewedCardIds(nextReviewed);
        } catch (error) {
          console.warn('[DeckMain] load quiz-reviewed cards failed:', error);
          if (active) setQuizReviewedCardIds(new Set());
        }
      };
      void hydrateSeenCards();
      return () => {
        active = false;
      };
    }, [])
  );

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      const hydrateMainScreenSettings = async () => {
        try {
          const settings = await loadUserSettings();
          if (active) {
            applyMainScreenSettings(settings);
          }
        } catch (error) {
          console.warn('[DeckMain] load main screen settings failed:', error);
          if (active) {
            applyMainScreenSettings(DEFAULT_USER_SETTINGS);
          }
        }
      };
      void hydrateMainScreenSettings();
      return () => {
        active = false;
      };
    }, [applyMainScreenSettings])
  );

  React.useEffect(
    () =>
      subscribeUserSettings((settings) => {
        applyMainScreenSettings(settings);
      }),
    [applyMainScreenSettings]
  );

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      const hydrateTodayReviewPreferences = async () => {
        try {
          const prefs = await loadAlbumReviewPreferences('today-added');
          if (active) {
            setTodayReviewQuestionCount(prefs.questionCount);
            setTodayNewWordsOnly(prefs.todayNewWordsOnly ?? false);
            setTodayReviewQuestionTypes(prefs.selectedQuestionTypes);
          }
        } catch (error) {
          console.warn('[DeckMain] load today review preferences failed:', error);
          if (active) {
            setTodayReviewQuestionCount(DEFAULT_ALBUM_REVIEW_PREFERENCES.questionCount);
            setTodayNewWordsOnly(DEFAULT_ALBUM_REVIEW_PREFERENCES.todayNewWordsOnly ?? false);
            setTodayReviewQuestionTypes(DEFAULT_ALBUM_REVIEW_PREFERENCES.selectedQuestionTypes);
          }
        }
      };
      void hydrateTodayReviewPreferences();
      return () => {
        active = false;
      };
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

  const mergedAlbums = React.useMemo(
    () =>
      buildDeckAlbums(allCards, cardImageMap, {
        customAlbums,
        albumNameOverrides,
        albumEmojiOverrides,
        albumColorOverrides,
        albumCoverOverrides,
        deletedAlbumIds,
      }),
    [allCards, cardImageMap, customAlbums, albumNameOverrides, albumEmojiOverrides, albumColorOverrides, albumCoverOverrides, deletedAlbumIds]
  );

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

    const orderIndex = new Map(
      mainScreenAlbumOrder
        .filter((slot) => !isMainScreenEmptyAlbumSlot(slot))
        .map((albumId, index) => [albumId, index])
    );
    const sortedAlbums = [...result].sort((a, b) => {
      const aOrder = orderIndex.get(a.id);
      const bOrder = orderIndex.get(b.id);
      if (aOrder != null && bOrder != null) return aOrder - bOrder;
      if (aOrder != null) return -1;
      if (bOrder != null) return 1;
      const aLatest = a.latestCards[0]?.createdAtMs ?? 0;
      const bLatest = b.latestCards[0]?.createdAtMs ?? 0;
      return sortOrder === 'desc' ? bLatest - aLatest : aLatest - bLatest;
    });

    if (keyword || mainScreenAlbumOrder.length === 0) return sortedAlbums;

    const albumById = new Map(sortedAlbums.map((album) => [album.id, album]));
    const usedAlbumIds = new Set<string>();
    const laidOutAlbums: Array<DeckAlbum | null> = [];

    mainScreenAlbumOrder.forEach((slot) => {
      if (isMainScreenEmptyAlbumSlot(slot)) {
        laidOutAlbums.push(null);
        return;
      }
      const album = albumById.get(slot);
      if (!album || usedAlbumIds.has(slot)) return;
      usedAlbumIds.add(slot);
      laidOutAlbums.push(album);
    });

    sortedAlbums.forEach((album) => {
      if (!usedAlbumIds.has(album.id)) {
        laidOutAlbums.push(album);
      }
    });

    while (laidOutAlbums.length > 0 && laidOutAlbums[laidOutAlbums.length - 1] == null) {
      laidOutAlbums.pop();
    }

    return laidOutAlbums.length > 0 ? laidOutAlbums : sortedAlbums;
  }, [mainScreenAlbumOrder, mergedAlbums, searchQuery, sortOrder]);

  const slideshowItems = React.useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ cardId: string; text: string; translation?: string; sentence?: string; imageUri?: string }> = [];

    allCards.forEach((card) => {
      const phrase = (card.targetPhrase || '').trim();
      const word = (card.targetWord || '').trim();
      const candidate = phrase || word;
      if (!candidate) return;
      const key = candidate.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      list.push({
        cardId: card.id,
        text: candidate,
        translation: (card.definition || card.contextualExplanation || '').trim(),
        sentence: (card.originalSentence || '').trim(),
        imageUri: cardImageMap[card.id],
      });
    });

    return list;
  }, [allCards, cardImageMap]);

  const searchResults = React.useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return [];
    const seen = new Set<string>();
    const list: Array<{ cardId: string; text: string; translation?: string }> = [];
    allCards.forEach((card) => {
      const phrase = (card.targetPhrase || '').trim();
      const word = (card.targetWord || '').trim();
      const candidate = phrase || word;
      if (!candidate) return;
      const haystack = `${candidate} ${card.definition || ''} ${card.originalSentence || ''}`.toLowerCase();
      if (!haystack.includes(keyword)) return;
      const dedupeKey = `${card.id}:${candidate.toLowerCase()}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      list.push({
        cardId: card.id,
        text: candidate,
        translation: (card.definition || '').trim(),
      });
    });
    return list;
  }, [allCards, searchQuery]);

  const todayCardIds = React.useMemo(() => {
    const todayKey = toDayKey(new Date());
    return allCards
      .filter((card) => !!card.createdAt && toDayKey(card.createdAt) === todayKey)
      .map((card) => card.id);
  }, [allCards, toDayKey]);

  const todayUnreviewedCount = React.useMemo(
    () => todayCardIds.filter((id) => !quizReviewedCardIds.has(id)).length,
    [todayCardIds, quizReviewedCardIds]
  );

  const handlePressTodayReview = React.useCallback(() => {
    if (allCards.length === 0) {
      Alert.alert('還沒有單字', '先新增幾張卡片，再開始 Quick quiz。');
      return;
    }

    const hasPendingTodayReview = todayUnreviewedCount > 0;
    const shouldUseTodayCards = hasPendingTodayReview || (todayNewWordsOnly && todayCardIds.length > 0);

    navigation.navigate('CardReview', {
      albumId: shouldUseTodayCards ? 'today-added' : 'all-cards',
      albumName: shouldUseTodayCards ? 'Today Review' : 'All cards',
      cardIds: shouldUseTodayCards ? todayCardIds : undefined,
      questionCount: todayReviewQuestionCount,
      selectedQuestionTypes: todayReviewQuestionTypes,
      themeColor: '#2D9E66',
    });
  }, [
    allCards.length,
    navigation,
    todayCardIds,
    todayNewWordsOnly,
    todayReviewQuestionCount,
    todayReviewQuestionTypes,
    todayUnreviewedCount,
  ]);

  const handleChangeTodayReviewQuestionCount = React.useCallback((nextCount: number) => {
    setTodayReviewQuestionCount(nextCount);
    void saveAlbumReviewPreferences('today-added', { questionCount: nextCount });
  }, []);

  const handleChangeTodayNewWordsOnly = React.useCallback((enabled: boolean) => {
    setTodayNewWordsOnly(enabled);
    void saveAlbumReviewPreferences('today-added', { todayNewWordsOnly: enabled });
  }, []);

  const handleChangeTodayReviewQuestionTypes = React.useCallback((nextTypes: ReviewQuestionType[]) => {
    setTodayReviewQuestionTypes(nextTypes);
    void saveAlbumReviewPreferences('today-added', { selectedQuestionTypes: nextTypes });
  }, []);

  const handleAddAlbum = React.useCallback(() => {
    const trimmedName = newAlbumName.trim();
    if (!trimmedName) return;

    const newAlbum = createCustomAlbum(trimmedName);

    setCustomAlbums((prev) => [newAlbum, ...prev]);
    setIsCreateModalVisible(false);
    setNewAlbumName('');
  }, [newAlbumName]);

  const handleAlbumPress = React.useCallback(
    (album: DeckAlbum) => {
      const albumCardIdSet = new Set(album.cardIds);
      const optimisticCards =
        album.id === ALL_CARDS_ALBUM_ID || album.id === 'all-cards'
          ? allCards
          : allCards.filter((card) => albumCardIdSet.has(card.id));
      const optimisticImageMap = optimisticCards.reduce<Record<string, string>>((next, card) => {
        const uri = cardImageMap[card.id];
        if (uri) next[card.id] = uri;
        return next;
      }, {});

      primeAlbumPreload(album.id, {
        cards: optimisticCards,
        cardImageMap: optimisticImageMap,
        seenCardIds,
      });
      navigation.navigate('AlbumView', { album, isDefault: album.isDefault });
    },
    [allCards, cardImageMap, navigation, seenCardIds]
  );

  const openAlbumSettings = React.useCallback((album: DeckAlbum) => {
    setSettingsAlbum(album);
    setSettingsName(album.name);
    setSettingsEmoji(album.emoji || '📁');
    setSettingsColor(album.color || '#1E293B');
    setSettingsCoverImageUri(albumCoverOverrides[album.id] || album.coverImageUri || '');
    setSettingsVisible(true);
  }, [albumCoverOverrides]);

  const handleChangeSettingsEmoji = React.useCallback((emoji: string) => {
    setSettingsEmoji(emoji);
    setSettingsCoverImageUri('');
  }, []);

  const handleChangeSettingsColor = React.useCallback((color: string) => {
    setSettingsColor(color);
    setSettingsCoverImageUri('');
  }, []);

  const handleSelectCoverTab = React.useCallback((tab: 'classic' | 'image') => {
    if (tab === 'classic') {
      setSettingsCoverImageUri('');
    }
  }, []);

  const applyAlbumSettings = React.useCallback((nextCoverImageUri?: string) => {
    if (!settingsAlbum) return;

    const nextName = settingsName.trim();
    if (!nextName) {
      Alert.alert('名稱不可為空', '請輸入相簿名稱。');
      return false;
    }

    const effectiveCoverImageUri = nextCoverImageUri ?? settingsCoverImageUri;
    const writeCoverOverride = (albumId: string, uri: string) => {
      setAlbumCoverOverrides((prev) => {
        const next = { ...prev };
        if (uri) {
          next[albumId] = uri;
        } else {
          delete next[albumId];
        }
        return next;
      });
    };

    const isCustomAlbum = customAlbums.some((it) => it.id === settingsAlbum.id);
    if (isCustomAlbum) {
      setCustomAlbums((prev) =>
        prev.map((it) =>
          it.id === settingsAlbum.id
            ? {
                ...it,
                name: nextName,
                emoji: settingsEmoji,
                color: settingsColor,
                coverImageUri: effectiveCoverImageUri || undefined,
              }
            : it
        )
      );
      writeCoverOverride(settingsAlbum.id, effectiveCoverImageUri);
    } else {
      setAlbumNameOverrides((prev) => ({ ...prev, [settingsAlbum.id]: nextName }));
      setAlbumEmojiOverrides((prev) => ({ ...prev, [settingsAlbum.id]: settingsEmoji }));
      setAlbumColorOverrides((prev) => ({ ...prev, [settingsAlbum.id]: settingsColor }));
      writeCoverOverride(settingsAlbum.id, effectiveCoverImageUri);
    }

    setSettingsCoverImageUri(effectiveCoverImageUri);
    setSettingsVisible(false);
    setSettingsAlbum(null);
    return true;
  }, [customAlbums, settingsAlbum, settingsName, settingsEmoji, settingsColor, settingsCoverImageUri]);

  const handleSaveAlbumSettings = React.useCallback(() => {
    applyAlbumSettings();
  }, [applyAlbumSettings]);

  const handlePickAlbumCoverImage = React.useCallback(async () => {
    if (!settingsAlbum) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('需要相簿權限', '請先允許存取相簿，才能選擇封面圖片。');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const normalizedImage = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [],
        {
          compress: 0.96,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );
      if (albumCoverCropOpenTimeoutRef.current) {
        clearTimeout(albumCoverCropOpenTimeoutRef.current);
        albumCoverCropOpenTimeoutRef.current = null;
      }
      setPendingAlbumCoverCropUri(normalizedImage.uri);
    } catch (error) {
      console.error('[DeckMain] pick album cover failed:', error);
      Alert.alert('選擇失敗', '無法選擇封面圖片，請稍後再試。');
    }
  }, [settingsAlbum]);

  const handleDeleteAlbum = React.useCallback((album: DeckAlbum) => {
    if (album.isDefault) {
      Alert.alert('無法刪除', '預設資料夾不能刪除。');
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
    (album: DeckAlbum, action: 'none' | 'edit' | 'delete') => {
      if (action === 'edit') {
        openAlbumSettings(album);
        return;
      }
      if (action === 'delete') {
        handleDeleteAlbum(album);
      }
    },
    [handleDeleteAlbum, openAlbumSettings]
  );

  const handleMenuStart = React.useCallback(
    (album: DeckAlbum, layout: { x: number; y: number; width: number; height: number }) => {
      setActiveAlbum(album);
      setActiveLayout(layout);
    },
    []
  );

  const handleMenuFinish = React.useCallback(() => {
    setActiveAlbum(null);
    setActiveLayout(null);
  }, []);

  const handleAvatarPress = React.useCallback(() => {
    if (onPressAvatar) {
      onPressAvatar();
      return;
    }
    console.log('[DeckHub] Avatar pressed');
  }, [onPressAvatar]);

  const handleCacheFabPress = React.useCallback(() => {
    if (onPressCacheFab) {
      onPressCacheFab();
      return;
    }
    tabSwipeContext?.goToTab(1, { animation: 'slide' });
    setTimeout(() => {
      tabSwipeContext?.triggerCacheAddAction();
    }, 280);
  }, [onPressCacheFab, tabSwipeContext]);

  const handlePressWordPopItem = React.useCallback(
    (item: { cardId: string; text: string; imageUri?: string }) => {
      if (!item?.cardId) return;
      const scopedCardIds = allCards.map((card) => card.id);
      if (scopedCardIds.length === 0) {
        Alert.alert('目前沒有可開啟的卡片', '請先新增或同步卡片後再試。');
        return;
      }
      const targetCardId = scopedCardIds.includes(item.cardId) ? item.cardId : scopedCardIds[0];
      navigation.navigate('CardDetail', {
        cardId: targetCardId,
        cardIds: scopedCardIds,
        albumName: 'All cards',
        headerTitle: 'All cards',
      });
    },
    [allCards, navigation]
  );

  const handlePressSearchResult = React.useCallback(
    (item: { cardId: string; text: string; translation?: string }) => {
      if (!item?.cardId) return;
      const scopedCardIds = allCards.map((card) => card.id);
      if (scopedCardIds.length === 0) return;
      const targetCardId = scopedCardIds.includes(item.cardId) ? item.cardId : scopedCardIds[0];
      navigation.navigate('CardDetail', {
        cardId: targetCardId,
        cardIds: scopedCardIds,
        albumName: 'All cards',
        headerTitle: 'All cards',
      });
      setSearchQuery('');
    },
    [allCards, navigation]
  );

  return (
    <>
      <DeckMainScreenUI
        heroStatusText={allCards.length > 0 ? "Cache isn't empty" : 'Cache is empty'}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onClearSearch={() => setSearchQuery('')}
        onPressAvatar={handleAvatarPress}
        onPressCacheFab={handleCacheFabPress}
        onOpenCreateAlbum={() => setIsCreateModalVisible(true)}
        sortOrder={sortOrder}
        onToggleSort={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
        filterPills={filterPills}
        todayReviewTotalCount={todayCardIds.length}
        todayReviewPendingCount={todayUnreviewedCount}
        todayNewWordsOnly={todayNewWordsOnly}
        onPressTodayReview={handlePressTodayReview}
        onPressTodayReviewTuning={() => setShowTodayReviewTuningModal(true)}
        tourStep={appTour.step}
        onTourTargetPress={handleTourTargetPress}
        onTourSkip={completeTour}
        slideshowItems={slideshowItems}
        wordPopSlideMs={wordPopSlideMs}
        wordPopEnabled={mainScreenWordPopEnabled}
        albumGridCount={mainScreenAlbumGridCount}
        onPressSlideshowItem={handlePressWordPopItem}
        searchResults={searchResults}
        onPressSearchResult={handlePressSearchResult}
        albums={processedAlbums}
        onPressAlbum={handleAlbumPress}
        isMenuVisible={isMenuVisible}
        startX={startX}
        startY={startY}
        hoveredAction={hoveredAction}
        activeAlbumId={activeAlbum?.id || null}
        onMenuStart={handleMenuStart}
        onMenuFinish={handleMenuFinish}
        onActionEnd={handleActionEnd}
      />

      <ReviewTuningModalUI
        visible={showTodayReviewTuningModal}
        questionCount={todayReviewQuestionCount}
        todayNewWordsOnly={todayNewWordsOnly}
        selectedQuestionTypes={todayReviewQuestionTypes}
        onChangeTodayNewWordsOnly={handleChangeTodayNewWordsOnly}
        onClose={() => setShowTodayReviewTuningModal(false)}
        onChangeQuestionCount={handleChangeTodayReviewQuestionCount}
        onChangeSelectedQuestionTypes={handleChangeTodayReviewQuestionTypes}
      />

      <CreateAlbumModalUI
        visible={isCreateModalVisible}
        albumName={newAlbumName}
        onChangeAlbumName={setNewAlbumName}
        onCancel={() => {
          setIsCreateModalVisible(false);
          setNewAlbumName('');
        }}
        onConfirm={handleAddAlbum}
      />

      <AlbumSettingsModalUI
        visible={settingsVisible}
        settingsName={settingsName}
        settingsEmoji={settingsEmoji}
        settingsColor={settingsColor}
        hasCoverImage={Boolean(settingsCoverImageUri)}
        coverImageUri={settingsCoverImageUri || undefined}
        onSelectCoverTab={handleSelectCoverTab}
        onChangeName={setSettingsName}
        onChangeEmoji={handleChangeSettingsEmoji}
        onChangeColor={handleChangeSettingsColor}
        onPickCoverImage={() => void handlePickAlbumCoverImage()}
        onCancel={() => {
          setSettingsVisible(false);
          setSettingsAlbum(null);
          if (albumCoverCropOpenTimeoutRef.current) {
            clearTimeout(albumCoverCropOpenTimeoutRef.current);
            albumCoverCropOpenTimeoutRef.current = null;
          }
        }}
        onSave={handleSaveAlbumSettings}
      >
        <ImageCropperModal
          visible={!!pendingAlbumCoverCropUri}
          imageUri={pendingAlbumCoverCropUri}
          cropShape="album"
          fixedCropSize={260}
          modalAnimationType="slide"
          onCancel={() => {
            setPendingAlbumCoverCropUri(null);
          }}
          onConfirm={(croppedUri) => {
            setSettingsCoverImageUri(croppedUri);
            setPendingAlbumCoverCropUri(null);
            void persistAlbumCoverImage(croppedUri)
              .then((stableUri) => {
                setSettingsCoverImageUri(stableUri);
              })
              .catch((error) => {
                console.warn('[DeckMain] persist album cover failed:', error);
                setSettingsCoverImageUri(croppedUri);
              });
          }}
        />
      </AlbumSettingsModalUI>

      <AlbumActionMenuOverlayUI
        isMenuVisible={isMenuVisible}
        startX={startX}
        startY={startY}
        hoveredAction={hoveredAction}
        activeAlbum={activeAlbum}
        activeLayout={activeLayout}
      />
    </>
  );
}
