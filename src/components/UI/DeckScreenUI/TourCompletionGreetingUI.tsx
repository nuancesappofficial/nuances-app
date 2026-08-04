import React from 'react';
import {
  Modal,
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
} from '../../../features/tour/tutorialPresentation';
import { resolveThemeColors } from '../../../theme/colors';

const SHARE_SHEET_VIDEO = require('../../../../assets/tutorial/raw/Chinese/01_share_or_capture.mov');

type Props = {
  visible: boolean;
  title: string;
  body: string;
  shareLabel: string;
  uploadLabel: string;
  onShare: () => void;
  onUpload: () => void;
};

export default function TourCompletionGreetingUI({
  visible,
  title,
  body,
  shareLabel,
  uploadLabel,
  onShare,
  onUpload,
}: Props) {
  const palette = resolveThemeColors(useColorScheme());
  const { height: windowHeight } = useWindowDimensions();
  const videoHeight = getGreetingVideoHeight(windowHeight);
  const videoWidth = getGreetingVideoWidth(videoHeight);
  const videoContentFit = getGreetingVideoContentFit();
  const playback = getGreetingVideoPlayback(visible);
  const player = useVideoPlayer(SHARE_SHEET_VIDEO, (nextPlayer) => {
    nextPlayer.audioMixingMode = 'mixWithOthers';
    nextPlayer.loop = playback.loop;
    nextPlayer.muted = playback.muted;
  });

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
      onRequestClose={onShare}
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
          <Text style={[styles.title, { color: palette.textOnContainer }]}>
            {title}
          </Text>
          <Text style={[styles.body, { color: palette.secondaryText }]}>
            {body}
          </Text>
          <Pressable style={styles.primaryButton} onPress={onUpload}>
            <Text style={styles.primaryButtonText}>{uploadLabel}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onShare}>
            <Text
              style={[
                styles.secondaryButtonText,
                { color: palette.textOnContainer },
              ]}
            >
              {shareLabel}
            </Text>
          </Pressable>
          <View
            style={[
              styles.videoFrame,
              {
                height: videoHeight,
                width: videoWidth,
              },
            ]}
          >
            <View style={styles.phoneSpeaker} />
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
    paddingTop: 30,
    paddingBottom: 20,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    textAlign: 'center',
  },
  body: {
    marginTop: 12,
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: 56,
    marginTop: 28,
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
  secondaryButton: {
    minHeight: 52,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  videoFrame: {
    alignSelf: 'center',
    marginTop: 4,
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
