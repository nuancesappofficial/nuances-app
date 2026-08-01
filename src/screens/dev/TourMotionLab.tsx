import React from 'react';
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TutorialSpotlight from '../../components/UI/shared/TutorialSpotlight';

export default function TourMotionLab({ onClose }: { onClose: () => void }) {
  const [activeTarget, setActiveTarget] = React.useState(1);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>DEVELOPMENT</Text>
          <Text style={styles.title}>Tour Motion Lab</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close motion lab"
          onPress={onClose}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={22} color="#DCEEFF" />
        </Pressable>
      </View>

      <Text style={styles.body}>
        Tap each highlighted target to inspect cutout movement and same-screen
        transitions.
      </Text>

      <View style={styles.stage}>
        <TutorialSpotlight
          active={activeTarget === 1}
          tooltip="Start with a compact action near the top."
          onSpotlightPress={() => setActiveTarget(2)}
        >
          <Pressable style={[styles.target, styles.targetSmall]}>
            <Ionicons name="sparkles-outline" size={20} color="#02213D" />
            <Text style={styles.targetText}>Begin</Text>
          </Pressable>
        </TutorialSpotlight>

        <TutorialSpotlight
          active={activeTarget === 2}
          tooltip="The cutout should glide here without flashing or remounting."
          onSpotlightPress={() => setActiveTarget(3)}
        >
          <Pressable style={[styles.target, styles.targetWide]}>
            <Ionicons name="albums-outline" size={23} color="#02213D" />
            <Text style={styles.targetText}>A wider destination</Text>
          </Pressable>
        </TutorialSpotlight>

        <TutorialSpotlight
          active={activeTarget === 3}
          tooltip="Finish the target transition."
          onSpotlightPress={onClose}
        >
          <Pressable style={[styles.target, styles.targetRound]}>
            <Ionicons name="checkmark" size={28} color="#02213D" />
          </Pressable>
        </TutorialSpotlight>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 22,
    backgroundColor: '#02213D',
  },
  header: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: '#7CC8FA',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 3,
    color: '#F8FAFC',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  closeButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(137,206,255,0.2)',
  },
  body: {
    marginTop: 12,
    maxWidth: 330,
    color: 'rgba(226,240,250,0.72)',
    fontSize: 15,
    lineHeight: 22,
  },
  stage: {
    flex: 1,
    paddingTop: 46,
    paddingBottom: 34,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  target: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#D8F0FF',
    borderWidth: 1,
    borderColor: '#89CEFF',
    shadowColor: '#4EAFF4',
    shadowOpacity: 0.34,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  targetSmall: {
    alignSelf: 'flex-start',
    borderRadius: 18,
    paddingHorizontal: 18,
  },
  targetWide: {
    width: 290,
    borderRadius: 22,
  },
  targetRound: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  targetText: {
    color: '#02213D',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
  },
});
