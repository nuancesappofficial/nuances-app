import React from 'react';
import { traceFirstRun } from '../../../services/logging/firstRunTraceRuntime';
import { Alert, DeviceEventEmitter, Linking } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { useFocusEffect } from '@react-navigation/native';
import { useSharedValue } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { TabSwipeContext } from '../../../contexts/TabSwipeContext';
import { useAppTour } from '../../../contexts/AppTourContext';
import {
  hasSeenTourLocally,
  markTourSeenLocally,
} from '../../../features/tour/tourSeen';
import { VIDEO_TOUR_ENABLED } from '../../../features/tour/tourMode';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import { resolveCardImageUri } from '@services/media/cardImage';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';
import ReminderNotificationService from '@services/notifications/ReminderNotificationService';
import CreateAlbumModalUI from '../../../components/UI/DeckScreenUI/CreateAlbumModalUI';
import DeckMainScreenUI from '../../../components/UI/DeckScreenUI/DeckMainScreenUI';
import AlbumSettingsModalUI from '../../../components/UI/DeckScreenUI/AlbumSettingsModalUI';
import TourCompletionGreetingUI from '../../../components/UI/DeckScreenUI/TourCompletionGreetingUI';
import AlbumActionMenuOverlayUI from '../../../components/UI/DeckScreenUI/AlbumActionMenuOverlayUI';
import ReviewTuningModalUI from '../../../components/UI/DeckScreenUI/ReviewTuningModalUI';
import ImageCropperModal from '../../../components/ImageCropperModal';
import type { DeckAlbum } from '../../../components/UI/DeckScreenUI/deckTypes';
import {
  buildDeckAlbums,
  ALL_CARDS_ALBUM_ID,
  createCustomAlbum,
  getDeckAlbumDisplayName,
  loadDeckAlbumPreferences,
  saveDeckAlbumPreferences,
  subscribeDeckAlbumPreferences,
  type DeckAlbumPreferences,
} from '../../../features/deck/albums';
import { primeAlbumPreload } from '../../../features/deck/albumPreloadCache';
import { supabase } from '@services/supabase/client';
import {
  QUIZ_REVIEWED_CARD_EVENT,
  loadQuizReviewedCardIds,
  loadSeenCardIds,
} from '../../../features/deck/cardDetailSeen';
import {
  DEFAULT_ALBUM_REVIEW_PREFERENCES,
  loadAlbumReviewPreferences,
  saveAlbumReviewPreferences,
  type ReviewQuestionType,
} from '../../../features/deck/reviewPreferences';
import {
  DEFAULT_USER_SETTINGS,
  getInitialUserSettings,
  isMainScreenEmptyAlbumSlot,
  loadUserSettings,
  subscribeUserSettings,
  type MainScreenAlbumGridCount,
  type UILanguage,
} from '@services/settings/userSettings';
import { TOUR_TARGET_WORD } from '../../../features/createCard/draftBuilders';
import { isEnglishLearningCard } from '../../../features/cards/englishLearningPolicy';
import { tUI } from '../../../i18n/uiLanguage';
import {
  DEFAULT_EXPERIENCE_CARD_SENTENCE,
  DEFAULT_EXPERIENCE_TARGET_WORD,
  DEFAULT_EXPERIENCE_QUIZ_HINT_EVENT,
  DEFAULT_EXPERIENCE_TUTORIAL_COMPLETED_EVENT,
  isDefaultExperienceQuizHintPending,
  localizeDefaultExperienceSavedCard,
} from '../../../features/cache/defaultExperienceCard';
import {
  enableScreenshotDemoMode,
  hydrateScreenshotDemoMode,
  isScreenshotDemoModeEnabled,
} from '../../../features/dev/screenshotDemoMode';

type Props = {
  navigation: any;
  onPressAvatar?: () => void;
  onPressCacheFab?: () => void;
};

const ALBUM_COVER_DIR = `${FileSystem.documentDirectory || ''}album-covers/`;
const LOCAL_CARD_QUERY_TIMEOUT_MS = 8000;
const CARD_IMAGE_RESOLVE_BATCH_SIZE = 12;

function withLocalCardQueryTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Local card query timed out')),
      LOCAL_CARD_QUERY_TIMEOUT_MS
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function hasQuizUsableCard(card: Card): boolean {
  if (!isEnglishLearningCard(card)) return false;
  return Boolean(
    (card.targetPhrase || '').trim() ||
    (card.targetWord || '').trim() ||
    (card.definition || '').trim() ||
    (card.contextualExplanation || '').trim()
  );
}

async function persistAlbumCoverImage(sourceUri: string): Promise<string> {
  if (!ALBUM_COVER_DIR) return sourceUri;
  const dirInfo = await FileSystem.getInfoAsync(ALBUM_COVER_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(ALBUM_COVER_DIR, {
      intermediates: true,
    });
  }
  const targetUri = `${ALBUM_COVER_DIR}album-cover-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.jpg`;
  await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
  return targetUri;
}

