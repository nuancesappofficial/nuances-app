const explicitVideoTourFlag = String(process.env.EXPO_PUBLIC_VIDEO_TOUR_ENABLED || '')
  .trim()
  .toLowerCase();

// Default the new video tutorial on, but keep a build-time kill switch:
// EXPO_PUBLIC_VIDEO_TOUR_ENABLED=false.
export const VIDEO_TOUR_ENABLED = explicitVideoTourFlag !== 'false';

const explicitInternalTesterToolsFlag = String(process.env.EXPO_PUBLIC_INTERNAL_TESTER_TOOLS || '')
  .trim()
  .toLowerCase();

// Never expose tester-only reset tools in release binaries. Local .env files are
// easy to forget before an Xcode archive, so __DEV__ is the hard gate.
export const INTERNAL_TESTER_TOOLS_ENABLED =
  __DEV__ && explicitInternalTesterToolsFlag !== 'false';
