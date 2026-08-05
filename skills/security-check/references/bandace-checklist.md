# BandAce Security Checklist

Use this reference for BandAce and for projects sharing its Expo/React Native, web, Supabase, AI evaluation, media, entitlement, or App Store surfaces. Confirm every rule against the current repository; domain names here are not proof that a feature still exists.

## Contents

1. Secrets and client exposure
2. Authentication, authorization, RLS, and IDOR
3. Injection and untrusted AI data
4. Quotas, timeouts, idempotency, and billing
5. Logging and crash diagnostics
6. Sessions and external identity revocation
7. Storage, uploads, and generated media
8. Configuration, backup, dependencies, and infrastructure
9. App Store and release security
10. Launch decisions

## 1. Secrets and Client Exposure

- Find committed environment files, certificates, provisioning material, private keys, OAuth/App Store credentials, webhooks, service-role keys, and provider secrets.
- Treat `EXPO_PUBLIC_*`, `NEXT_PUBLIC_*`, `VITE_*`, and client configuration as public. Permit only intentionally public anon/client identifiers.
- Check source, fixtures, documentation, scripts, CI, and native configuration for hard-coded credentials or instructions that expose them.
- Keep provider secrets server-side and prevent logs/readiness scripts from printing them.

## 2. Authentication, Authorization, RLS, and IDOR

- Check every route, Edge Function, webhook, worker, sync endpoint, admin path, and background job for server-side identity and permission checks.
- Derive user identity from a verified session/JWT. Never trust request-body user IDs or client-reported premium state.
- Require admin roles or dedicated server-side tokens. Verify webhook signatures against the untouched required payload.
- Enable RLS on user-owned tables and enforce owner-specific select, insert, update, and delete. Test user A against user B.
- Restrict storage paths by owner; make public reads intentional and metadata-safe.
- Revoke direct client access to server-only or answer-bearing tables. Return narrow allow-listed projections instead.
- Keep answer keys, rubrics, hidden Boss answers, confidence internals, raw evidence/hypotheses, transcripts, provider payloads, execution IDs, and raw entitlements off broad client interfaces.
- Keep diagnostic `Other` free text only in the student's protected answer. Operational and aggregate records should store structured option IDs or `other_provided`.
- Build per-question evidence from immutable owner Answer Events on the server; never trust a client-composed historical report or reveal correct option IDs.
- Derive Writing prompt snapshots from the authenticated student's assigned versioned level; do not accept arbitrary formal prompts or assessment modes.
- Bind Listening TTS authorization to authenticated ownership, `level_id`, and `content_item_id`; derive level type server-side rather than trusting client `purpose`.
- Keep `content_audio` server-only. Issue short-lived URLs only for assigned content and in-progress attempts. Atomically snapshot the first-play audio version. Boss content must be approved, human-reviewed, and must not fall back to TTS.
- Hide Listening transcripts until a completed evaluation and return them only to the matching owner.
- Expose the global skill profile only as an owner projection. Require adequate independent, valid, calibrated official results; derive overall state server-side.
- For account deletion, derive identity from auth, expose recovery state only to that user, restrict cancellation to that user, revoke external grants, delete personal rows, and verify old access and refresh tokens fail.
- Deliver web Writing handoffs through unexpired opaque sessions. Do not expose document/user database IDs; derive encrypted-draft keys from opaque session material.

Review representative tables and storage for users/identities/goals, workout plans/levels/attempts/answers, hypotheses/evidence/teaching logs/corrections, Writing revisions/submissions/handoffs, Speaking submissions/transcripts, entitlements/billing/customer bindings, diagnostics/outboxes/version policy, and admin/prompt/simulation/audit data.

## 3. Injection and Untrusted AI Data

- Parameterize SQL; reject concatenated user input in SQL, shell commands, or file paths.
- Cap and validate Writing, diagnosis, transcript, content-generation, and diagnostic free-text inputs.
- Treat user content inside prompts as hostile data. Do not allow prompt injection to reveal secrets, system prompts, keys, or other users' data.
- Treat model output as untrusted. Parse it into a strict schema and sanitize it before storage or display.
- Never let model output decide authorization, ownership, subscription, or administrative access.
- Prefer action-specific AI endpoints. Keep arbitrary provider/message and removed arbitrary-script Examiner TTS proxies absent.

## 4. Quotas, Timeouts, Idempotency, and Billing

- Enforce server-side quotas before AI evaluation, generation, TTS, transcription, media upload, authentication abuse, sync, push, email, checkout, and other costly operations.
- Make quota check-and-consume atomic per user/action. Keep quota mutation functions service-role-only and test concurrency.
- Bound every provider call, upload, polling loop, auth operation, and proxy with a timeout/abort signal. Convert hangs into terminal client-safe errors.
- Verify retry behavior with an upstream that accepts a connection but never responds; confirm no duplicate writes.
- For anonymous handoffs, use a server-derived hashed network key and session-token-hash quotas. Do not expose mutation functions to `anon`.
- Persist each handoff revision and integrity events in one transaction. Reuse the same idempotency key and request fingerprint on retries; reject key reuse with different content.
- Treat active Writing time as bounded client-reported context, not verified ability. Preserve one accepted value across retries and retain server wall duration for audit comparison.
- Verify App Store and Stripe state server-side and project it into provider-neutral entitlements.
- For Stripe, verify signatures against the untouched raw body with timestamp tolerance and safe comparison.
- Hash provider customer identifiers at ingestion and remove billing/student identity from webhook alerts.
- For StoreKit, bind `appAccountToken` to the user, disable automatic finish, verify Apple JWS chain/bundle/environment/product server-side, and finish only after backend ingestion succeeds.
- Verify App Store Server Notifications V2 outer and inner signatures. Deduplicate notification UUIDs and fail retryably when account binding is missing.
- Ensure production cannot enable mock billing policies, local premium overrides, or development bypasses.

