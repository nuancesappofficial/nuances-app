const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAndroidShareIntent(config) {
  return withAndroidManifest(config, (configWithManifest) => {
    const application = configWithManifest.modResults.manifest.application?.[0];
    const activity = application?.activity?.find((item) => item.$?.['android:name'] === '.MainActivity');
    if (!activity) throw new Error('Unable to find .MainActivity for Android share intent filters');

    activity['intent-filter'] = activity['intent-filter'] || [];
    const filters = [
      ['android.intent.action.SEND', 'text/plain'],
      ['android.intent.action.SEND', 'image/*'],
      ['android.intent.action.SEND_MULTIPLE', 'image/*'],
    ];
    for (const [action, mimeType] of filters) {
      const exists = activity['intent-filter'].some((filter) =>
        filter.action?.some((entry) => entry.$?.['android:name'] === action) &&
        filter.data?.some((entry) => entry.$?.['android:mimeType'] === mimeType)
      );
      if (!exists) {
        activity['intent-filter'].push({
          action: [{ $: { 'android:name': action } }],
          category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
          data: [{ $: { 'android:mimeType': mimeType } }],
        });
      }
    }
    return configWithManifest;
  });
};
