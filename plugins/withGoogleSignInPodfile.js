const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const TARGET_LINE = "target 'Nuances' do\n";
const GOOGLE_PODS = [
  '  # GoogleSignIn 9.x Swift dependencies need module maps with static-library linkage.',
  "  pod 'GoogleUtilities', :modular_headers => true",
  "  pod 'RecaptchaInterop', :modular_headers => true",
  '',
].join('\n');

function withGoogleSignInPodfile(config) {
  return withDangerousMod(config, [
    'ios',
    (modConfig) => {
      const podfilePath = path.join(modConfig.modRequest.platformProjectRoot, 'Podfile');
      const podfile = fs.readFileSync(podfilePath, 'utf8');

      if (podfile.includes("pod 'GoogleUtilities', :modular_headers => true")) {
        return modConfig;
      }
      if (!podfile.includes(TARGET_LINE)) {
        throw new Error('Unable to locate the Nuances target in ios/Podfile.');
      }

      fs.writeFileSync(
        podfilePath,
        podfile.replace(TARGET_LINE, `${TARGET_LINE}${GOOGLE_PODS}`)
      );
      return modConfig;
    },
  ]);
}

module.exports = withGoogleSignInPodfile;
