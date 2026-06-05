import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import OnboardingHeroTriplet from './OnboardingHeroTriplet';

const CENTER_IMAGE = require('../../../../assets/onboarding_q2_assets/q2-book-cutout.png');
const LEFT_IMAGE = require('../../../../assets/onboarding_q2_assets/q2-headphones-cutout.png');
const RIGHT_IMAGE = require('../../../../assets/onboarding_q2_assets/q2-tv-cutout.png');

type Q2HeroIllustrationProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export default function Q2HeroIllustration(props: Q2HeroIllustrationProps) {
  return <OnboardingHeroTriplet centerImage={CENTER_IMAGE} leftImage={LEFT_IMAGE} rightImage={RIGHT_IMAGE} {...props} />;
}
