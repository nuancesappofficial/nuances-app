const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PROGUARD_RULES = `
# ----------------------------------------------------
# 1. React Native Core, JNI, TurboModules, Fabric
# ----------------------------------------------------
-keep class com.facebook.react.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.yoga.** { *; }
-keep class com.facebook.soloader.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keepclassmembers class * extends com.facebook.react.bridge.JavaScriptModule { *; }
-keepclassmembers class * extends com.facebook.react.bridge.NativeModule { *; }
-keepclassmembers class * extends com.facebook.react.uimanager.ViewManager { *; }
-keepclassmembers class * extends com.facebook.react.uimanager.ReactShadowNode { *; }
-keepclassmembers class * extends com.facebook.react.turbomodule.core.interfaces.TurboModule { *; }
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
    @com.facebook.react.bridge.ReactProp *;
    @com.facebook.react.bridge.ReactPropGroup *;
}
-dontwarn com.facebook.react.**

# ----------------------------------------------------
# 2. React Native Reanimated & Gesture Handler
# ----------------------------------------------------
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.reanimated.layoutReanimation.** { *; }
-keepclassmembers class com.swmansion.reanimated.** { *; }

-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.gesturehandler.react.** { *; }
-keepclassmembers class com.swmansion.gesturehandler.** { *; }

# ----------------------------------------------------
# 3. React Native Screens & Navigation
# ----------------------------------------------------
-keep class com.swmansion.rnscreens.** { *; }
-keep class com.swmansion.rnscreens.Screen { *; }
-keep class com.swmansion.rnscreens.ScreenContainer { *; }
-keep class com.swmansion.rnscreens.ScreenStack { *; }
-keepclassmembers class com.swmansion.rnscreens.** { *; }

# ----------------------------------------------------
# 4. Google Sign-In & Google Play Services
# ----------------------------------------------------
-keep class com.reactnativegooglesignin.** { *; }
-keepclassmembers class com.reactnativegooglesignin.** { *; }
-keep class com.google.android.gms.auth.api.signin.** { *; }
-keep class com.google.android.gms.common.api.** { *; }
-keep class com.google.android.gms.tasks.** { *; }
-keep class com.google.android.gms.common.** { *; }
-dontwarn com.google.android.gms.**
-dontwarn com.reactnativegooglesignin.**

# ----------------------------------------------------
# 5. WatermelonDB (JNI & SQLite)
# ----------------------------------------------------
-keep class com.nozbe.watermelondb.** { *; }
-keepclassmembers class com.nozbe.watermelondb.** { *; }

# ----------------------------------------------------
# 6. RevenueCat (Purchases)
# ----------------------------------------------------
-keep class com.revenuecat.purchases.** { *; }
-keepclassmembers class com.revenuecat.purchases.** { *; }
-dontwarn com.revenuecat.purchases.**

# ----------------------------------------------------
# 7. PostHog Analytics
# ----------------------------------------------------
-keep class com.posthog.** { *; }
-keepclassmembers class com.posthog.** { *; }
-dontwarn com.posthog.**

# ----------------------------------------------------
# 8. Expo Modules & Kotlin reflection
# ----------------------------------------------------
-keep class expo.modules.** { *; }
-keep class expo.modules.kotlin.** { *; }
-keepclassmembers class * extends expo.modules.kotlin.modules.Module { *; }
-keepclassmembers class * extends expo.modules.kotlin.views.ViewManager { *; }
-dontwarn expo.modules.**

# ----------------------------------------------------
# 9. ML Kit Text Recognition & Camera
# ----------------------------------------------------
-keep class com.google.mlkit.vision.** { *; }
-keep class com.google.android.gms.vision.** { *; }
-dontwarn com.google.mlkit.vision.**

# ----------------------------------------------------
# 10. Community Modules (AsyncStorage, NetInfo, WebView, Svg, PagerView)
# ----------------------------------------------------
-keep class com.reactnativecommunity.asyncstorage.** { *; }
-keep class com.reactnativecommunity.netinfo.** { *; }
-keep class com.reactnativepagerview.** { *; }
-keep class com.horcrux.svg.** { *; }
-keep class com.reactnativecommunity.webview.** { *; }
`;

function withAndroidProguardRules(config) {
  return withDangerousMod(config, [
    'android',
    (modConfig) => {
      const proguardPath = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'proguard-rules.pro'
      );
      if (!fs.existsSync(proguardPath)) {
        return modConfig;
      }
      const existing = fs.readFileSync(proguardPath, 'utf8');
      if (existing.includes('-keep class com.swmansion.rnscreens.**')) {
        return modConfig;
      }
      fs.writeFileSync(proguardPath, `${existing}\n${PROGUARD_RULES}\n`);
      return modConfig;
    },
  ]);
}

module.exports = withAndroidProguardRules;
