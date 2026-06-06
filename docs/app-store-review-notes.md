# App Store Review Notes Draft

## Demo Account

- TODO: Add reviewer email.
- TODO: Add reviewer password.
- TODO: Confirm the demo account has completed onboarding or explain onboarding steps.

## Login

- The app supports Apple and Google OAuth login through Supabase Auth.
- Reviewers can use the demo account above if gated features require authentication.

## Subscription and Restore Purchases

- Premium unlocks AI card generation, premium cloud TTS, pronunciation scoring, and expanded cache/card creation limits.
- Purchases are handled through Apple in-app purchase via RevenueCat.
- Restore Purchases is available from the membership paywall.
- TODO: Confirm the submitted build includes the same RevenueCat offering and App Store subscription products shown in the app.

## AI Card Generation

- Users can create flashcards from typed text, captured images, or imported/shared content.
- AI features call Supabase Edge Functions so private provider keys are not bundled in the app.

## Text-to-Speech and Pronunciation Scoring

- Cloud TTS is routed through the Supabase `tts-proxy` function.
- Pronunciation scoring requires microphone access and is used only after the user starts a pronunciation practice flow.

## Share Extension

- The iOS share extension lets users send text or images into Nuances and save them as cached learning material.
- The main app and extension share data through the App Group `group.com.jeffenglishlearning.nuances.v2`.

## Account Deletion

- Backend account deletion support is implemented through the Supabase `delete-account` Edge Function.
- TODO: Add the in-app settings entry after UI approval so reviewers can trigger account deletion directly from the app.

## Reviewer Notes To Paste

TODO: Replace this section with final App Store Connect text after demo credentials and live product IDs are confirmed.
