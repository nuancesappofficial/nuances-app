UI list :
{
    ✓ pronunciation coach
    ✓ review tuning
    ✓ ghost card
    ✓ album settting
    ✓ membership modal
    login animation
    onboarding
}

functions:
{
    ✓ folder sequence
    thorough level of cards
    language setting
    revenue cat
    gemini prompt
    gemini paywall
    azure paywall
    supabase to new account
    discount code
}

App Store submission checklist:
{
    [ ] Replace placeholder Privacy Policy and Terms of Service links in `src/components/UI/ProfileScreenUI/PaywallFooter.tsx`
    [ ] Add valid Privacy Policy URL to App Store Connect metadata
    [ ] Add in-app account deletion flow because the app supports account creation and login
    [ ] Add backend account deletion support for Supabase user data, profile data, cards, cached items, media, and related records
    [ ] Make subscription/paywall UI match the actual RevenueCat products available for purchase
    [ ] Ensure weekly/monthly/yearly plans are either real App Store subscription products or removed from the UI
    [ ] Submit first in-app purchase/subscription products together with the first app version in App Store Connect
    [ ] Confirm Restore Purchases works on a production/TestFlight build
    [x] Disable production subscription dev bypass: `EXPO_PUBLIC_SUBSCRIPTION_DEV_BYPASS=false`
    [x] Remove any production default premium override: `EXPO_PUBLIC_SUBSCRIPTION_DEV_DEFAULT_PLAN`
    [x] Update iOS permission descriptions for camera, photos, and microphone with specific app use cases
    [ ] Confirm App Group `group.com.jeffenglishlearning.nuances.v2` is enabled for both the main app and share extension App IDs
    [ ] Confirm share extension bundle ID `com.jeffenglishlearning.nuances.NuancesShareExtension` has a valid provisioning profile
    [x] Remove or verify the duplicated `ios/NuancesShareExtension NuancesShareExtension ...` directory is not part of the build
    [ ] Provide App Review notes with demo account credentials and explain subscription, AI, TTS, pronunciation scoring, and share extension flows
    [ ] Verify backend services and Supabase Edge Functions are live during review
}
