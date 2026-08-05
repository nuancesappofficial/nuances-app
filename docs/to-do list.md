UI list :
{
    1. ✓ pronunciation coach
    2. ✓ review tuning
    3. ✓ ghost card
    4. ✓ album settting
    5. ✓ membership modal
    6. ✓ login animation
    7. ✓ onboarding
    8. ✓ Japanese UI localization
    9. [ ] Korean UI localization
    10. [ ] Spanish UI localization
}

functions:
{
    1. ✓ folder sequence
    2. ✓ thorough level of cards
    3. ✓ language setting
    4. ✓ revenue cat
    5. ✓ gemini prompt
    6. ✓ gemini paywall
    7. ✓ azure paywall
    8. ✓ supabase to new account
}

App Store submission checklist:
{
    1. [ ] Account Holder must review and accept the updated Apple Developer Program License Agreement before App Store Connect can submit app updates or new apps
    2. ✓ Replace placeholder Privacy Policy and Terms of Service links in `src/components/UI/ProfileScreenUI/PaywallFooter.tsx`
    3. [ ] Add valid Privacy Policy URL to App Store Connect metadata
    4. ✓ Add in-app account deletion flow because the app supports account creation and login
    5. ✓ Add backend account deletion support for Supabase user data, profile data, cards, cached items, media, and related records
    6. ✓ Make subscription/paywall UI match the actual RevenueCat products available for purchase
    7. ✓ Ensure weekly/monthly/yearly plans are either real App Store subscription products or removed from the UI
    8. ✓ Add visible free trial reminder on the membership paywall
    9. ✓ Add visible auto-renewal disclosure on the membership paywall
    10. ✓ Add simple manage/cancel subscription entry from the membership paywall for active Trial/Premium users
    11. ✓ Add simple manage/cancel subscription entry from Profile Settings for active Trial/Premium users
    12. ✓ Add native local trial-ending reminder for active Apple/RevenueCat IAP trials when notification permission is already granted
    13. ✓ Disable Supabase internal trial enrollment so trial access comes only from Apple/RevenueCat IAP entitlement
    14. [ ] Submit first in-app purchase/subscription products together with the first app version in App Store Connect
    15. [ ] Confirm Restore Purchases works on a production/TestFlight build
    16. ✓ Disable production subscription dev bypass: `EXPO_PUBLIC_SUBSCRIPTION_DEV_BYPASS=false`
    17. ✓ Remove any production default premium override: `EXPO_PUBLIC_SUBSCRIPTION_DEV_DEFAULT_PLAN`
    18. ✓ Update iOS permission descriptions for camera, photos, and microphone with specific app use cases
    19. ✓ Confirm App Group `group.com.jeffenglishlearning.nuances.v2` is enabled for both the main app and share extension App IDs
    20. ✓ Confirm share extension bundle ID `com.jeffenglishlearning.nuances.NuancesShareExtension` has a valid provisioning profile
    21. ✓ Remove or verify the duplicated `ios/NuancesShareExtension NuancesShareExtension ...` directory is not part of the build
    22. ✓ Provide App Review notes telling reviewers to use Sign in with Apple and explaining subscription, AI, TTS, pronunciation scoring, share extension, and account deletion flows
    23. ✓ Verify backend services and Supabase Edge Functions are live during review
    24. ✓ Add required App Store screenshots for iPhone 6.5-inch display size
    25. ✓ Fill English (U.S.) App Store version metadata: promotional text, description, keywords, and copyright
    26. [ ] Upload and select build `1.0.0 (70)` for iOS version 1.0
    27. [ ] Fill App Review contact fields: first name, last name, phone number, and email
    28. [ ] Select Manual Release in App Store Connect before submission
    29. ✓ Add valid Support URL to App Store Connect metadata and verify it opens publicly in incognito/private browsing: `https://app.notion.com/p/Nuances-support-39a7da995fa580b58912fd2ae3cf3310`
    30. ✓ Set iOS v1 to iPhone-only so App Store Connect does not require 13-inch iPad screenshots before the first submission
}

Greenlight App Store static scan:
{
    1. ✓ Run RevylAI Greenlight preflight scan with `/tmp/greenlight preflight .`
    2. ✓ Confirm Greenlight result is `GREENLIT` with zero critical issues
    3. ✓ Fix low-risk Greenlight metadata/config findings: add Expo app description, add Share Extension encryption declaration, and configure false-positive scan rules
    4. ✓ Run project security preflight: `npm run check:security`
    5. ✓ Confirm project security preflight result: 17 pass, 0 warn, 0 fail
    6. ✓ Run App Store readiness preflight: `npm run check:app-store`
    7. ✓ Confirm App Store readiness preflight result: 9 pass, 1 warn, 0 fail
    8. [ ] Add Privacy Policy URL in App Store Connect metadata; Greenlight still warns because the URL is not discoverable from project config
    9. [ ] Replace/update final App Store update URL once the public App Store listing URL is available; `check:app-store` still warns on this
    10. [ ] Treat remaining approval blockers as App Store Connect workflow items, not code blockers: Apple agreement, App Review contact, selected build, IAP/subscription submission, and Restore Purchases verification
    11. [ ] Optional: run Greenlight runtime verification for Sign in with Apple, Restore Purchases, and account deletion if a Revyl build/account is available
}