export default function DeckMainFlow({
  navigation,
  onPressAvatar,
  onPressCacheFab,
}: Props) {
  const [showDefaultExperienceQuizHint, setShowDefaultExperienceQuizHint] =
    React.useState(false);
  const initialSettings = getInitialUserSettings();
  const tabSwipeContext = React.useContext(TabSwipeContext);
  const [allCards, setAllCards] = React.useState<Card[]>([]);
  const [cardsHydrated, setCardsHydrated] = React.useState(false);
  const [cardImageMap, setCardImageMap] = React.useState<
    Record<string, string>
  >({});
  const [imageReloadSeed, setImageReloadSeed] = React.useState(0);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [sortOrder, setSortOrder] = React.useState<'desc' | 'asc'>('desc');
  const [isCreateModalVisible, setIsCreateModalVisible] = React.useState(false);
  const [newAlbumName, setNewAlbumName] = React.useState('');
  const [customAlbums, setCustomAlbums] = React.useState<DeckAlbum[]>([]);
  const [albumNameOverrides, setAlbumNameOverrides] = React.useState<
    Record<string, string>
  >({});
  const [albumEmojiOverrides, setAlbumEmojiOverrides] = React.useState<
    Record<string, string>
  >({});
  const [albumColorOverrides, setAlbumColorOverrides] = React.useState<
    Record<string, string>
  >({});
  const [albumCoverOverrides, setAlbumCoverOverrides] = React.useState<
    Record<string, string>
  >({});
  const [deletedAlbumIds, setDeletedAlbumIds] = React.useState<string[]>([]);
  const [isAlbumPrefsHydrated, setIsAlbumPrefsHydrated] = React.useState(false);
  const [settingsVisible, setSettingsVisible] = React.useState(false);
  const [tourCompletionGreetingVisible, setTourCompletionGreetingVisible] =
    React.useState(false);
  const [tourCompletionGreetingPending, setTourCompletionGreetingPending] =
    React.useState(false);
  const [settingsAlbum, setSettingsAlbum] = React.useState<DeckAlbum | null>(
    null
  );
  const [settingsName, setSettingsName] = React.useState('');
  const [settingsEmoji, setSettingsEmoji] = React.useState('📁');
  const [settingsColor, setSettingsColor] = React.useState('#1E293B');
  const [settingsCoverImageUri, setSettingsCoverImageUri] = React.useState('');
  const [pendingAlbumCoverCropUri, setPendingAlbumCoverCropUri] =
    React.useState<string | null>(null);
  const [activeAlbum, setActiveAlbum] = React.useState<DeckAlbum | null>(null);
  const [activeLayout, setActiveLayout] = React.useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [seenCardIds, setSeenCardIds] = React.useState<Set<string>>(new Set());
  const [quizReviewedCardIds, setQuizReviewedCardIds] = React.useState<
    Set<string>
  >(new Set());
  const [showTodayReviewTuningModal, setShowTodayReviewTuningModal] =
    React.useState(false);
  const [todayReviewQuestionCount, setTodayReviewQuestionCount] =
    React.useState(DEFAULT_ALBUM_REVIEW_PREFERENCES.questionCount);
  const [todayNewWordsOnly, setTodayNewWordsOnly] = React.useState(
    DEFAULT_ALBUM_REVIEW_PREFERENCES.todayNewWordsOnly ?? false
  );
  const [todayReviewQuestionTypes, setTodayReviewQuestionTypes] =
    React.useState<ReviewQuestionType[]>(
      DEFAULT_ALBUM_REVIEW_PREFERENCES.selectedQuestionTypes
    );
  const [todayReviewSourceAlbumIds, setTodayReviewSourceAlbumIds] =
    React.useState<string[]>(
      DEFAULT_ALBUM_REVIEW_PREFERENCES.selectedSourceAlbumIds
    );
  const [wordPopSlideMs, setWordPopSlideMs] = React.useState<number>(
    initialSettings.wordPopSlideMs
  );
  const [mainScreenAlbumGridCount, setMainScreenAlbumGridCount] =
    React.useState<MainScreenAlbumGridCount>(
      initialSettings.mainScreenAlbumGridCount
    );
  const [mainScreenWordPopEnabled, setMainScreenWordPopEnabled] =
    React.useState(initialSettings.mainScreenWordPopEnabled);
  const [mainScreenWordPopAlbumId, setMainScreenWordPopAlbumId] =
    React.useState<string | null>(initialSettings.mainScreenWordPopAlbumId);
  const [uiLanguage, setUiLanguage] = React.useState<UILanguage>(
    initialSettings.uiLanguage
  );
  const [mainScreenAlbumOrder, setMainScreenAlbumOrder] = React.useState<
    string[]
  >(initialSettings.mainScreenAlbumOrder);
  const isMenuVisible = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const hoveredAction = useSharedValue<'none' | 'edit' | 'delete'>('none');
  // STEP_13 教學：長按選單是否開啟（JS state，供 UI 切換長按箭頭 / 指向 edit 的箭頭）
  const [isTourMenuOpen, setIsTourMenuOpen] = React.useState(false);
  const albumCoverCropOpenTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const appTour = useAppTour();
  const didCheckTourRef = React.useRef(false);
  const didCompleteTourRef = React.useRef(false);
  const didShowTourCompletionGreetingRef = React.useRef(false);
  const pressTodayReviewRef = React.useRef<() => void>(() => {});
  const didOpenTourQuizRef = React.useRef(false);
  const openedTourCardIdRef = React.useRef<string | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      void (async () => {
        const userId = await getCurrentSessionUserId();
        if (!userId) return;
        const pending = await isDefaultExperienceQuizHintPending(userId);
        if (!cancelled) setShowDefaultExperienceQuizHint(pending);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  React.useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      DEFAULT_EXPERIENCE_QUIZ_HINT_EVENT,
      (pending: boolean) => setShowDefaultExperienceQuizHint(Boolean(pending))
    );
    return () => subscription.remove();
  }, []);

  const hideDefaultExperienceQuizHint = React.useCallback(() => {
    if (!showDefaultExperienceQuizHint) return;
    setShowDefaultExperienceQuizHint(false);
  }, [showDefaultExperienceQuizHint]);

  const filterPills = ['群組', '隱私', '已封存'];

  const markTourSeen = React.useCallback(async () => {
    if (didCompleteTourRef.current) return;
    didCompleteTourRef.current = true;
    try {
      const userId = await getCurrentSessionUserId();
      if (!userId) return;
      await markTourSeenLocally(userId);
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

  const showTourCompletionGreeting = React.useCallback(() => {
    if (!didShowTourCompletionGreetingRef.current) {
      didShowTourCompletionGreetingRef.current = true;
      traceFirstRun('greeting', 'shown');
      setTourCompletionGreetingVisible(true);
    }
  }, []);

  const completeTour = React.useCallback(() => {
    traceFirstRun('tutorial', 'completed');
    traceFirstRun('greeting', 'scheduled');
    setTourCompletionGreetingPending(true);
    appTour.completeTour();
    void markTourSeen();
  }, [appTour, markTourSeen]);

  React.useEffect(() => {
    if (!tourCompletionGreetingPending || settingsVisible) return;
    const timer = setTimeout(() => {
      setTourCompletionGreetingPending(false);
      showTourCompletionGreeting();
    }, 450);
    return () => clearTimeout(timer);
  }, [
    settingsVisible,
    showTourCompletionGreeting,
    tourCompletionGreetingPending,
  ]);

  const schedulePostTutorialReminder = React.useCallback(() => {
    setTimeout(() => {
      void ReminderNotificationService.evaluateAndSchedule({
        allowSoftPrompt: true,
        markAppActive: true,
      }).catch((error) => {
        console.warn('[Reminders] post-tutorial prompt failed:', error);
      });
    }, 350);
  }, []);

  const handleGreetingShare = React.useCallback(() => {
    traceFirstRun('greeting', 'share_sheet_selected');
    setTourCompletionGreetingVisible(false);
    schedulePostTutorialReminder();
  }, [schedulePostTutorialReminder]);

  const handleGreetingUpload = React.useCallback(() => {
    traceFirstRun('greeting', 'upload_selected');
    setTourCompletionGreetingVisible(false);
    schedulePostTutorialReminder();
    tabSwipeContext?.goToTab(1, {
      animation: 'slide',
      durationMs: 420,
    });
    setTimeout(() => {
      tabSwipeContext?.triggerCacheAddAction();
    }, 500);
  }, [schedulePostTutorialReminder, tabSwipeContext]);

  const tourSampleCard = React.useMemo(() => {
    if (appTour.sampleCardId) {
      const exactCard = allCards.find(
        (card) => card.id === appTour.sampleCardId
      );
      if (exactCard) return exactCard;
    }
    const normalizedTarget = TOUR_TARGET_WORD.toLowerCase();
    return (
      allCards.find((card) => {
        const targetWord = (card.targetWord || '').trim().toLowerCase();
        const targetPhrase = (card.targetPhrase || '').trim().toLowerCase();
        return targetWord === normalizedTarget;
      }) ||
      allCards[0] ||
      null
    );
  }, [allCards, appTour.sampleCardId]);

  React.useEffect(() => {
    if (appTour.step !== 'STEP_8_FLICK_CARD') return;
    if (!appTour.sampleCardId || tourSampleCard?.id !== appTour.sampleCardId)
      return;
    if (openedTourCardIdRef.current === tourSampleCard.id) return;

    openedTourCardIdRef.current = tourSampleCard.id;
    const scopedCardIds = allCards.map((card) => card.id);
    navigation.navigate('CardDetail', {
      cardId: tourSampleCard.id,
      cardIds: scopedCardIds.length > 0 ? scopedCardIds : [tourSampleCard.id],
      albumName: tUI(uiLanguage, 'deck.albumAllCards'),
      headerTitle: tUI(uiLanguage, 'deck.albumAllCards'),
    });
  }, [
    allCards,
    appTour.sampleCardId,
    appTour.step,
    navigation,
    tourSampleCard,
    uiLanguage,
  ]);

  React.useEffect(() => {
    if (appTour.step !== 'STEP_5_PROCESS_CACHE_CARD') return;
    console.log(
      `[FirstRunTrace] deck_main.step5_go_cache tabSwipeContext=${Boolean(tabSwipeContext)} step=${appTour.step}`
    );
    tabSwipeContext?.goToTab(1, { animation: 'slide', durationMs: 620 });
  }, [appTour.step, tabSwipeContext]);

  const handleTourTargetPress = React.useCallback(() => {
    if (appTour.step === 'STEP_10_QUIZ_SAMPLE') {
      didOpenTourQuizRef.current = true;
      pressTodayReviewRef.current();
      appTour.resetTourState();
      return;
    }

    if (appTour.step === 'STEP_11_CREATE_ALBUM') {
      setNewAlbumName((prev) => (prev.trim() ? prev : 'My Nuances'));
      appTour.resetTourState();
      setTimeout(() => {
        setIsCreateModalVisible(true);
        setTimeout(() => {
          appTour.goToStep('STEP_12_CONFIRM_ALBUM');
        }, 420);
      }, 420);
      return;
    }
    appTour.nextStep();
  }, [allCards, appTour, navigation, tourSampleCard, uiLanguage]);

  const applyMainScreenSettings = React.useCallback(
    (settings: {
      uiLanguage: UILanguage;
      wordPopSlideMs: number;
      mainScreenAlbumGridCount: MainScreenAlbumGridCount;
      mainScreenWordPopEnabled: boolean;
      mainScreenWordPopAlbumId: string | null;
      mainScreenAlbumOrder: string[];
    }) => {
      setUiLanguage(settings.uiLanguage);
      setWordPopSlideMs(settings.wordPopSlideMs);
      setMainScreenAlbumGridCount(settings.mainScreenAlbumGridCount);
      setMainScreenWordPopEnabled(settings.mainScreenWordPopEnabled);
      setMainScreenWordPopAlbumId(settings.mainScreenWordPopAlbumId);
      setMainScreenAlbumOrder(settings.mainScreenAlbumOrder);
    },
    []
  );

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

  React.useEffect(
    () =>
      subscribeDeckAlbumPreferences((prefs) => {
        setCustomAlbums(prefs.customAlbums);
        setAlbumNameOverrides(prefs.albumNameOverrides);
        setAlbumEmojiOverrides(prefs.albumEmojiOverrides);
        setAlbumColorOverrides(prefs.albumColorOverrides);
        setAlbumCoverOverrides(prefs.albumCoverOverrides);
        setDeletedAlbumIds(prefs.deletedAlbumIds);
      }),
    []
  );

  React.useEffect(() => {
    if (VIDEO_TOUR_ENABLED) return;
    if (didCheckTourRef.current) return;
    didCheckTourRef.current = true;
    let cancelled = false;

    const checkTourStatus = async () => {
      try {
        const userId = await getCurrentSessionUserId();
        if (!userId || cancelled) return;
        const localSeen = await hasSeenTourLocally(userId);
        if (localSeen || cancelled) return;
        const { data, error } = await supabase
          .from('profiles')
          .select('onboarding_completed, has_seen_tour')
          .eq('id', userId)
          .maybeSingle();
        if (error) throw error;
        if (data?.has_seen_tour === true) {
          await markTourSeenLocally(userId);
          return;
        }
        if (
          !cancelled &&
          data?.onboarding_completed === true &&
          data?.has_seen_tour !== true
        ) {
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
    let sub: { unsubscribe: () => void } | undefined;
    let cancelled = false;

    const load = async () => {
      try {
        const userId = await getCurrentSessionUserId();
        if (!userId) {
          if (!cancelled) {
            setAllCards([]);
            setCardsHydrated(true);
          }
          return;
        }
        const queryCards = database
          .get<Card>('cards')
          .query(
            Q.where('user_id', userId),
            Q.where('deleted_at', null),
            Q.sortBy('created_at', Q.desc)
          );
        const data = await withLocalCardQueryTimeout(queryCards.fetch());
        if (cancelled) return;
        setAllCards(data);
        setCardsHydrated(true);
        sub = queryCards.observe().subscribe((nextData) => {
          setAllCards(nextData);
        });
      } catch (error) {
        console.error('[Deck] load cards failed:', error);
        if (!cancelled) {
          setAllCards([]);
          setCardsHydrated(true);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const removeMockVisualCards = async () => {
      try {
        const userId = await getCurrentSessionUserId();
        if (!userId || cancelled) return;

        const mockQuery = database
          .get<Card>('cards')
          .query(
            Q.where('user_id', userId),
            Q.where('source_app', 'mock-visual')
          );
        const mockCards = await mockQuery.fetch();
        if (cancelled) return;
        if (mockCards.length === 0) return;

        await database.write(async () => {
          await database.batch(
            ...mockCards.map((card) => card.prepareDestroyPermanently())
          );
        });
      } catch (error) {
        console.warn('[DeckMain] remove mock visual cards failed:', error);
      }
    };
    void removeMockVisualCards();
    return () => {
      cancelled = true;
    };
  }, []);

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

  React.useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      QUIZ_REVIEWED_CARD_EVENT,
      (cardId: unknown) => {
        if (typeof cardId !== 'string' || !cardId.trim()) return;
        setQuizReviewedCardIds((prev) => {
          if (prev.has(cardId)) return prev;
          const next = new Set(prev);
          next.add(cardId);
          return next;
        });
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

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
          const userId = await getCurrentSessionUserId();
          if (userId) {
            try {
              await localizeDefaultExperienceSavedCard(
                userId,
                settings.uiLanguage
              );
            } catch (error) {
              console.warn(
                '[DeckMain] localize default experience card failed:',
                error
              );
            }
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
            setTodayReviewSourceAlbumIds(prefs.selectedSourceAlbumIds);
          }
        } catch (error) {
          console.warn(
            '[DeckMain] load today review preferences failed:',
            error
          );
          if (active) {
            setTodayReviewQuestionCount(
              DEFAULT_ALBUM_REVIEW_PREFERENCES.questionCount
            );
            setTodayNewWordsOnly(
              DEFAULT_ALBUM_REVIEW_PREFERENCES.todayNewWordsOnly ?? false
            );
            setTodayReviewQuestionTypes(
              DEFAULT_ALBUM_REVIEW_PREFERENCES.selectedQuestionTypes
            );
            setTodayReviewSourceAlbumIds(
              DEFAULT_ALBUM_REVIEW_PREFERENCES.selectedSourceAlbumIds
            );
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
    const timer = setInterval(
      () => {
        setImageReloadSeed((prev) => prev + 1);
      },
      25 * 60 * 1000
    );

    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const loadCardImages = async () => {
      const nextMap: Record<string, string> = {};
      for (
        let start = 0;
        start < allCards.length;
        start += CARD_IMAGE_RESOLVE_BATCH_SIZE
      ) {
        if (cancelled) return;
        const batch = allCards.slice(
          start,
          start + CARD_IMAGE_RESOLVE_BATCH_SIZE
        );
        await Promise.all(
          batch.map(async (card) => {
            try {
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
            } catch (error) {
              console.warn('[DeckMain] card image resolve crashed', {
                cardId: card.id,
                error,
              });
            }
          })
        );
      }
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
    [
      allCards,
      cardImageMap,
      customAlbums,
      albumNameOverrides,
      albumEmojiOverrides,
      albumColorOverrides,
      albumCoverOverrides,
      deletedAlbumIds,
    ]
  );

  const todayReviewSourceAlbums = React.useMemo(
    () =>
      mergedAlbums.map((album) => ({
        id: album.id,
        label: getDeckAlbumDisplayName(album, uiLanguage),
        emoji: album.emoji,
        color: album.color,
        coverImageUri: album.coverImageUri,
      })),
    [mergedAlbums, uiLanguage]
  );

  const processedAlbums = React.useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    let result = [...mergedAlbums];

    if (keyword) {
      result = result.filter((album) => {
        const inName = getDeckAlbumDisplayName(album, uiLanguage)
          .toLowerCase()
          .includes(keyword);
        const inCards = album.latestCards.some(
          (card) =>
            card.previewText?.toLowerCase().includes(keyword) ||
            card.cardTypeText.toLowerCase().includes(keyword)
        );
        return inName || inCards;
      });
      return result;
    }

    const orderIndex = new Map(
      mainScreenAlbumOrder
        .filter((slot) => !isMainScreenEmptyAlbumSlot(slot))
        .map((albumId, index) => [albumId, index])
    );

    if (mainScreenAlbumOrder.length === 0) return result;

    const albumById = new Map(result.map((album) => [album.id, album]));
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

    result.forEach((album) => {
      if (!usedAlbumIds.has(album.id)) {
        laidOutAlbums.push(album);
      }
    });

    while (
      laidOutAlbums.length > 0 &&
      laidOutAlbums[laidOutAlbums.length - 1] == null
    ) {
      laidOutAlbums.pop();
    }

    return laidOutAlbums.length > 0 ? laidOutAlbums : result;
  }, [mainScreenAlbumOrder, mergedAlbums, searchQuery, uiLanguage]);

  const wordPopAlbum = React.useMemo(() => {
    if (!mainScreenWordPopAlbumId)
      return (
        mergedAlbums.find((album) => album.id === ALL_CARDS_ALBUM_ID) ?? null
      );
    return (
      mergedAlbums.find((album) => album.id === mainScreenWordPopAlbumId) ??
      null
    );
  }, [mainScreenWordPopAlbumId, mergedAlbums]);

  const wordPopScopedCards = React.useMemo(() => {
    if (!wordPopAlbum || wordPopAlbum.id === ALL_CARDS_ALBUM_ID)
      return allCards;
    const allowedIds = new Set(wordPopAlbum.cardIds);
    return allCards.filter((card) => allowedIds.has(card.id));
  }, [allCards, wordPopAlbum]);

  const wordPopScopedCardIds = React.useMemo(
    () => wordPopScopedCards.map((card) => card.id),
    [wordPopScopedCards]
  );

  const slideshowItems = React.useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{
      cardId: string;
      text: string;
      translation?: string;
      sentence?: string;
      imageUri?: string;
    }> = [];

    wordPopScopedCards.forEach((card) => {
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
        translation: (
          card.definition ||
          card.contextualExplanation ||
          ''
        ).trim(),
        sentence: (card.originalSentence || '').trim(),
        imageUri: cardImageMap[card.id],
      });
    });

    return list;
  }, [wordPopScopedCards, cardImageMap]);

  const searchResults = React.useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return [];
    const seen = new Set<string>();
    const list: Array<{ cardId: string; text: string; translation?: string }> =
      [];
    allCards.forEach((card) => {
      const phrase = (card.targetPhrase || '').trim();
      const word = (card.targetWord || '').trim();
      const candidate = phrase || word;
      if (!candidate) return;
      const haystack =
        `${candidate} ${card.definition || ''} ${card.originalSentence || ''}`.toLowerCase();
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
      .filter(
        (card) => !!card.createdAt && toDayKey(card.createdAt) === todayKey
      )
      .map((card) => card.id);
  }, [allCards, toDayKey]);

  const todayUnreviewedCardIds = React.useMemo(
    () => todayCardIds.filter((id) => !quizReviewedCardIds.has(id)),
    [todayCardIds, quizReviewedCardIds]
  );
  const todayUnreviewedCount = todayUnreviewedCardIds.length;

  React.useEffect(() => {
    void ReminderNotificationService.evaluateAndSchedule({
      allowSoftPrompt: false,
    }).catch((error) => {
      console.warn(
        '[Reminders] schedule after today review change failed:',
        error
      );
    });
  }, [todayCardIds.length, todayUnreviewedCount]);

  const quizUsableCards = React.useMemo(
    () => allCards.filter(hasQuizUsableCard),
    [allCards]
  );

  const todayUnreviewedQuizUsableCardIds = React.useMemo(() => {
    const usableIds = new Set(quizUsableCards.map((card) => card.id));
    return todayUnreviewedCardIds.filter((id) => usableIds.has(id));
  }, [quizUsableCards, todayUnreviewedCardIds]);
  const todayQuizUsableCardIds = React.useMemo(() => {
    const usableIds = new Set(quizUsableCards.map((card) => card.id));
    return todayCardIds.filter((id) => usableIds.has(id));
  }, [quizUsableCards, todayCardIds]);

  const todayReviewSourceCardIdSet = React.useMemo(() => {
    const selectedIds = todayReviewSourceAlbumIds.length
      ? todayReviewSourceAlbumIds
      : [ALL_CARDS_ALBUM_ID];
    const selectedAlbums = mergedAlbums.filter((album) =>
      selectedIds.includes(album.id)
    );

    if (
      selectedIds.includes(ALL_CARDS_ALBUM_ID) ||
      selectedAlbums.length === 0
    ) {
      return new Set(quizUsableCards.map((card) => card.id));
    }

    return new Set(selectedAlbums.flatMap((album) => album.cardIds));
  }, [mergedAlbums, quizUsableCards, todayReviewSourceAlbumIds]);

  const sourceQuizUsableCards = React.useMemo(
    () =>
      quizUsableCards.filter((card) => todayReviewSourceCardIdSet.has(card.id)),
    [quizUsableCards, todayReviewSourceCardIdSet]
  );
  const sourceTodayQuizUsableCardIds = React.useMemo(
    () =>
      todayQuizUsableCardIds.filter((id) => todayReviewSourceCardIdSet.has(id)),
    [todayQuizUsableCardIds, todayReviewSourceCardIdSet]
  );
  const sourceTodayUnreviewedQuizUsableCardIds = React.useMemo(
    () =>
      todayUnreviewedQuizUsableCardIds.filter((id) =>
        todayReviewSourceCardIdSet.has(id)
      ),
    [todayUnreviewedQuizUsableCardIds, todayReviewSourceCardIdSet]
  );

  const handlePressTodayReview = React.useCallback(() => {
    if (__DEV__ && isScreenshotDemoModeEnabled()) {
      hideDefaultExperienceQuizHint();
      navigation.navigate('CardReview', {
        albumId: 'default-experience-demo',
        albumName: tUI(uiLanguage, 'deck.allCardsReview'),
        cardIds: [],
        questionCount: 3,
        selectedQuestionTypes: [
          'word_to_translation',
          'sentence_to_translation',
          'pronunciation',
        ],
        themeColor: '#2D9E66',
        isScreenshotDemoQuiz: true,
      });
      return;
    }

    const isDefaultExperienceTutorial = showDefaultExperienceQuizHint;
    hideDefaultExperienceQuizHint();
    if (!cardsHydrated) {
      navigation.navigate('CardReview', {
        albumId: 'all-cards',
        albumName: tUI(uiLanguage, 'deck.allCardsReview'),
        cardIds: [],
        questionCount: todayReviewQuestionCount,
        selectedQuestionTypes: todayReviewQuestionTypes,
        themeColor: '#2D9E66',
        isDefaultExperienceTutorial,
      });
      return;
    }

    if (sourceQuizUsableCards.length === 0) {
      Alert.alert(
        tUI(uiLanguage, 'deck.alertNoWordsTitle'),
        tUI(uiLanguage, 'deck.alertNoWordsBody')
      );
      return;
    }

    const shouldUseTodayCards =
      todayNewWordsOnly && sourceTodayQuizUsableCardIds.length > 0;
    const tutorialCard = isDefaultExperienceTutorial
      ? sourceQuizUsableCards.find(
          (card) =>
            (card.originalSentence || '').trim() ===
              DEFAULT_EXPERIENCE_CARD_SENTENCE &&
            (card.targetWord || '').trim().toLowerCase() ===
              DEFAULT_EXPERIENCE_TARGET_WORD
        )
      : null;

    navigation.navigate('CardReview', {
      albumId: shouldUseTodayCards ? 'today-added' : 'all-cards',
      albumName: shouldUseTodayCards
        ? tUI(uiLanguage, 'deck.todayReview')
        : tUI(uiLanguage, 'deck.allCardsReview'),
      cardIds: tutorialCard
        ? [tutorialCard.id]
        : shouldUseTodayCards
          ? sourceTodayQuizUsableCardIds
          : sourceQuizUsableCards.map((card) => card.id),
      questionCount: isDefaultExperienceTutorial ? 3 : todayReviewQuestionCount,
      selectedQuestionTypes: isDefaultExperienceTutorial
        ? ['word_to_translation', 'sentence_to_translation', 'pronunciation']
        : todayReviewQuestionTypes,
      themeColor: '#2D9E66',
      isDefaultExperienceTutorial,
    });
  }, [
    cardsHydrated,
    hideDefaultExperienceQuizHint,
    navigation,
    showDefaultExperienceQuizHint,
    sourceQuizUsableCards,
    sourceTodayQuizUsableCardIds,
    todayNewWordsOnly,
    todayReviewQuestionCount,
    todayReviewQuestionTypes,
    uiLanguage,
  ]);

  React.useEffect(() => {
    pressTodayReviewRef.current = handlePressTodayReview;
  }, [handlePressTodayReview]);

  React.useEffect(() => {
    if (!__DEV__) return undefined;

    const openDemoQuiz = (url: string) => {
      if (!url.includes('://dev/demo-quiz')) return;
      void enableScreenshotDemoMode().finally(() => {
        hideDefaultExperienceQuizHint();
        navigation.navigate('CardReview', {
          albumId: 'default-experience-demo',
          albumName: tUI(uiLanguage, 'deck.allCardsReview'),
          cardIds: [],
          questionCount: 3,
          selectedQuestionTypes: [
            'word_to_translation',
            'sentence_to_translation',
            'pronunciation',
          ],
          themeColor: '#2D9E66',
          isScreenshotDemoQuiz: true,
        });
      });
    };

    const subscription = Linking.addEventListener('url', ({ url }) =>
      openDemoQuiz(url)
    );
    Linking.getInitialURL()
      .then((url) => {
        if (url) openDemoQuiz(url);
      })
      .catch(() => undefined);

    return () => {
      subscription.remove();
    };
  }, [hideDefaultExperienceQuizHint, navigation, uiLanguage]);

  React.useEffect(() => {
    if (!__DEV__) return;
    void hydrateScreenshotDemoMode();
  }, []);

  React.useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      DEFAULT_EXPERIENCE_TUTORIAL_COMPLETED_EVENT,
      () => {
        // The quiz is only the first part of the expanded tutorial. Do NOT
        // complete the tour / show the greeting here; advance to album creation.
        appTour.goToStep('STEP_11_CREATE_ALBUM');
      }
    );
    return () => subscription.remove();
  }, [appTour]);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!didOpenTourQuizRef.current) return;
      didOpenTourQuizRef.current = false;
    });
    return unsubscribe;
  }, [navigation]);

  const handleChangeTodayReviewQuestionCount = React.useCallback(
    (nextCount: number) => {
      setTodayReviewQuestionCount(nextCount);
      void saveAlbumReviewPreferences('today-added', {
        questionCount: nextCount,
      });
    },
    []
  );

  const handleChangeTodayNewWordsOnly = React.useCallback(
    (enabled: boolean) => {
      setTodayNewWordsOnly(enabled);
      void saveAlbumReviewPreferences('today-added', {
        todayNewWordsOnly: enabled,
      });
    },
    []
  );

  const handleChangeTodayReviewQuestionTypes = React.useCallback(
    (nextTypes: ReviewQuestionType[]) => {
      setTodayReviewQuestionTypes(nextTypes);
      void saveAlbumReviewPreferences('today-added', {
        selectedQuestionTypes: nextTypes,
      });
    },
    []
  );

  const handleChangeTodayReviewSourceAlbumIds = React.useCallback(
    (nextIds: string[]) => {
      const normalizedIds =
        nextIds.length > 0
          ? Array.from(new Set(nextIds))
          : [ALL_CARDS_ALBUM_ID];
      setTodayReviewSourceAlbumIds(normalizedIds);
      void saveAlbumReviewPreferences('today-added', {
        selectedSourceAlbumIds: normalizedIds,
      });
    },
    []
  );

  const handleAlbumPress = React.useCallback(
    (album: DeckAlbum) => {
      // STEP_13 教學：暫時鎖定單點進入教學相簿，強迫使用者練習長按
      if (
        appTour.step === 'STEP_13_LONG_PRESS_ALBUM' &&
        customAlbums[0]?.id === album.id
      ) {
        return;
      }
      const albumCardIdSet = new Set(album.cardIds);
      const optimisticCards =
        album.id === ALL_CARDS_ALBUM_ID || album.id === 'all-cards'
          ? allCards
          : allCards.filter((card) => albumCardIdSet.has(card.id));
      const optimisticImageMap = optimisticCards.reduce<Record<string, string>>(
        (next, card) => {
          const uri = cardImageMap[card.id];
          if (uri) next[card.id] = uri;
          return next;
        },
        {}
      );

      primeAlbumPreload(album.id, {
        cards: optimisticCards,
        cardImageMap: optimisticImageMap,
        seenCardIds,
      });
      navigation.navigate('AlbumView', { album, isDefault: album.isDefault });
    },
    [allCards, appTour, cardImageMap, customAlbums, navigation, seenCardIds]
  );

  const openAlbumSettings = React.useCallback(
    (album: DeckAlbum) => {
      setSettingsAlbum(album);
      setSettingsName(getDeckAlbumDisplayName(album, uiLanguage));
      setSettingsEmoji(album.emoji || '📁');
      setSettingsColor(album.color || '#1E293B');
      setSettingsCoverImageUri(
        albumCoverOverrides[album.id] || album.coverImageUri || ''
      );
      setSettingsVisible(true);
    },
    [albumCoverOverrides, uiLanguage]
  );

  const handleAddAlbum = React.useCallback(() => {
    const trimmedName =
      newAlbumName.trim() ||
      (appTour.step === 'STEP_12_CONFIRM_ALBUM'
        ? tUI(uiLanguage, 'deck.albumMyNuances')
        : '');
    if (!trimmedName) return;

    const newAlbum = createCustomAlbum(trimmedName);
    const isTourConfirmation = appTour.step === 'STEP_12_CONFIRM_ALBUM';

    const finishAlbumCreation = () => {
      setCustomAlbums((prev) => [newAlbum, ...prev]);
      setIsCreateModalVisible(false);
      setNewAlbumName('');
    };

    if (isTourConfirmation) {
      appTour.resetTourState();
      setTimeout(() => {
        finishAlbumCreation();
        setTimeout(() => {
          appTour.goToStep('STEP_13_LONG_PRESS_ALBUM');
        }, 520);
      }, 420);
      return;
    }

    finishAlbumCreation();
  }, [appTour, newAlbumName, openAlbumSettings, uiLanguage]);

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

  const applyAlbumSettings = React.useCallback(
    (nextCoverImageUri?: string) => {
      if (!settingsAlbum) return;

      const nextName = settingsName.trim();
      if (!nextName) {
        Alert.alert(
          tUI(uiLanguage, 'deck.alertAlbumNameEmptyTitle'),
          tUI(uiLanguage, 'deck.alertAlbumNameEmptyBody')
        );
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

      const isCustomAlbum = customAlbums.some(
        (it) => it.id === settingsAlbum.id
      );
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
        setAlbumNameOverrides((prev) => {
          const next = { ...prev };
          const unchangedSystemName =
            !settingsAlbum.isNameCustomized &&
            nextName === getDeckAlbumDisplayName(settingsAlbum, uiLanguage);
          if (unchangedSystemName) {
            delete next[settingsAlbum.id];
          } else {
            next[settingsAlbum.id] = nextName;
          }
          return next;
        });
        setAlbumEmojiOverrides((prev) => ({
          ...prev,
          [settingsAlbum.id]: settingsEmoji,
        }));
        setAlbumColorOverrides((prev) => ({
          ...prev,
          [settingsAlbum.id]: settingsColor,
        }));
        writeCoverOverride(settingsAlbum.id, effectiveCoverImageUri);
      }

      setSettingsCoverImageUri(effectiveCoverImageUri);
      setSettingsVisible(false);
      setSettingsAlbum(null);
      return true;
    },
    [
      customAlbums,
      settingsAlbum,
      settingsName,
      settingsEmoji,
      settingsColor,
      settingsCoverImageUri,
      uiLanguage,
    ]
  );

  const handleSaveAlbumSettings = React.useCallback(() => {
    const saved = applyAlbumSettings();
    if (saved && appTour.step === 'STEP_14_ALBUM_SETTINGS') {
      completeTour();
    }
  }, [appTour.step, applyAlbumSettings, completeTour]);

  const handlePickAlbumCoverImage = React.useCallback(async () => {
    if (!settingsAlbum) return;
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          tUI(uiLanguage, 'deck.alertPhotoPermissionTitle'),
          tUI(uiLanguage, 'deck.alertPhotoPermissionBody')
        );
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
      Alert.alert(
        tUI(uiLanguage, 'deck.alertPickCoverFailedTitle'),
        tUI(uiLanguage, 'deck.alertPickCoverFailedBody')
      );
    }
  }, [settingsAlbum, uiLanguage]);

  const handleDeleteAlbum = React.useCallback(
    (album: DeckAlbum) => {
      if (album.isDefault) {
        Alert.alert(
          tUI(uiLanguage, 'deck.alertCannotDeleteTitle'),
          tUI(uiLanguage, 'deck.alertCannotDeleteBody')
        );
        return;
      }

      Alert.alert(
        tUI(uiLanguage, 'deck.alertDeleteAlbumTitle'),
        `${tUI(uiLanguage, 'deck.alertDeleteAlbumBody')}\n${getDeckAlbumDisplayName(album, uiLanguage)}`,
        [
          { text: tUI(uiLanguage, 'deck.alertCancel'), style: 'cancel' },
          {
            text: tUI(uiLanguage, 'deck.alertDelete'),
            style: 'destructive',
            onPress: () => {
              const isCustomAlbum = customAlbums.some(
                (it) => it.id === album.id
              );
              if (isCustomAlbum) {
                setCustomAlbums((prev) =>
                  prev.filter((it) => it.id !== album.id)
                );
              } else {
                setDeletedAlbumIds((prev) =>
                  prev.includes(album.id) ? prev : [...prev, album.id]
                );
              }
            },
          },
        ]
      );
    },
    [customAlbums, uiLanguage]
  );

  const handleActionEnd = React.useCallback(
    (album: DeckAlbum, action: 'none' | 'edit' | 'delete') => {
      if (action === 'edit') {
        openAlbumSettings(album);
        if (appTour.step === 'STEP_13_LONG_PRESS_ALBUM') {
          setTimeout(() => appTour.goToStep('STEP_14_ALBUM_SETTINGS'), 420);
        }
        return;
      }
      if (action === 'delete') {
        handleDeleteAlbum(album);
      }
    },
    [appTour, handleDeleteAlbum, openAlbumSettings]
  );

  const handleMenuStart = React.useCallback(
    (
      album: DeckAlbum,
      layout: { x: number; y: number; width: number; height: number }
    ) => {
      setActiveAlbum(album);
      setActiveLayout(layout);
      setIsTourMenuOpen(true);
    },
    []
  );

  const handleMenuFinish = React.useCallback(() => {
    setActiveAlbum(null);
    setActiveLayout(null);
    setIsTourMenuOpen(false);
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
      const scopedCardIds =
        wordPopScopedCardIds.length > 0
          ? wordPopScopedCardIds
          : allCards.map((card) => card.id);
      if (scopedCardIds.length === 0) {
        Alert.alert(
          tUI(uiLanguage, 'deck.alertNoCardsTitle'),
          tUI(uiLanguage, 'deck.alertNoCardsBody')
        );
        return;
      }
      const targetCardId = scopedCardIds.includes(item.cardId)
        ? item.cardId
        : scopedCardIds[0];
      const headerTitle = wordPopAlbum
        ? getDeckAlbumDisplayName(wordPopAlbum, uiLanguage)
        : tUI(uiLanguage, 'deck.albumAllCards');
      navigation.navigate('CardDetail', {
        cardId: targetCardId,
        cardIds: scopedCardIds,
        albumName: headerTitle,
        headerTitle,
      });
    },
    [allCards, navigation, uiLanguage, wordPopAlbum, wordPopScopedCardIds]
  );

  const handlePressSearchResult = React.useCallback(
    (item: { cardId: string; text: string; translation?: string }) => {
      if (!item?.cardId) return;
      const scopedCardIds = allCards.map((card) => card.id);
      if (scopedCardIds.length === 0) return;
      const targetCardId = scopedCardIds.includes(item.cardId)
        ? item.cardId
        : scopedCardIds[0];
      navigation.navigate('CardDetail', {
        cardId: targetCardId,
        cardIds: scopedCardIds,
        albumName: tUI(uiLanguage, 'deck.albumAllCards'),
        headerTitle: tUI(uiLanguage, 'deck.albumAllCards'),
      });
      setSearchQuery('');
    },
    [allCards, navigation, uiLanguage]
  );

  return (
    <>
      <DeckMainScreenUI
        heroStatusText={
          allCards.length > 0
            ? tUI(uiLanguage, 'deck.cacheNotEmpty')
            : tUI(uiLanguage, 'deck.cacheEmpty')
        }
        uiLanguage={uiLanguage}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onClearSearch={() => setSearchQuery('')}
        onPressAvatar={handleAvatarPress}
        onPressCacheFab={handleCacheFabPress}
        onOpenCreateAlbum={() => {
          if (appTour.step === 'STEP_11_CREATE_ALBUM') {
            handleTourTargetPress();
            return;
          }
          setIsCreateModalVisible(true);
        }}
        sortOrder={sortOrder}
        onToggleSort={() =>
          setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
        }
        filterPills={filterPills}
        todayReviewTotalCount={sourceTodayQuizUsableCardIds.length}
        todayReviewPendingCount={
          todayNewWordsOnly ? sourceTodayUnreviewedQuizUsableCardIds.length : 0
        }
        todayNewWordsOnly={todayNewWordsOnly}
        onPressTodayReview={handlePressTodayReview}
        onPressTodayReviewTuning={() => setShowTodayReviewTuningModal(true)}
        tourStep={appTour.step}
        onTourTargetPress={handleTourTargetPress}
        showQuickQuizTutorialArrow={showDefaultExperienceQuizHint}
        tutorialLongPressAlbumId={
          appTour.step === 'STEP_13_LONG_PRESS_ALBUM'
            ? customAlbums[0]?.id || null
            : null
        }
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
        isTourMenuOpen={isTourMenuOpen}
      />

      <ReviewTuningModalUI
        visible={showTodayReviewTuningModal}
        questionCount={todayReviewQuestionCount}
        todayNewWordsOnly={todayNewWordsOnly}
        selectedQuestionTypes={todayReviewQuestionTypes}
        sourceAlbums={todayReviewSourceAlbums}
        selectedSourceAlbumIds={todayReviewSourceAlbumIds}
        uiLanguage={uiLanguage}
        onChangeTodayNewWordsOnly={handleChangeTodayNewWordsOnly}
        onClose={() => setShowTodayReviewTuningModal(false)}
        onChangeQuestionCount={handleChangeTodayReviewQuestionCount}
        onChangeSelectedQuestionTypes={handleChangeTodayReviewQuestionTypes}
        onChangeSelectedSourceAlbumIds={handleChangeTodayReviewSourceAlbumIds}
      />

      <CreateAlbumModalUI
        visible={isCreateModalVisible}
        albumName={newAlbumName}
        uiLanguage={uiLanguage}
        onChangeAlbumName={setNewAlbumName}
        tourConfirmActive={appTour.step === 'STEP_12_CONFIRM_ALBUM'}
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
        uiLanguage={uiLanguage}
        onSelectCoverTab={handleSelectCoverTab}
        onChangeName={setSettingsName}
        onChangeEmoji={handleChangeSettingsEmoji}
        onChangeColor={handleChangeSettingsColor}
        onPickCoverImage={() => void handlePickAlbumCoverImage()}
        tourSaveActive={appTour.step === 'STEP_14_ALBUM_SETTINGS'}
        tourPickCoverActive={appTour.step === 'STEP_14_ALBUM_SETTINGS'}
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
          uiLanguage={uiLanguage}
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

      <TourCompletionGreetingUI
        visible={tourCompletionGreetingVisible}
        title={tUI(uiLanguage, 'deck.tourCompleteTitle')}
        body={tUI(uiLanguage, 'deck.tourCompleteBody')}
        shareLabel={
          uiLanguage === 'zh-TW'
            ? '我會用分享選單'
            : uiLanguage === 'zh-CN'
              ? '我会用分享菜单'
              : 'I’ll use Share'
        }
        uploadLabel={
          uiLanguage === 'zh-TW'
            ? '立即上傳'
            : uiLanguage === 'zh-CN'
              ? '立即上传'
              : 'Upload now'
        }
        onShare={handleGreetingShare}
        onUpload={handleGreetingUpload}
      />

      <AlbumActionMenuOverlayUI
        isMenuVisible={isMenuVisible}
        startX={startX}
        startY={startY}
        hoveredAction={hoveredAction}
        activeAlbum={activeAlbum}
        uiLanguage={uiLanguage}
        activeLayout={activeLayout}
        tourStep={appTour.step}
        isTourMenuOpen={isTourMenuOpen}
      />
    </>
  );
}
