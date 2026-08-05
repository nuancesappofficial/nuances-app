# Android Function Parity Handoff

Last updated: 2026-07-22

## Prompt For The New Chat

You are taking over Android feature-parity work for the Nuances React Native / Expo app. Implement Android equivalents for:

1. Receiving text, one image, or multiple images from the Android Sharesheet and importing them into the local Cache stack.
2. On-device English OCR using Google ML Kit, exposed through the same TypeScript contract currently used by Apple Vision OCR.

Read this handoff and the referenced files before editing. Work end to end: inspect the existing architecture, implement the native/config changes, preserve all security and idempotency boundaries, build Android, test cold-start and foreground intent delivery, test OCR with real images, and update the security preflight. Do not stop at code snippets or a plan.

The worktree contains many existing user changes. Do not revert, overwrite, reformat, or include unrelated files. Before editing, run `git status --short` and inspect diffs in every file you need to touch.

## Scope

### Required

- Android receive-share support for:
  - `text/plain`
  - one `image/*`
  - multiple `image/*`
- Delivery from both:
  - cold start / initial launch intent
  - an `onNewIntent` while Nuances is foregrounded or backgrounded
- Local-only ingestion into WatermelonDB `cached_items`.
- Account ownership checks and replay-safe ingestion.
- Android on-device OCR for English text using Google ML Kit Text Recognition.
- The Android OCR result must match the existing `VisionOCRResult` TypeScript shape.
- Android build and device/emulator validation.
- Security preflight coverage for the Android paths.

### Not Part Of This Handoff

- Google Play Console listing, screenshots, Data Safety form, or closed-testing setup.
- Google Play Billing / RevenueCat Android products.
- Google Sign-In Android OAuth configuration.
- Outgoing sharing from Nuances to another app.
- Replacing or redesigning the Cache UI.
- Changing iOS Share Extension behavior unless a shared TypeScript refactor requires a narrowly scoped adjustment.

## Current Project Facts

- Workspace: `/Users/users/vibe_coding_projects/nuances-app`
- Expo: SDK `~54.0.33`
- React Native: `0.81.5`
- New Architecture: enabled
- Android package: `com.jeffenglishlearning.nuances`
- iOS bundle ID: `com.jeffenglishlearning.nuances`
- The repository currently has no generated `android/` directory.
- Cache persistence: WatermelonDB, local device only.
- `cached_items` is deliberately excluded from Supabase sync and revoked from remote client roles.
- Current learning/OCR scope: English only.
- Cache hard limit: 500 active items per user.
- Cache UI renders at most 8 stack cards simultaneously.
- OCR background processing is bounded to 3 items per pass.

## Non-Negotiable Architecture Rules

1. `cached_items` remains pure local data. Do not create Supabase rows for shared text, shared images, OCR source images, or Cache cards.
2. Supabase may only receive sanitized diagnostic metadata through the existing logging service. Never upload raw OCR text, shared text, image paths, image bytes, or user prompts as logs.
3. Every local Cache write must include the authenticated `user_id`.
4. A payload received for account A must never be imported after the app switches to account B.
5. Reopening the same intent or retrying after a crash must not multiply Cache records.
6. Never retain transient `content://` access as the long-term Cache path. Copy accepted images into an app-owned local directory before persisting the Cache record.
7. Do not weaken the existing iOS path while adding Android.
8. Do not use unrestricted MIME or file access. Accept only normalized non-empty text and image MIME types.
9. Do not log raw intent extras, shared text, OCR text, content URIs, local paths, or image data.

## Existing iOS Share Pipeline

The iOS implementation is reference behavior, not code that runs on Android:

```text
Other iOS app
  -> Nuances Share Extension (Swift)
  -> App Group UserDefaults queue + shared image files
  -> main app reads a timestamped snapshot
  -> account owner and limits are checked
  -> WatermelonDB cached_items
  -> queue is acknowledged only when the timestamp still matches
```

Important files:

- `ios/NuancesShareExtension/ShareViewController.swift`
- `plugins/ShareViewController.swift`
- `plugins/withShareExtension.js`
- `ios/Nuances/SharedDefaultsModule.swift`
- `ios/Nuances/SharedDefaultsModuleBridge.m`
- `src/native/SharedDefaultsModule.ts`
- `src/services/shareExtension/shareExtensionService.ts`
- `src/hooks/useShareExtension.ts`

Existing protections that Android must preserve conceptually:

