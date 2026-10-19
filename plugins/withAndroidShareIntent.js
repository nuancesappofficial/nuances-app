const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAndroidShareIntent(config) {
  return withAndroidManifest(config, (configWithManifest) => {
    const application = configWithManifest.modResults.manifest.application?.[0];
    if (!application) throw new Error('Unable to find application tag in AndroidManifest.xml');
    application.activity = application.activity || [];

    // 1. Remove SEND and SEND_MULTIPLE intent filters from .MainActivity
    const mainActivity = application.activity.find((item) => item.$?.['android:name'] === '.MainActivity');
    if (mainActivity && Array.isArray(mainActivity['intent-filter'])) {
      mainActivity['intent-filter'] = mainActivity['intent-filter'].filter((filter) => {
        const hasSendAction = filter.action?.some((entry) => {
          const name = entry.$?.['android:name'];
          return name === 'android.intent.action.SEND' || name === 'android.intent.action.SEND_MULTIPLE';
        });
        return !hasSendAction;
      });
    }

    // 2. Ensure ShareReceiverActivity exists with translucent theme and noHistory
    let shareActivity = application.activity.find(
      (item) => item.$?.['android:name'] === 'expo.modules.androidshareintent.ShareReceiverActivity'
    );
    if (!shareActivity) {
      shareActivity = {
        $: {
          'android:name': 'expo.modules.androidshareintent.ShareReceiverActivity',
          'android:theme': '@android:style/Theme.Translucent.NoTitleBar',
          'android:noHistory': 'true',
          'android:excludeFromRecents': 'true',
          'android:taskAffinity': '',
          'android:exported': 'true',
        },
        'intent-filter': [],
      };
      application.activity.push(shareActivity);
    } else {
      shareActivity.$ = shareActivity.$ || {};
      shareActivity.$['android:theme'] = '@android:style/Theme.Translucent.NoTitleBar';
      shareActivity.$['android:noHistory'] = 'true';
      shareActivity.$['android:excludeFromRecents'] = 'true';
      shareActivity.$['android:taskAffinity'] = '';
      shareActivity.$['android:exported'] = 'true';
      shareActivity['intent-filter'] = shareActivity['intent-filter'] || [];
    }

    const filters = [
      ['android.intent.action.SEND', 'text/plain'],
      ['android.intent.action.SEND', 'image/*'],
      ['android.intent.action.SEND_MULTIPLE', 'image/*'],
    ];

    for (const [action, mimeType] of filters) {
      const exists = shareActivity['intent-filter'].some((filter) =>
        filter.action?.some((entry) => entry.$?.['android:name'] === action) &&
        filter.data?.some((entry) => entry.$?.['android:mimeType'] === mimeType)
      );
      if (!exists) {
        shareActivity['intent-filter'].push({
          action: [{ $: { 'android:name': action } }],
          category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
          data: [{ $: { 'android:mimeType': mimeType } }],
        });
      }
    }

    return configWithManifest;
  });
};
