import React from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  getGreetingVideoContentFit,
  getGreetingVideoHeight,
  getGreetingVideoPlayback,
  getGreetingVideoWidth,
  shouldShowGreetingPhoneSpeaker,
} from '../../../features/tour/tutorialPresentation';
import { resolveThemeColors } from '../../../theme/colors';

const SHARE_SHEET_VIDEO_IOS = require('../../../../assets/tutorial/raw/Chinese/01_share_or_capture.mov');
const SHARE_SHEET_VIDEO_ANDROID = require('../../../../assets/tutorial/raw/android_share_v1.mp4');

type Props = {
  visible: boolean;
  title: string;
  body?: string;
  shareLabel?: string;
  uploadLabel: string;
  onShare?: () => void;
  onClose?: () => void;
  onUpload: () => void;
  platform?: 'ios' | 'android';
};

export default function TourCompletionGreetingUI({
  visible,
  title,
  uploadLabel,
  onShare,
  onClose,
  onUpload,
  platform: platformOverride,
}: Props) {
  const activePlatform = platformOverride ?? Platform.OS;
  const isAndroid = activePlatform === 'android';
  const palette = resolveThemeColors(useColorScheme());
  const { height: windowHeight } = useWindowDimensions();
  const videoHeight = getGreetingVideoHeight(windowHeight);
  const videoWidth = getGreetingVideoWidth(videoHeight, activePlatform);
  const videoContentFit = getGreetingVideoContentFit();
  const playback = getGreetingVideoPlayback(visible, activePlatform);
  const showSpeaker = shouldShowGreetingPhoneSpeaker(activePlatform);
  const videoSource = isAndroid
    ? SHARE_SHEET_VIDEO_ANDROID
    : SHARE_SHEET_VIDEO_IOS;

  const [videoEnded, setVideoEnded] = React.useState(!isAndroid);

  const player = useVideoPlayer(videoSource, (nextPlayer) => {
    nextPlayer.audioMixingMode = 'mixWithOthers';
    nextPlayer.loop = playback.loop;
    nextPlayer.muted = playback.muted;
  });

  React.useEffect(() => {
    if (!isAndroid) {
      setVideoEnded(true);
      return;
    }

    if (!visible) {
      setVideoEnded(false);
      return;
    }

    setVideoEnded(false);
    const sub = player.addListener('playToEnd', () => {
      setVideoEnded(true);
    });

    // Show continue button after first playthrough (7.2s) while video keeps looping
    const timer = setTimeout(() => {
      setVideoEnded(true);
    }, 7200);

    return () => {
      sub?.remove();
      clearTimeout(timer);
    };
  }, [isAndroid, player, visible]);

  React.useEffect(() => {
    player.loop = playback.loop;
    player.muted = playback.muted;
    if (playback.shouldPlay) {
      player.play();
    } else {
      player.pause();
    }
  }, [
    playback.loop,
    playback.muted,
    playback.shouldPlay,
    player,
  ]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose ?? onShare ?? onUpload}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            isAndroid && styles.androidCard,
            {
              backgroundColor: palette.modalBg,
              borderColor: palette.modalOptionBorder,
            },
          ]}
        >
          {!isAndroid && (
            <Text style={[styles.title, { color: palette.textOnContainer }]}>
              {title}
            </Text>
          )}
          <View
            style={[
              isAndroid ? styles.androidVideoFrame : styles.videoFrame,
              {
                height: videoHeight,
                width: videoWidth,
              },
            ]}
          >
            {showSpeaker && <View style={styles.phoneSpeaker} />}
            <View style={isAndroid ? styles.androidVideoViewport : styles.videoViewport}>
              <VideoView
                player={player}
                nativeControls={false}
                allowsFullscreen={false}
                allowsVideoFrameAnalysis={false}
                contentFit={videoContentFit}
                style={styles.video}
              />
            </View>
          </View>
          {videoEnded && (
            <Pressable style={styles.primaryButton} onPress={onUpload}>
              <Text style={styles.primaryButtonText}>{uploadLabel}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
  },
  card: {
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  androidCard: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  androidVideoFrame: {
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  androidVideoViewport: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
  },
  primaryButton: {
    minHeight: 52,
    marginTop: 18,
    marginBottom: 4,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C9FE5',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  videoFrame: {
    alignSelf: 'center',
    padding: 6,
    overflow: 'hidden',
    borderRadius: 32,
    backgroundColor: '#020617',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    elevation: 14,
  },
  phoneSpeaker: {
    position: 'absolute',
    top: 11,
    alignSelf: 'center',
    width: 58,
    height: 18,
    borderRadius: 10,
    backgroundColor: '#000000',
    zIndex: 2,
  },
  videoViewport: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 27,
    backgroundColor: '#000000',
  },
  video: {
    flex: 1,
  },
});