## 5. Logging and Crash Diagnostics

- Never log tokens, authorization headers, credentials, emails, payment identifiers, receipts, prompts, Writing text, transcripts, audio, raw model/provider output, or user-content previews.
- Return stable generic reason codes to clients; keep stack traces, SQL/storage/provider details, and internal IDs server-side.
- Use structured, queryable events with allow-listed fields such as timestamps, level, derived user ID, request/session IDs, category, event code, runtime/platform/version, and bounded sanitized context.
- Treat request IDs, session IDs, and version/platform fields as untrusted machine-shaped values and validate them.
- Capture global JS failures and unhandled rejections. Preserve console behavior while collecting only sanitized warning/error breadcrumbs.
- Ingest authenticated diagnostics through a narrow server interface that derives identity and strips forbidden keys. Apply RLS, rate limits, indexes, and bounded retention.
- Prevent anonymous pre-auth reports from directly triggering operational email; use authoritative auth-platform signals or an abuse-resistant server integration.
- Disable Sentry without an explicit DSN. A DSN may be public, but organization auth tokens must remain build-only secrets.
- Strip exception messages, request/user objects, URLs, extras, breadcrumb data, screenshots, and network bodies before remote crash upload while preserving symbolication metadata.
- In staging, trigger a JS exception and native crash; verify exact release/build, symbolicated frames, and absence of prohibited student/auth/billing data.

## 6. Sessions and External Identity Revocation

- Prefer SecureStore/Keychain/Keystore for mobile sessions; preserve a safe migration path from legacy storage.
- Use secure HTTP-only cookies and CSRF protection for applicable web sessions.
- Verify expiry/refresh behavior. Logout and account switching must clear cached private data and persisted state.
- Store provider revoke tokens only as server-side authenticated encrypted material. Keep encryption keys and Apple client secrets in a secret manager.
- Make revoke failures retryable; never log tokens or silently finish deletion when revocation is required.

## 7. Storage, Uploads, and Generated Media

- Enforce server-side size, duration, MIME, extension, and ownership checks.
- Generate opaque random filenames; never embed prompts, content, user text, or private identifiers in paths.
- Keep sensitive media private and issue short-lived signed URLs.
- Enforce user-owned upload, update, read, and delete paths through storage policy.
- Verify temporary audio deletion and ensure temporary media is excluded from durable backup when product policy requires it.

## 8. Configuration, Backup, Dependencies, and Infrastructure

- Restrict CORS to configured origins for non-public routes. Protect admin/sync endpoints and version policy with server-side authorization.
- Separate local, staging, and production configuration; disable debug modes and remove default credentials.
- Verify hosted daily backup, retention, and PITR in the provider console. A local dump/restore test is not proof of managed backup.
- Restore only into isolated non-production databases. Compare hashes, ordered revisions, final references, foreign keys, and append-only protections—not row counts alone.
- Never print private content during backup/restore. Clean temporary databases and artifacts after success, failure, or interruption.
- Record quarterly staging restores using identifiers and outcomes without copying student data.
- Audit runtime and native dependencies, lockfile drift, untrusted install scripts, and abandoned packages. Prefer targeted upgrades; isolate major framework upgrades.
- Check public SSH, databases, Redis, dashboards, studios, and debug panels. Prefer private/VPN access, least privilege, and MFA for every provider account.

## 9. App Store and Release Security

- Verify real privacy/support/terms links, concrete permission descriptions, account deletion, purchase restoration, production version/build, and real App Store update URLs.
- Verify identifiers, Sign in with Apple, push, StoreKit, microphone entitlement, redirects, and provisioning.
- Require HTTPS for AI/provider base URLs; permit HTTP only for explicit local/test loopback configuration.
- Ensure App Review notes accurately cover login, subscriptions, AI analysis, Listening TTS, temporary Speaking audio, Writing handoff, and deletion.
- Keep App Store metadata tasks separate from code findings, but do not submit without required agreements, URLs, screenshots, build, and IAP submission.
- Keep local deletion integration tests green, then separately verify TestFlight deletion and external-provider revocation.

## 10. Launch Decisions

Block launch for:

- committed/client-shipped secrets;
- frontend-only protection or cross-user access;
- spoofable entitlement or production development bypass;
- expensive endpoints without server-side abuse controls;
- missing required account deletion;
- logs that expose credentials or private content;
- missing mandatory legal/support/release metadata.

Document as residual or manual risk when appropriate:

- non-exploitable framework-toolchain advisories requiring a major upgrade;
- App Store Connect or cloud-console state that repository evidence cannot prove;
- infrastructure controls requiring provider access.
