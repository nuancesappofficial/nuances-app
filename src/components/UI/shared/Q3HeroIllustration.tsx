import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import OnboardingHeroTriplet from './OnboardingHeroTriplet';

const CENTER_IMAGE = require('../../../../assets/onboarding_q3_assets/q3-nodes-cutout.png');
const LEFT_IMAGE = require('../../../../assets/onboarding_q3_assets/q3-bubble-cutout.png');
const RIGHT_IMAGE = require('../../../../assets/onboarding_q3_assets/q3-lightning-cutout.png');

type Q3HeroIllustrationProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export default function Q3HeroIllustration(props: Q3HeroIllustrationProps) {
  return <OnboardingHeroTriplet centerImage={CENTER_IMAGE} leftImage={LEFT_IMAGE} rightImage={RIGHT_IMAGE} {...props} />;
}
