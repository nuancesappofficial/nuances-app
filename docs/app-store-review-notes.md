# App Store Review Notes Draft

## Demo Account

- Reviewers should use Sign in with Apple in the app.
- No separate demo username or password is provided.
- If onboarding appears after Apple auth, complete the short onboarding flow and continue to the main app.
- Apple authentication is the intended review login path for this submission.

## Login

- The app supports Apple and Google OAuth login through Supabase Auth.
- Reviewers should use Apple auth for App Review testing.
- No reviewer credentials are required because Sign in with Apple creates the review account.

## Support

- Support URL: https://app.notion.com/p/Nuances-support-39a7da995fa580b58912fd2ae3cf3310
- Support email: nuances.app.official@gmail.com

## Subscription and Restore Purchases

- Premium unlocks AI card generation, premium cloud TTS, pronunciation scoring, and expanded cache/card creation limits.
- Purchases are handled through Apple in-app purchase via RevenueCat.
- Restore Purchases is available from the membership paywall.
- The membership screen reads the active RevenueCat offering and only renders packages returned by RevenueCat.
- The submitted build uses the RevenueCat `default` offering with the weekly, monthly, and yearly App Store subscription products configured in App Store Connect.

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
- In-app account deletion is available from Settings and asks for confirmation before deleting the authenticated user's account and app data.

## Reviewer Notes To Paste

Nuances helps users create and review language-learning flashcards. Reviewers should sign in with Apple, complete onboarding if prompted, and test card creation from typed text, images, or shared content. Premium features are sold through Apple in-app purchase via RevenueCat; the membership screen displays the active RevenueCat offering, supports purchase, and includes Restore Purchases. AI card generation, cloud TTS, and pronunciation scoring are routed through Supabase Edge Functions so provider secrets are not included in the app bundle. Pronunciation scoring uses microphone access only after the user starts the pronunciation practice flow. The iOS share extension lets users send text or images into Nuances through the configured App Group. Account deletion is available in Settings and deletes the authenticated user's Supabase auth account, profile, cards, cached items, media, review history, sync metadata, and subscription records.

No separate demo username or password is provided. Please use Sign in with Apple for review testing. Support is available at https://app.notion.com/p/Nuances-support-39a7da995fa580b58912fd2ae3cf3310 or nuances.app.official@gmail.com.
