# Product analytics

Nuances uses a provider-neutral analytics service. Product code imports
`analytics` from `src/services/analytics`; it must not import PostHog directly.
This keeps the event contract stable if the backend is replaced later.

## Enable PostHog

Analytics is a no-op unless both the explicit switch and project key are set:

```dotenv
EXPO_PUBLIC_ANALYTICS_ENABLED=true
EXPO_PUBLIC_POSTHOG_API_KEY=phc_your_public_project_key
EXPO_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

For a PostHog EU project, use the host shown in that project's setup page.
Restart Expo after changing public environment variables. The project key is a
client ingestion key, not a PostHog personal or admin API key.

Session replay, automatic lifecycle capture, remote configuration, and
automatic error capture are disabled in code. Only the typed events below are
sent.

## Event contract

| Event | Meaning |
| --- | --- |
| `app_opened` | App becomes ready for an authenticated or anonymous user |
| `onboarding_started` | Onboarding is presented |
| `onboarding_completed` | Onboarding data is saved successfully |
| `card_creation_started` | User starts saving selected generated cards |
| `card_creation_succeeded` | Cards are saved locally and queued for sync |
| `card_creation_failed` | Card save fails or requires premium |
| `review_started` | A non-empty review session is built |
| `review_completed` | User taps Done on the review summary |
| `pronunciation_attempted` | A recording is submitted for assessment |
| `paywall_viewed` | Membership screen is opened |
| `subscription_started` | RevenueCat entitlement is premium or trial and synced |
| `subscription_failed` | Purchase fails or entitlement sync remains pending |

Do not add event properties containing user content. The runtime sanitizer
blocks keys associated with text, prompts, OCR, transcripts, media, credentials,
payment data, email addresses, user IDs, and card IDs. Strings are capped at 80
characters.

## Launch dashboard

Create these PostHog insights:

1. **Activation funnel**
   `onboarding_completed` → `card_creation_succeeded` → `review_completed`
2. **Onboarding completion**
   `onboarding_started` → `onboarding_completed`
3. **Card creation reliability**
   successful and failed card creation, broken down by `source_type`
4. **Review engagement**
   unique users with `review_started` and `review_completed`
5. **Pronunciation adoption**
   unique users with `pronunciation_attempted`, broken down by `context`
6. **Subscription funnel**
   `paywall_viewed` → `subscription_started`, broken down by `source`
7. **Retention**
   weekly retention based on `review_completed`

Use unique users for conversion and retention views. Use total event counts only
when measuring workload, such as cards created or reviews completed.

## Replacing PostHog

Implement `AnalyticsAdapter` in `src/services/analytics/adapter.ts` and replace
the adapter constructed in `src/services/analytics/index.ts`. Product screens
and the event schema do not need to change. During migration, a composite
adapter can send the same sanitized events to both systems until their numbers
match.