- Queue owner ID.
- Maximum 50 queued items.
- Maximum 2,000 characters per text item.
- Maximum 10 images per shared item.
- A single ingest run at a time.
- Exact duplicate text protection.
- Image replay protection.
- Timestamp-safe/atomic acknowledgement.
- Recheck active account before writes and before acknowledgement.
- Global 500-item Cache capacity.

## Android Sharesheet Target Design

Use a maintained library only if it is confirmed compatible with Expo SDK 54, React Native 0.81, the New Architecture, cold-start intents, `ACTION_SEND_MULTIPLE`, and custom acknowledgement. Otherwise implement a small local Expo Android module/config plugin. Do not add an unmaintained dependency merely to avoid native code.

### Manifest / intent support

Configure Android intent filters for the main app or a dedicated transparent receiver as appropriate:

- `android.intent.action.SEND` with `text/plain`
- `android.intent.action.SEND` with `image/*`
- `android.intent.action.SEND_MULTIPLE` with `image/*`
- `android.intent.category.DEFAULT`

Avoid a broad `*/*` filter.

Because the repo does not contain a generated `android/` directory, persistent native configuration must live in Expo config, a config plugin, or a local Expo module. Do not rely on manual edits to a generated AndroidManifest that will disappear on the next prebuild.

### Native payload contract

The Android native boundary should expose a small, typed API similar to:

```ts
type AndroidSharedPayload = {
  id: string;
  ownerUserId: string | null;
  receivedAt: number;
  type: 'text' | 'image';
  text?: string;
  imageUris?: string[];
};

getPendingSharedPayloads(): Promise<AndroidSharedPayload[]>;
acknowledgeSharedPayloads(ids: string[]): Promise<boolean>;
setActiveUserId(userId: string | null): Promise<void>;
```

Equivalent names are acceptable, but the following semantics are required:

- Read initial intent on cold start.
- Receive new intents while the existing Activity is reused.
- Each native payload has a stable replay/idempotency ID.
- Persist pending payload metadata until JS acknowledges successful processing.
- Store the active user ID in Android private `SharedPreferences`; stamp it onto the payload at receipt time.
- Do not import payloads with a missing or mismatched owner.
- Acknowledgement removes only the processed IDs and must not clear newer payloads.
- Cap persisted queue size at 50.

### Text normalization

- Require a string.
- Trim surrounding whitespace.
- Reject empty content.
- Limit to 2,000 characters before queueing and before DB insertion.
- Deduplicate normalized text in the pending queue.
- Before WatermelonDB create, query active local rows by:
  - current `user_id`
  - `content_type = text`
  - exact normalized `content_text`
  - `deleted_at = null`

### Image handling

- Accept no more than 10 images from one intent.
- Validate that each item is an `image/*` URI exposed by the incoming intent.
- Use `ContentResolver` and granted URI permissions only long enough to read/copy the image.
- Copy each accepted image into an app-owned directory partitioned by user ID, for example `Documents/SharedImages/<userId>/`.
- Generate safe app-owned filenames; never use an untrusted display name as a path.
- Enforce reasonable byte and dimension limits before expensive decode/copy work.
- Persist only the app-owned URI/path in `media_uri` and `image_storage_path`.
- Prevent replay by stable payload ID plus final local path/idempotency checks.
- If copying or DB insertion fails, leave the payload unacknowledged for bounded retry; do not create partial duplicate rows.
- Delete temporary files when a payload is permanently rejected or when cleanup owns the file.

### JS ingestion integration

Prefer extracting shared platform-independent Cache write helpers rather than duplicating WatermelonDB code. Keep the iOS snapshot reader and Android intent reader platform-specific, then converge before local validation and insertion.

Likely files to add or modify:

- `app.json`
- `plugins/withAndroidShareIntent.js` or an equivalent local Expo module config
- `modules/android-share-intent/` if a local Expo module is used
- `src/native/AndroidShareIntentModule.ts`
- `src/services/shareExtension/shareExtensionService.ts` or a new platform-neutral `shareIngestService.ts`
- `src/hooks/useShareExtension.ts` (rename only if worthwhile; avoid churn)
- `src/services/cache/cacheLimitService.ts`
- `scripts/security-preflight.js`

The existing hook currently checks on mount and foreground, including a delayed foreground retry. Android event delivery should trigger the same idempotent ingest path without creating multiple subscriptions or parallel writes.

## Current Cache Model

Primary files:

- `src/database/models/CachedItem.ts`
- `src/database/schema.js`
- `src/database/index.ts`
- `src/services/cache/cacheLimitService.ts`
- `src/screens/flow/CacheScreenFlow/hooks/useCacheListDataSource.ts`
- `src/screens/flow/CacheScreenFlow/hooks/useCacheItemCleanup.ts`

