import React from 'react';
import {
  Animated,
  AccessibilityInfo,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as Haptics from 'expo-haptics';
import { supabase } from '@services/supabase/client';
import {
  getInitialUserSettings,
  loadUserSettings,
  subscribeUserSettings,
  type UILanguage,
} from '@services/settings/userSettings';
import { markTourSeenLocally } from '../../features/tour/tourSeen';
import { getVisibleTourSlides } from '../../features/tour/tutorialPresentation';
import { resolveThemeColors } from '../../theme/colors';
import { traceFirstRun } from '../../services/logging/firstRunTraceRuntime';

type VideoTourStep = {
  key: string;
  playbackRate: number;
  videos: {
    key: string;
    source: number;
  }[];
  eyebrow: Record<UILanguage, string>;
  title: Record<UILanguage, string>;
  body: Record<UILanguage, string>;
};

type Props = {
  userId: string;
  onComplete: () => void;
  markSeenOnComplete?: boolean;
};

const TOUR_CONTINUE_LABELS: Record<UILanguage, string> = {
  en: 'Next',
  'zh-TW': '下一步',
  'zh-CN': '下一步',
  ja: '次へ',
  ko: '다음',
  es: 'Siguiente',
  fr: 'Suivant',
};

const TOUR_START_LABELS: Record<UILanguage, string> = {
  en: 'Start learning',
  'zh-TW': '開始使用',
  'zh-CN': '开始使用',
  ja: '学習を始める',
  ko: '학습 시작',
  es: 'Empezar a aprender',
  fr: 'Commencer à apprendre',
};

const TOUR_SKIP_LABELS: Record<UILanguage, string> = {
  en: 'Skip',
  'zh-TW': '跳過',
  'zh-CN': '跳过',
  ja: 'スキップ',
  ko: '건너뛰기',
  es: 'Omitir',
  fr: 'Ignorer',
};

const TOUR_STEPS: VideoTourStep[] = [
  {
    key: 'share',
    playbackRate: 1.02,
    videos: [
      {
        key: 'share-or-capture',
        source: require('../../../assets/tutorial/raw/Chinese/01_share_or_capture.mov'),
      },
    ],
    eyebrow: {
      en: 'Capture',
      'zh-TW': '收進來',
      'zh-CN': '收进来',
      ja: '取り込む',
      ko: '담기',
      es: 'Capturar',
      fr: 'Capturer',
    },
    title: {
      en: 'Screenshot. Share. See you later.',
      'zh-TW': '截圖。分享。晚點見。',
      'zh-CN': '截图。分享。晚点见。',
      ja: 'スクリーンショット。共有。あとで確認。',
      ko: '스크린샷. 공유. 나중에 확인하세요.',
      es: 'Captura. Comparte. Revísalo después.',
      fr: 'Capturez. Partagez. Retrouvez-le plus tard.',
    },
    body: {
      en: '',
      'zh-TW': '',
      'zh-CN': '',
      ja: '',
      ko: '',
      es: '',
      fr: '',
    },
  },
  {
    key: 'upload',
    playbackRate: 1.02,
    videos: [
      {
        key: 'upload-text',
        source: require('../../../assets/tutorial/raw/Chinese/02_upload_text.mov'),
      },
      {
        key: 'upload-image',
        source: require('../../../assets/tutorial/raw/Chinese/03_upload_image.mov'),
      },
    ],
    eyebrow: {
      en: 'Cache',
      'zh-TW': '暫存',
      'zh-CN': '暂存',
      ja: '一時保存',
      ko: '임시 보관함',
      es: 'Caché',
      fr: 'Cache',
    },
    title: {
      en: 'Text? Image? We got you.',
      'zh-TW': '文字？圖片？交給我們。',
      'zh-CN': '文字？图片？交给我们。',
      ja: 'テキストも画像も、おまかせください。',
      ko: '텍스트든 이미지든 맡겨 주세요.',
      es: '¿Texto o imagen? Nosotros nos encargamos.',
      fr: "Texte ou image ? On s'en charge.",
    },
    body: {
      en: '',
      'zh-TW': '',
      'zh-CN': '',
      ja: '',
      ko: '',
      es: '',
      fr: '',
    },
  },
  {
    key: 'create',
    playbackRate: 1.35,
    videos: [
      {
        key: 'make-card',
        source: require('../../../assets/tutorial/raw/Chinese/04_make_card.mov'),
      },
    ],
    eyebrow: {
      en: 'Create',
      'zh-TW': '變成卡片',
      'zh-CN': '变成卡片',
      ja: 'カードを作成',
      ko: '카드 만들기',
      es: 'Crear tarjeta',
      fr: 'Créer une carte',
    },
    title: {
      en: 'Learn effortlessly.',
      'zh-TW': '輕鬆學會。',
      'zh-CN': '轻松学会。',
      ja: '気軽に学ぼう。',
      ko: '부담 없이 학습하세요.',
      es: 'Aprende sin esfuerzo.',
      fr: 'Apprenez sans effort.',
    },
    body: {
      en: '',
      'zh-TW': '',
      'zh-CN': '',
      ja: '',
      ko: '',
      es: '',
      fr: '',
    },
  },
  {
    key: 'review',
    playbackRate: 1.42,
    videos: [
      {
        key: 'review-card',
        source: require('../../../assets/tutorial/raw/Chinese/05_review_card.mov'),
      },
    ],
    eyebrow: {
      en: 'Review',
      'zh-TW': '複習',
      'zh-CN': '复习',
      ja: '復習',
      ko: '복습',
      es: 'Repasar',
      fr: 'Réviser',
    },
    title: {
      en: 'Up for some challenges?',
      'zh-TW': '來點挑戰？',
      'zh-CN': '来点挑战？',
      ja: 'チャレンジしてみる？',
      ko: '도전해 볼까요?',
      es: '¿Te apetece un reto?',
      fr: 'Prêt pour un défi ?',
    },
    body: {
      en: '',
      'zh-TW': '',
      'zh-CN': '',
      ja: '',
      ko: '',
      es: '',
      fr: '',
    },
  },
];

function copyFor(
  language: UILanguage,
  copy: Record<UILanguage, string>
): string {
  return copy[language] || copy.en;
}

function TutorialVideo({
  source,
  playbackRate,
  isPlaybackActive,
  reduceMotionEnabled,
  compact,
}: {
  source: number;
  playbackRate: number;
  isPlaybackActive: boolean;
  reduceMotionEnabled: boolean;
  compact?: boolean;
}) {
  const player = useVideoPlayer(source, (nextPlayer) => {
    nextPlayer.audioMixingMode = 'mixWithOthers';
    nextPlayer.loop = true;
    nextPlayer.muted = true;
    nextPlayer.playbackRate = playbackRate;
  });

  React.useEffect(() => {
    player.loop = !reduceMotionEnabled;
    player.muted = true;
    player.playbackRate = playbackRate;
    if (reduceMotionEnabled || !isPlaybackActive) {
      player.pause();
      return;
    }
    player.play();
  }, [isPlaybackActive, playbackRate, player, reduceMotionEnabled]);

  return (
    <VideoView
      player={player}
      nativeControls={false}
      allowsFullscreen={false}
      allowsVideoFrameAnalysis={false}
      contentFit="cover"
      style={[styles.video, compact && styles.videoCompact]}
    />
  );
}

function VideoTourSlide({
  step,
  slideIndex,
  activeIndex,
  transitioningFromIndex,
  animatedIndex,
  stageWidth,
  stageHeight,
  colorScheme,
  uiLanguage,
  textColor,
  secondaryTextColor,
  reduceMotionEnabled,
}: {
  step: VideoTourStep;
  slideIndex: number;
  activeIndex: number;
  transitioningFromIndex: number | null;
  animatedIndex: Animated.Value;
  stageWidth: number;
  stageHeight: number;
  colorScheme: 'light' | 'dark' | null | undefined;
  uiLanguage: UILanguage;
  textColor: string;
  secondaryTextColor: string;
  reduceMotionEnabled: boolean;
}) {
  const [copyHeight, setCopyHeight] = React.useState(68);
  const isPlaybackActive =
    slideIndex === activeIndex || slideIndex === transitioningFromIndex;
  const isDoubleVideo = step.videos.length > 1;
  const pairGap = 10;
  const slideGap = 18;
  const phoneAspectRatio = 0.48;
  const availableMediaHeight = Math.max(
    1,
    stageHeight - copyHeight - slideGap
  );
  const frameWidth = isDoubleVideo
    ? Math.max(
        1,
        Math.min(
          Math.floor((stageWidth - pairGap) / 2),
          Math.floor(availableMediaHeight * phoneAspectRatio)
        )
      )
    : Math.max(
        1,
        Math.min(
          stageWidth,
          Math.floor(availableMediaHeight * phoneAspectRatio)
        )
      );
  const frameHeight = Math.max(1, Math.floor(frameWidth / phoneAspectRatio));
  const displayedTitle = copyFor(uiLanguage, step.title);

  const slideStyle = {
    opacity: animatedIndex.interpolate({
      inputRange: [slideIndex - 1, slideIndex, slideIndex + 1],
      outputRange: [0, 1, 0],
      extrapolate: 'clamp',
    }),
    transform: [
      {
        translateX: animatedIndex.interpolate({
          inputRange: [slideIndex - 1, slideIndex, slideIndex + 1],
          outputRange: [42, 0, -42],
          extrapolate: 'clamp',
        }),
      },
      {
        scale: animatedIndex.interpolate({
          inputRange: [slideIndex - 1, slideIndex, slideIndex + 1],
          outputRange: [0.985, 1, 0.985],
          extrapolate: 'clamp',
        }),
      },
    ],
  };

  return (
    <Animated.View
      pointerEvents={slideIndex === activeIndex ? 'auto' : 'none'}
      style={[
        styles.slide,
        slideStyle,
        { zIndex: slideIndex === activeIndex ? 3 : 1 },
      ]}
    >
      <View
        style={
          isDoubleVideo
            ? [styles.videoPair, { gap: pairGap }]
            : styles.videoSingle
        }
      >
        {step.videos.map((video) => (
          <View
            key={video.key}
            style={[
              styles.phoneFrame,
              isDoubleVideo && styles.phoneFrameCompact,
              {
                width: frameWidth,
                height: frameHeight,
                backgroundColor:
                  colorScheme === 'light' ? '#111827' : '#020617',
              },
            ]}
          >
            <View
              style={[
                styles.phoneSpeaker,
                isDoubleVideo && styles.phoneSpeakerCompact,
              ]}
            />
            <TutorialVideo
              source={video.source}
              playbackRate={step.playbackRate}
              isPlaybackActive={isPlaybackActive}
              reduceMotionEnabled={reduceMotionEnabled}
              compact={isDoubleVideo}
            />
          </View>
        ))}
      </View>

      <View
        style={styles.copyBlock}
        onLayout={(event: LayoutChangeEvent) => {
          const nextHeight = Math.ceil(event.nativeEvent.layout.height);
          setCopyHeight((currentHeight) =>
            currentHeight === nextHeight ? currentHeight : nextHeight
          );
        }}
      >
        <Text style={[styles.title, { color: textColor }]}>
          {displayedTitle}
        </Text>
        {copyFor(uiLanguage, step.body) ? (
          <Text style={[styles.body, { color: secondaryTextColor }]}>
            {copyFor(uiLanguage, step.body)}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

export default function VideoTourFlow({
  userId,
  onComplete,
  markSeenOnComplete = true,
}: Props) {
  const colorScheme = useColorScheme();
  const theme = React.useMemo(
    () => resolveThemeColors(colorScheme),
    [colorScheme]
  );
  const { height, width } = useWindowDimensions();
  const [uiLanguage, setUiLanguage] = React.useState<UILanguage>(
    getInitialUserSettings().uiLanguage
  );
  const [index, setIndex] = React.useState(0);
  const [transitioningFromIndex, setTransitioningFromIndex] = React.useState<
    number | null
  >(null);
  const [saving, setSaving] = React.useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = React.useState(false);
  const isTransitioningRef = React.useRef(false);
  const didRequestExitRef = React.useRef(false);
  const animatedIndex = React.useRef(new Animated.Value(0)).current;
  const tourExitProgress = React.useRef(new Animated.Value(0)).current;
  const [stageSize, setStageSize] = React.useState(() => ({
    width: Math.max(1, width - 46),
    height: Math.max(1, Math.round(height * 0.7)),
  }));
  const isLast = index === TOUR_STEPS.length - 1;

  React.useEffect(() => {
    traceFirstRun('video_tour', 'screen_visible', {
      slide: TOUR_STEPS[0]?.key,
      slideIndex: 0,
    });
  }, []);

  const handleStageLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.max(1, Math.floor(event.nativeEvent.layout.width));
    const nextHeight = Math.max(1, Math.floor(event.nativeEvent.layout.height));
    setStageSize((currentSize) =>
      currentSize.width === nextWidth && currentSize.height === nextHeight
        ? currentSize
        : { width: nextWidth, height: nextHeight }
    );
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void loadUserSettings().then((settings) => {
      if (!cancelled) setUiLanguage(settings.uiLanguage);
    });
    const unsubscribe = subscribeUserSettings((settings) =>
      setUiLanguage(settings.uiLanguage)
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotionEnabled(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const markSeenAndExit = React.useCallback(async () => {
    if (saving || didRequestExitRef.current) return;
    didRequestExitRef.current = true;
    traceFirstRun('video_tour', 'exit_started', {
      slide: TOUR_STEPS[index]?.key,
      slideIndex: index,
      markSeenOnComplete,
    });
    setSaving(true);
    void Haptics.selectionAsync();
    try {
      if (markSeenOnComplete) {
        await markTourSeenLocally(userId);
        const { error } = await supabase
          .from('profiles')
          .update({ has_seen_tour: true, updated_at: new Date().toISOString() })
          .eq('id', userId);
        if (error) throw error;
      }
    } catch (error) {
      traceFirstRun('video_tour', 'mark_seen_failed', { error });
      console.warn('[VideoTour] mark tour seen failed:', error);
    }
    const complete = () => {
      traceFirstRun('video_tour', 'exit_finished');
      setSaving(false);
      onComplete();
    };
    if (reduceMotionEnabled) {
      complete();
      return;
    }
    Animated.timing(tourExitProgress, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(complete);
  }, [
    markSeenOnComplete,
    onComplete,
    reduceMotionEnabled,
    saving,
    tourExitProgress,
    userId,
  ]);

  const goNext = React.useCallback(() => {
    if (isTransitioningRef.current) return;
    if (isLast) {
      void markSeenAndExit();
      return;
    }
    void Haptics.selectionAsync();
    const nextIndex = Math.min(index + 1, TOUR_STEPS.length - 1);
    traceFirstRun('video_tour', 'slide_advanced', {
      from: TOUR_STEPS[index]?.key,
      to: TOUR_STEPS[nextIndex]?.key,
      slideIndex: nextIndex,
    });
    if (reduceMotionEnabled) {
      animatedIndex.setValue(nextIndex);
      setIndex(nextIndex);
      setTransitioningFromIndex(null);
      return;
    }
    isTransitioningRef.current = true;
    setTransitioningFromIndex(index);
    setIndex(nextIndex);
    Animated.timing(animatedIndex, {
      toValue: nextIndex,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setTransitioningFromIndex(null);
      }
      isTransitioningRef.current = false;
    });
  }, [animatedIndex, index, isLast, markSeenAndExit, reduceMotionEnabled]);

  React.useEffect(() => {
    if (!reduceMotionEnabled) return;
    animatedIndex.stopAnimation();
    animatedIndex.setValue(index);
    setTransitioningFromIndex(null);
    isTransitioningRef.current = false;
  }, [animatedIndex, index, reduceMotionEnabled]);

  const animatedDots = React.useMemo(
    () =>
      TOUR_STEPS.map((_, dotIndex) => ({
        opacity: animatedIndex.interpolate({
          inputRange: [dotIndex - 1, dotIndex, dotIndex + 1],
          outputRange: [0.38, 1, 0.38],
          extrapolate: 'clamp',
        }),
      })),
    [animatedIndex]
  );

  const visibleTourSteps = React.useMemo(
    () =>
      getVisibleTourSlides(
        TOUR_STEPS.length,
        index,
        transitioningFromIndex
      ).map((slideIndex) => ({ item: TOUR_STEPS[slideIndex], slideIndex })),
    [index, transitioningFromIndex]
  );

  const continueButtonLabel = TOUR_CONTINUE_LABELS[uiLanguage];
  const startButtonLabel = TOUR_START_LABELS[uiLanguage];

  const continueLabelOpacity = animatedIndex.interpolate({
    inputRange: [TOUR_STEPS.length - 2, TOUR_STEPS.length - 1],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const startLabelOpacity = animatedIndex.interpolate({
    inputRange: [TOUR_STEPS.length - 2, TOUR_STEPS.length - 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const nextIconOpacity = animatedIndex.interpolate({
    inputRange: [TOUR_STEPS.length - 2, TOUR_STEPS.length - 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const arrowIconOpacity = animatedIndex.interpolate({
    inputRange: [TOUR_STEPS.length - 2, TOUR_STEPS.length - 1],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const tourExitStyle = {
    opacity: tourExitProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    }),
    transform: [
      {
        scale: tourExitProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.985],
          extrapolate: 'clamp',
        }),
      },
      {
        translateY: tourExitProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -10],
          extrapolate: 'clamp',
        }),
      },
    ],
  };

  return (
    <LinearGradient
      colors={
        colorScheme === 'light'
          ? ['#F8F3EA', '#EAF7FF']
          : ['#061A2E', '#03101E']
      }
      style={styles.root}
    >
      <SafeAreaView style={styles.safe}>
        <Animated.View style={[styles.tourContent, tourExitStyle]}>
          <View style={styles.stage} onLayout={handleStageLayout}>
            {visibleTourSteps.map(({ item, slideIndex }) => (
              <VideoTourSlide
                key={item.key}
                step={item}
                slideIndex={slideIndex}
                activeIndex={index}
                transitioningFromIndex={transitioningFromIndex}
                animatedIndex={animatedIndex}
                stageWidth={stageSize.width}
                stageHeight={stageSize.height}
                colorScheme={colorScheme}
                uiLanguage={uiLanguage}
                textColor={theme.textOnBg}
                secondaryTextColor={theme.secondaryText}
                reduceMotionEnabled={reduceMotionEnabled || saving}
              />
            ))}
          </View>

          <View style={styles.footer}>
            <View style={styles.dots}>
              {TOUR_STEPS.map((item, dotIndex) => (
                <Animated.View
                  key={item.key}
                  style={[
                    styles.dot,
                    animatedDots[dotIndex],
                    {
                      width: dotIndex === index ? 22 : 7,
                      backgroundColor: '#4EAFF4',
                    },
                  ]}
                />
              ))}
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={goNext}
              style={({ pressed }) => [
                styles.nextButton,
                {
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                  opacity: saving ? 0.68 : 1,
                },
              ]}
            >
              <View style={styles.nextLabelStack}>
                <Animated.Text
                  style={[
                    styles.nextText,
                    styles.nextLabelLayer,
                    { opacity: continueLabelOpacity },
                  ]}
                >
                  {continueButtonLabel}
                </Animated.Text>
                <Animated.Text
                  style={[
                    styles.nextText,
                    styles.nextLabelLayer,
                    { opacity: startLabelOpacity },
                  ]}
                >
                  {startButtonLabel}
                </Animated.Text>
              </View>
              <View style={styles.nextIconStack}>
                <Animated.View
                  style={[styles.nextIconLayer, { opacity: arrowIconOpacity }]}
                >
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </Animated.View>
                <Animated.View
                  style={[styles.nextIconLayer, { opacity: nextIconOpacity }]}
                >
                  <Ionicons name="sparkles" size={18} color="#FFFFFF" />
                </Animated.View>
              </View>
            </Pressable>
          </View>
        </Animated.View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safe: {
    flex: 1,
    paddingHorizontal: 23,
  },
  tourContent: {
    flex: 1,
  },
  stage: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 2,
  },
  slide: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  videoSingle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPair: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneFrame: {
    borderRadius: 46,
    padding: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 22 },
    shadowOpacity: 0.28,
    shadowRadius: 34,
    elevation: 18,
    overflow: 'hidden',
  },
  phoneFrameCompact: {
    borderRadius: 32,
    padding: 5,
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.2,
    shadowRadius: 22,
    elevation: 14,
  },
  phoneSpeaker: {
    position: 'absolute',
    top: 15,
    alignSelf: 'center',
    width: 82,
    height: 25,
    borderRadius: 14,
    backgroundColor: '#000000',
    zIndex: 2,
  },
  phoneSpeakerCompact: {
    top: 11,
    width: 58,
    height: 18,
    borderRadius: 10,
  },
  video: {
    flex: 1,
    borderRadius: 38,
    overflow: 'hidden',
  },
  videoCompact: {
    borderRadius: 27,
  },
  copyBlock: {
    width: '100%',
    maxWidth: 392,
    alignItems: 'center',
  },
  eyebrow: {
    color: '#4EAFF4',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '900',
    letterSpacing: -1.1,
    textAlign: 'center',
  },
  body: {
    marginTop: 9,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 14,
  },
  footer: {
    paddingBottom: 14,
    gap: 14,
  },
  dots: {
    height: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  dot: {
    height: 7,
    borderRadius: 999,
  },
  nextButton: {
    minHeight: 58,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: '#FF5666',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#FF5666',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 8,
  },
  nextText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.1,
  },
  nextLabelStack: {
    flex: 1,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextLabelLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
  },
  nextIconStack: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextIconLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
