import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import OnboardingHeroTriplet from './OnboardingHeroTriplet';

const PHONE_IMAGE = require('../../../../assets/onboarding_q1_assets/screenshot-icon-cutout.png');
const NOTE_IMAGE = require('../../../../assets/onboarding_q1_assets/sticky-note-cutout.png');
const SEARCH_IMAGE = require('../../../../assets/onboarding_q1_assets/search-icon-cutout.png');

type Q1HeroIllustrationProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export default function Q1HeroIllustration(props: Q1HeroIllustrationProps) {
  return <OnboardingHeroTriplet centerImage={PHONE_IMAGE} leftImage={NOTE_IMAGE} rightImage={SEARCH_IMAGE} {...props} />;
}