Required fields for shared text:

```text
userId
type = text
contentType = text
contentText
sourceApp = android_share_sheet
aiAnalysisCompleted = false
convertedToCard = false
expiresAt = now + 10 minutes
```

Required fields for shared images:

```text
userId
type = image
contentType = image
mediaUri = app-owned local URI
imageStoragePath = app-owned local URI
sourceApp = android_share_sheet
aiAnalysisCompleted = false
convertedToCard = false
expiresAt = now + 10 minutes
```

Do not add a remote schema or Supabase migration for these records.

## Existing OCR Pipeline

Current OCR is Apple-only:

- `modules/vision-ocr/expo-module.config.json` declares only `"platforms": ["apple"]`.
- `modules/vision-ocr/ios/VisionOCRModule.swift` uses Apple Vision.
- `modules/vision-ocr/src/index.ts` only loads the native module on iOS.
- `src/native/VisionOCRModule.ts` re-exports the local module.
- `src/services/ocr/ocrService.ts` calls `recognizeTextWithVision()` and maps blocks into the app OCR model.
- `src/services/ocr/languagePacks.ts` currently resolves English-only OCR configuration.

The public TypeScript result contract is:

```ts
type VisionOCRFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type VisionOCRBlock = {
  text: string;
  confidence: number;
  frame: VisionOCRFrame;
  candidates?: Array<{ text: string; confidence: number }>;
};

type VisionOCRResult = {
  fullText: string;
  blocks: VisionOCRBlock[];
  imageWidth: number;
  imageHeight: number;
};
```

Read the exact definitions in `modules/vision-ocr/src/index.ts` before implementing.

## Android OCR Target Design

Extend the existing local `vision-ocr` Expo module rather than creating a second UI/service path.

Recommended approach:

- Add Android support to `modules/vision-ocr/expo-module.config.json`.
- Add an Android Expo module implementation in Kotlin with the same native module name: `VisionOCR`.
- Use Google's official ML Kit Text Recognition for Latin script.
- Prefer an on-device/bundled model suitable for English so OCR does not depend on Nuances API quota, Azure, Supabase, or a network connection.
- Use the latest stable ML Kit dependency compatible with the generated Expo SDK 54 Android project; verify from official ML Kit documentation at implementation time.
- Keep the existing `recognizeTextWithVision()` TypeScript function for compatibility, or introduce a neutral alias while preserving existing callers.

### Android OCR behavior

- Accept app-owned `file://`, absolute local paths, and safely readable Android `content://` URIs when necessary.
- Decode using Android/ML Kit APIs that respect image orientation metadata.
- Return image dimensions in pixels.
- Return block or line bounding rectangles using the same top-left pixel coordinate convention expected by `ocrService.ts`.
- Return normalized confidence where available. If ML Kit does not provide candidate alternatives, omit `candidates` or return the recognized text as the sole candidate; do not fabricate alternatives.
- Join recognized lines into `fullText` with newlines.
- Reject empty/unsupported images with stable error codes and generic messages.
- Perform recognition off the JS/UI thread.
- Never log recognized text or local image paths.

Update Apple-specific wording such as `Apple Vision OCR is not available on this device` so Android receives a platform-neutral user-facing error.

Likely OCR files to modify:

- `modules/vision-ocr/expo-module.config.json`
- `modules/vision-ocr/package.json`
- `modules/vision-ocr/src/index.ts`
- `modules/vision-ocr/android/build.gradle`
- `modules/vision-ocr/android/src/main/AndroidManifest.xml`
- `modules/vision-ocr/android/src/main/java/.../VisionOCRModule.kt`
- `src/services/ocr/ocrService.ts`
- `src/services/ocr/languagePacks.ts`
- `scripts/security-preflight.js`

Do not remove or replace the working Swift implementation.

## Account Isolation

Relevant identity helpers:

- `src/services/auth/userIdentity.ts`
- `src/services/auth/localDataScope.ts`
- `src/native/SharedDefaultsModule.ts`

Required sequence for Android incoming shares:

1. Native receives the intent and records the owner active at receipt time.
2. JS waits until persisted auth/session identity is available.
3. Compare current user ID with payload owner ID.
4. Recheck the current user immediately before WatermelonDB write.
5. Recheck again before acknowledgement.
6. If the account changed, do not insert. Remove or safely reject the stale payload and app-owned temporary files.

Never infer ownership from a URI, filename, email address, or intent sender package.

## Diagnostics

Use:

- `src/services/logging/diagnosticsLog.ts`

Log only operational metadata such as:

