import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  VideoView,
  createVideoPlayer,
  type VideoPlayer,
} from 'expo-video';
import { getFirstTourVideoSource } from '../../../screens/flow/VideoTourFlow';

/**
 * Mounted while onboarding is on screen. It builds the first tour video's
 * player and attaches it to a hidden `VideoView` so the native AVPlayer is
 * forced to decode the first frame (`isReadyForDisplay`) during onboarding,
 * hiding the first-video decode lag behind the onboarding screens.
 *
 * Ownership of the player transfers to the caller via `onPlayerReady`. The
 * caller is responsible for `release()`ing it once the video tour completes or
 * when onboarding routes somewhere other than the video tour. This component
 * deliberately does NOT release on unmount, because the player must survive
 * the onboarding → video-tour transition.
 */
export function FirstTourVideoPreloader({
  enabled,
  onPlayerReady,
}: {
  enabled: boolean;
  onPlayerReady: (player: VideoPlayer) => void;
}) {
  const playerRef = React.useRef<VideoPlayer | null>(null);
  const [player, setPlayer] = React.useState<VideoPlayer | null>(null);

  React.useEffect(() => {
    if (!enabled || playerRef.current) return;
    const nextPlayer = createVideoPlayer(getFirstTourVideoSource());
    nextPlayer.audioMixingMode = 'mixWithOthers';
    nextPlayer.loop = true;
    nextPlayer.muted = true;
    playerRef.current = nextPlayer;
    setPlayer(nextPlayer);
    onPlayerReady(nextPlayer);
    // Intentionally no cleanup release: ownership transfers to the caller.
  }, [enabled, onPlayerReady]);

  if (!player) return null;
  return (
    <View style={styles.hiddenPreload} pointerEvents="none">
      <VideoView player={player} style={styles.hiddenPreload} />
    </View>
  );
}

const styles = StyleSheet.create({
  hiddenPreload: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
});
