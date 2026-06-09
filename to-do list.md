UI list :
{
    1. ✓ pronunciation coach
    2. ✓ review tuning
    3. ✓ ghost card
    4. ✓ album settting
    5. ✓ membership modal
    6. login animation
    7. onboarding
    8. [ ] Japanese UI localization
    9. [ ] Korean UI localization
    10. [ ] Spanish UI localization
}

functions:
{
    1. ✓ folder sequence
    2. thorough level of cards
    3. language setting
    4. revenue cat
    5. gemini prompt
    6. gemini paywall
    7. azure paywall
    8. ✓ supabase to new account
}

App Store submission checklist:
{
    1. ✓ Replace placeholder Privacy Policy and Terms of Service links in `src/components/UI/ProfileScreenUI/PaywallFooter.tsx`
    2. [ ] Add valid Privacy Policy URL to App Store Connect metadata
    3. ✓ Add in-app account deletion flow because the app supports account creation and login
    4. ✓ Add backend account deletion support for Supabase user data, profile data, cards, cached items, media, and related records
    5. [ ] Make subscription/paywall UI match the actual RevenueCat products available for purchase
    6. ✓ Ensure weekly/monthly/yearly plans are either real App Store subscription products or removed from the UI
    7. [ ] Submit first in-app purchase/subscription products together with the first app version in App Store Connect
    8. [ ] Confirm Restore Purchases works on a production/TestFlight build
    9. ✓ Disable production subscription dev bypass: `EXPO_PUBLIC_SUBSCRIPTION_DEV_BYPASS=false`
    10. ✓ Remove any production default premium override: `EXPO_PUBLIC_SUBSCRIPTION_DEV_DEFAULT_PLAN`
    11. ✓ Update iOS permission descriptions for camera, photos, and microphone with specific app use cases
    12. ✓ Confirm App Group `group.com.jeffenglishlearning.nuances.v2` is enabled for both the main app and share extension App IDs
    13. ✓ Confirm share extension bundle ID `com.jeffenglishlearning.nuances.NuancesShareExtension` has a valid provisioning profile
    14. ✓ Remove or verify the duplicated `ios/NuancesShareExtension NuancesShareExtension ...` directory is not part of the build
    15. [ ] Provide App Review notes with demo account credentials and explain subscription, AI, TTS, pronunciation scoring, and share extension flows
    16. ✓ Verify backend services and Supabase Edge Functions are live during review
}

Security audit checklist:
{
    1. ✓ Run a secrets scan for committed `.env`, API keys, Supabase service-role keys, AI provider keys, Apple credentials, Google credentials, and RevenueCat secrets
    2. ✓ Verify `EXPO_PUBLIC_*` usage only contains public client-safe values; keep AI, TTS, Supabase service-role, RevenueCat webhook/API, and Apple shared secrets out of the app bundle
    3. ✓ Audit Supabase RLS policies for `profiles`, `cached_items`, `cards`, `review_history`, `sync_metadata`, `subscriptions`, and `app_version_policy`
    4. [ ] Test cross-user access control: user A must not read, update, delete, sync, or restore user B data through Supabase tables, storage, or Edge Functions
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
