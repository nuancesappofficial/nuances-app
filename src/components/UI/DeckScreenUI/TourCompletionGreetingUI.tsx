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

const SHARE_SHEET_VIDEO_IOS = require('../../../../assets/tutorial/raw/ios_share_final_1080p60.mp4');
const SHARE_SHEET_VIDEO_ANDROID = require('../../../../assets/tutorial/raw/android_share_final_1080p60.mp4');

const ANDROID_PLAYTHROUGH_DURATION_MS = 7200;
const IOS_PLAYTHROUGH_DURATION_MS = 7850;

type Props = {
  visible: boolean;
  title?: string;
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

  const [videoEnded, setVideoEnded] = React.useState(false);

  const playthroughDurationMs = isAndroid
    ? ANDROID_PLAYTHROUGH_DURATION_MS
    : IOS_PLAYTHROUGH_DURATION_MS;

  const player = useVideoPlayer(videoSource, (nextPlayer) => {
    nextPlayer.audioMixingMode = 'mixWithOthers';
    nextPlayer.loop = playback.loop;
    nextPlayer.muted = playback.muted;
  });

  React.useEffect(() => {
    if (!visible) {
      setVideoEnded(false);
      return;
    }

    setVideoEnded(false);
    const sub = player.addListener('playToEnd', () => {
      setVideoEnded(true);
    });

    // Show continue button after first playthrough while video keeps looping
    const timer = setTimeout(() => {
      setVideoEnded(true);
    }, playthroughDurationMs);

    return () => {
      sub?.remove();
      clearTimeout(timer);
    };
  }, [player, playthroughDurationMs, visible]);

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
            {
              backgroundColor: palette.modalBg,
              borderColor: palette.modalOptionBorder,
            },
          ]}
        >
          <View
            style={[
              styles.videoFrame,
              {
                height: videoHeight,
                width: videoWidth,
              },
            ]}
          >
            {showSpeaker && <View style={styles.phoneSpeaker} />}
            <View style={styles.videoViewport}>
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  videoFrame: {
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  videoViewport: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
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
  video: {
    flex: 1,
  },
});