Security audit checklist:
{
    1. ✓ Run a secrets scan for committed `.env`, API keys, Supabase service-role keys, AI provider keys, Apple credentials, Google credentials, and RevenueCat secrets
    2. ✓ Verify `EXPO_PUBLIC_*` usage only contains public client-safe values; keep AI, TTS, Supabase service-role, RevenueCat webhook/API, and Apple shared secrets out of the app bundle
    3. ✓ Audit Supabase RLS policies for `profiles`, `cached_items`, `cards`, `review_history`, `sync_metadata`, `subscriptions`, and `app_version_policy`
    4. ✓ Test cross-user access control: user A must not read, update, delete, sync, or restore user B data through Supabase tables, storage, or Edge Functions
    5. ✓ Audit Supabase Storage policies for `cached-images` and `audio_cache`, including public-read assumptions and user-owned upload/update/delete paths
    6. ✓ Verify Edge Function auth boundaries for `ai-proxy`, `tts-proxy`, `sync-entitlement`, `delete-account`, and `revenuecat-webhook`
    7. ✓ Confirm `delete-account` only deletes the authenticated user's own data and cannot be called with another user's ID
    8. ✓ Confirm `sync-entitlement` and RevenueCat webhook cannot be spoofed to grant Premium without valid RevenueCat/server-side verification
    9. ✓ Add low-impact security smoke tests for missing JWT, invalid JWT, cross-user IDs, and unauthenticated Edge Function calls
    10. ✓ Review AI/OCR/share-extension input validation: cap source text length, reject malformed payloads, and avoid sending unnecessary personal data to AI providers
    11. ✓ Review AI output handling so generated text is treated as untrusted content and never used to bypass authorization, subscription, or data ownership rules
    12. ✓ Run dependency risk checks with `npm audit` and review native/mobile dependency advisories before App Store submission
    13. ✓ Add or document a repeatable security preflight command that runs type-check, lint, App Store readiness, dependency audit, and key access-control checks
    14. ✓ Review local device storage risk: AsyncStorage/UserSettings should not store secrets, provider keys, service-role keys, or sensitive long-lived credentials
    15. ✓ Review logging for sensitive data leaks in production: auth tokens, prompts, OCR text, user content, RevenueCat customer info, and provider responses should not be logged
    16. ✓ Confirm production subscription dev bypasses stay disabled in EAS/App Store builds and cannot be enabled from client-controlled state
}

Required security patches completed:
{
    1. ✓ Clean README environment guidance so Azure Speech, Gemini, OpenAI, RevenueCat secret, webhook token, and Supabase service-role values are documented as server-side Supabase Edge Function secrets, not client `EXPO_PUBLIC_*` values
    2. ✓ Gate raw AI/OCR diagnostic logs behind `__DEV__` so production builds do not log prompts, OCR text, raw model output, or user content previews
    3. ✓ Disable legacy arbitrary `provider/messages` AI proxy mode server-side and return `410 legacy_mode_disabled`
    4. ✓ Disable legacy arbitrary OpenAI proxy usage client-side so app code must use action-based AI endpoints
    5. ✓ Change TTS cache filenames to random IDs plus voice name so generated storage paths do not leak user text
    6. ✓ Replace external Edge Function error details with generic reason codes while keeping full details in server logs
    7. ✓ Store Supabase auth session in `expo-secure-store` with migration fallback from legacy AsyncStorage
    8. ✓ Run `pod install` after adding `expo-secure-store` so iOS native dependencies are synchronized
    9. ✓ Harden `sync-app-version-policy` CORS so it no longer returns `Access-Control-Allow-Origin: *`; browser origin access is only allowed when `APP_VERSION_POLICY_ALLOWED_ORIGIN` matches
    10. ✓ Prevent async AI task provider/internal error messages from being returned through `getTaskResult`; failed tasks now expose a generic `ai_task_failed` code
    11. ✓ Add structured diagnostics logging with timestamp, level, user ID, request ID, session ID, category, event, sanitized context, and app/build/runtime metadata
    12. ✓ Add Supabase `app_diagnostic_logs` table with RLS so authenticated users can only insert/select their own logs
    13. ✓ Confirm `app_diagnostic_logs` migration `20260710000000` is applied on the remote Supabase project
    14. ✓ Add indexes for querying logs by user/time, level/time, request ID, and event/time
    15. ✓ Add structured logging requirements and SQL query examples to `security-check.md`
    16. ✓ Add iOS archive build phase to generate React Native prebuilt framework dSYMs for `React.framework`, `ReactNativeDependencies.framework`, and `hermes.framework`
    17. ✓ Verify a test archive includes React Native prebuilt dSYMs with UUIDs matching Apple's upload-symbol warnings
    18. ✓ Re-run `npm audit --omit=dev`; remaining 15 moderate issues require `npm audit fix --force` and a breaking Expo 57 upgrade, so do not force-fix in this launch branch
    19. ✓ Re-run `npm run type-check` after security patches
    20. ✓ Re-run `npm run check:security` and confirm result: 17 pass, 0 warn, 0 fail
    21. ✓ Re-run `npm run check:app-store` and confirm result: 9 pass, 1 warn, 0 fail
    22. ✓ Add visible fair-use disclosure to the membership paywall and footer so AI, voice, and pronunciation access is not presented as unlimited
    23. ✓ Align pronunciation quota logic so active trial users receive the same daily allowance as Premium users
    24. ✓ Deploy updated `ai-proxy` Edge Function after trial/Premium pronunciation quota alignment
    25. [ ] Replace final App Store update URL once the public App Store listing URL is available; this is the remaining `check:app-store` warning
}