- platform
- request/payload ID
- stage
- item type
- accepted count
- blocked count
- byte count bucket
- duration
- safe error name/code

Never log:

- shared text
- OCR output
- image URI or filesystem path
- raw intent extras
- auth tokens
- email address
- image bytes/base64

Use category `share_extension` for incoming-share parity unless the logging type is intentionally generalized to `share`; use category `ocr` for OCR.

## Security And Failure Cases To Test

### Android incoming share

- Cold app, logged-in user, share one text item.
- Running app, share one text item.
- Share the same text repeatedly; only one active Cache row exists.
- Send multiple intent callbacks concurrently; no multiplication.
- Share 2,001+ characters; stored value is capped at 2,000.
- Share empty/whitespace text; rejected.
- Share one image.
- Share ten images.
- Attempt more than ten images; extras are blocked, not queued indefinitely.
- Replay the same intent/payload ID; no duplicate rows.
- Force-stop/relaunch between native receipt and DB write; one eventual import.
- Switch from account A to B before processing; A payload is not imported into B.
- Log out before processing; no guest Cache record.
- Fill Cache to 500; additional payloads are blocked with a natural-language UI message.
- Unsupported MIME and malformed URI; rejected without crash.
- Revoke URI permission or delete source before copy; bounded failure, no partial row.

### Android OCR

- Clear English screenshot.
- Camera photo with rotation metadata.
- Portrait and landscape images.
- Large image; no OOM or UI freeze.
- Empty/blank image.
- Missing file.
- Unsupported/corrupt image.
- Multiple text blocks; frames stay within image bounds.
- OCR output feeds the existing target-selection and card creation flow.
- Airplane mode; bundled OCR still works.
- No raw text/path appears in console or diagnostic logs.

## Suggested Validation Commands

Start by loading the project normally:

```bash
npm install
npm run type-check
npm run check:security
```

Before generating native Android files, inspect the worktree. Do not run a destructive clean prebuild over user changes. Since no `android/` directory currently exists, generate/build using the repo's Expo conventions after persistent config/module work is ready:

```bash
npx expo prebuild --platform android
npx expo run:android
```

Also run targeted lint on every changed TS/TSX file:

```bash
npx eslint <changed-ts-and-tsx-files>
```

Useful text-intent smoke command after the Android Activity exists:

```bash
adb shell am start \
  -a android.intent.action.SEND \
  -c android.intent.category.DEFAULT \
  -t text/plain \
  --es android.intent.extra.TEXT "Android share parity test" \
  -n com.jeffenglishlearning.nuances/.MainActivity
```

Use Android Photos/Files and a real sharing app for image and multi-image tests; shell-generated content URIs often do not reproduce real temporary permission behavior.

Before declaring completion:

```bash
npm run type-check
npm run check:security
npm run check:app-store
git diff --check
```

Run a production-style Android `.aab` build after local debug validation. Verify package name, target SDK, permissions, signing behavior, and that no development bypass is enabled.

## Security Preflight Additions

Extend `scripts/security-preflight.js` so it fails if Android parity regresses. At minimum check for:

- Android OCR module registration and ML Kit implementation.
- Android receive-share intent filters/config.
- `ACTION_SEND_MULTIPLE` support.
- queue/item/image/text caps.
- stable payload ID plus acknowledgement API.
- account owner check.
- WatermelonDB local-only boundary.
- app-owned image copy before persistence.
- no broad `*/*` receive filter.
- no raw share/OCR content logging.

Keep checks behavior-oriented; avoid fragile checks that only look for comments.

## Definition Of Done

The task is complete only when all of the following are true:

- Android users can select Nuances from the Sharesheet for text, one image, and multiple images.
- Cold-start and foreground share delivery both work.
- Each accepted item produces exactly one local Cache row for the correct account.
- Replayed or concurrent delivery cannot produce an uncontrolled card burst.
- Android image uploads and shared images receive on-device English OCR.
- OCR result geometry works with the existing target selection/card creation UI.
- iOS Share Extension and Apple Vision OCR still build and behave as before.
- TypeScript, targeted ESLint, security preflight, and Android native build pass.
- A physical Android device has tested share URI permissions and OCR camera/photo orientation.
- No raw user content appears in production logs.
- Changed files and remaining manual Google Play tasks are documented in the final response.

## Known Repository Caution

The worktree is heavily modified and includes unrelated App Store, UI, subscription, security, and content work. Treat all pre-existing modifications as user-owned. Never use `git reset --hard`, `git checkout --`, broad restore commands, or clean-prebuild behavior that discards changes. Keep this Android parity implementation narrowly scoped and report any generated native-file churn before proceeding.
