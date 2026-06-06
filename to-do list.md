UI list :
{
    1. ✓ pronunciation coach
    2. ✓ review tuning
    3. ✓ ghost card
    4. ✓ album settting
    5. ✓ membership modal
    6. login animation
    7. onboarding
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
    9. discount code
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
