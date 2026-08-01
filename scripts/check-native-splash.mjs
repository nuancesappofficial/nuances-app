import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const storyboardPath = new URL('../ios/Nuances/SplashScreen.storyboard', import.meta.url);
const nativeImagePath = new URL(
  '../ios/Nuances/Images.xcassets/SplashScreenLegacy.imageset/image.png',
  import.meta.url
);
const animatedSplashPath = new URL(
  '../src/components/UI/shared/AnimatedSplashV2.tsx',
  import.meta.url
);

const [storyboard, nativeImage, animatedSplash] = await Promise.all([
  readFile(storyboardPath, 'utf8'),
  readFile(nativeImagePath),
  readFile(animatedSplashPath, 'utf8'),
]);

const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');
const expoPlaceholderDigest =
  '19538d1608409f6e10c5eac93107c99346d9290f6fd54e9a5c15369710190ef1';

assert.notEqual(
  digest(nativeImage),
  expoPlaceholderDigest,
  'Native launch image must not be the Expo placeholder'
);
assert.match(
  animatedSplash,
  /assets\/app_icons\/icon_cutout2\.png/,
  'Animated splash must use the Nuances logo'
);
assert.match(
  storyboard,
  /firstAttribute="centerX" secondItem="EXPO-ContainerView" secondAttribute="centerX"/,
  'Native launch logo must be horizontally centered'
);
assert.match(
  storyboard,
  /firstAttribute="centerY" secondItem="EXPO-ContainerView" secondAttribute="centerY"/,
  'Native launch logo must be vertically centered'
);
assert.match(
  storyboard,
  /firstAttribute="width" constant="142"/,
  'Native launch logo width must match AnimatedSplashV2'
);
assert.match(
  storyboard,
  /firstAttribute="height" constant="142"/,
  'Native launch logo height must match AnimatedSplashV2'
);
assert.match(
  storyboard,
  /blue="0\.964706" green="0\.737255" red="0\.427451"/,
  'Native launch background must match the first visible animation panel (#6DBCF6)'
);

console.log('Native launch screen matches AnimatedSplashV2 first frame.');
