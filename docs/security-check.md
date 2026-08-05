# Security Check Prompt for Future Projects

Use this prompt for a read-only security audit first. After the audit, implement only the fixes that are clearly safe and scoped. Do not run destructive commands, rotate production secrets, or force-upgrade major dependencies without explicit approval.

## Role

You are a senior mobile, backend, and app security engineer. Audit this project for common high-risk issues, especially issues that often appear in AI-assisted or vibe-coded apps. Prioritize real exploitability over theoretical style concerns.

## Project Context To Confirm

Before changing anything, identify:

1. App framework and runtime, for example React Native, Expo, Next.js, native iOS, Android, or web.
2. Backend and database provider, for example Supabase, Firebase, custom API, or serverless functions.
3. Auth provider and session storage method.
4. Paid access system, for example RevenueCat, Stripe, App Store IAP, or custom entitlement table.
5. AI, OCR, TTS, speech, file upload, or external API providers.
6. Production deployment path and release target, for example App Store, Play Store, web, or internal build.

## Required Audit Checks

### 1. Secrets And Client Bundle Exposure

Check for:

1. Committed `.env`, `.env.local`, `.env.production`, certificates, provisioning files, API keys, private keys, webhooks, service-role keys, Apple shared secrets, Google credentials, RevenueCat API/webhook secrets, OpenAI/Gemini/Azure keys.
2. Incorrect `EXPO_PUBLIC_*`, `NEXT_PUBLIC_*`, `VITE_*`, or other public env usage that ships secrets to the client.
3. Documentation that tells developers to put secret provider keys in public client env vars.
4. Hard-coded tokens in source, test fixtures, README, scripts, CI files, or native config.

Expected fixes:

1. Keep only public anon/client keys in client-exposed env vars.
2. Move provider secrets to server-side functions, backend env vars, or secret managers.
3. Update README and `.env.example` so future developers do not reintroduce secret exposure.
4. Never print secrets in logs or readiness scripts.

### 2. Authentication And Authorization On Every Sensitive Route

Check every API route, serverless function, Edge Function, admin route, webhook, background job, and sync endpoint.

Verify:

1. The route verifies identity server-side, not only in frontend navigation.
2. The route verifies permission/ownership, not only that a user is logged in.
3. Admin routes require admin role or a dedicated server-side token.
4. User IDs are derived from verified JWT/session where possible, not trusted from request body.
5. Webhooks verify provider signatures or secret tokens.
6. Service-role clients are never exposed to app/client code.

Expected fixes:

1. Reject missing/invalid JWT with 401.
2. Reject cross-user access with 403.
3. For account deletion, derive the user ID from the authenticated JWT and delete only that user's records.
4. For entitlement sync, verify with RevenueCat/App Store/server-side provider data instead of trusting client-provided premium status.

### 3. Data-Layer Access Control, RLS, And IDOR

Check:

1. Row Level Security is enabled on user-owned tables.
2. Policies restrict select/insert/update/delete by `auth.uid()` or equivalent owner identity.
3. Storage buckets enforce user-owned upload/update/delete paths.
4. Public-read storage is intentional and does not leak sensitive content through filenames or metadata.
5. Sync paths cannot read or write another user's data.
6. Local cache sync does not accidentally upload private cached data or stale account data.

Tables to review in Supabase-style apps:

1. `profiles`
2. `cards`
3. `review_history`
4. `sync_metadata`
5. `subscriptions`
6. `cached_items`
7. `app_version_policy`
8. Any upload, audio, image, or generated-content tables

Expected fixes:

1. Add or tighten RLS policies.
2. Revoke client role access from local-only or server-only tables.
3. Add smoke tests for user A attempting to access user B data.

### 4. Injection: SQL, Command, File Path, And Prompt Injection

Check:

1. SQL is parameterized through safe query builders or prepared statements.
2. No string-concatenated SQL with user input.
3. File paths are generated safely and do not include raw user text.
4. Shell commands do not include unsanitized input.
5. AI prompts treat user content as hostile data.
6. LLM output is treated as untrusted content and never used to bypass authorization, subscription, ownership, or admin checks.
7. Prompt injection cannot cause secrets, hidden system prompts, provider keys, or private user data to be revealed.

Expected fixes:

1. Add length caps and sanitizers for AI/OCR/share-extension inputs.
2. Use strict action-based AI endpoints instead of arbitrary `provider/messages` proxy routes.
3. Disable legacy arbitrary AI proxy modes.
4. Parse, validate, and sanitize model output before storing or displaying it.

### 5. Rate Limits, Quotas, And Billing Controls

Check all paid or expensive endpoints:

1. AI text generation.
2. OCR.
3. TTS.
4. Speech/pronunciation assessment.
5. Image generation.
6. File upload.
7. Login, signup, password reset, and OTP.
8. Webhook-triggered sync.

Expected fixes:

1. Add server-side quotas per user and per day.
2. Add tier-based limits for free vs premium users.
3. Enforce limits before calling expensive providers.
4. Return 429 with a generic, clear error when quota is exceeded.
5. Add frontend hard caps for recording/upload size/duration, but do not rely on frontend limits alone.

### 6. Logging And Error Disclosure

Check:

1. Production logs do not include auth tokens, JWTs, Authorization headers, prompts, OCR text, raw AI output, user content previews, provider responses, customer info, or payment identifiers.
2. Debug logs are gated behind development-only checks.
3. Client-facing errors do not expose stack traces, provider messages, SQL errors, storage paths, internal IDs, or secret names.
4. Async task status endpoints do not return internal provider errors.

Expected fixes:

1. Gate raw diagnostic logs behind `__DEV__` or equivalent.
2. Return generic reason codes to clients.
3. Keep detailed errors server-side only.
4. Redact sensitive metadata from logs.


### 6A. Structured Crash Diagnostics And Real-User Issue Logs

Check:

0. Structured logs with time stamps, user IDs, request IDs, not "console.log", actual data that can be queried or log levels that make sense. Not everything needs to dumped in the same stream. Centralized logging.
1. The app captures enough breadcrumbs to debug real-user crashes: app start, auth state changes, foreground/background transitions, version checks, subscription restore/sync, AI/OCR/TTS/pronunciation calls, sync jobs, share extension ingestion, account deletion, and user-visible error alerts.
2. Global JavaScript errors and unhandled promise rejections are captured.
3. Logs are structured records, not free-form `console.log` strings.
4. Every remotely queryable log includes `occurred_at`, `received_at`, `level`, `user_id`, `request_id`, `session_id`, `category`, `event`, `message`, `context`, `runtime`, `platform`, `os_version`, `app_version`, and `build_version`.
5. Log levels are explicit and queryable, for example `debug`, `info`, `warn`, `error`, and `fatal`.
6. Request IDs are generated for important flows and propagated through related events when feasible.
7. Console `warn` and `error` events are captured only as sanitized breadcrumbs; raw console arguments are not treated as the source of truth.
8. Logs are written to a queryable backend table or crash platform, not only local device storage.
9. RLS or equivalent server-side access control prevents users from reading or writing another user's logs.
10. Logs include app version, build number, platform, OS version, runtime version, severity, category, event name, timestamp, and sanitized context.
11. Logs do not include raw prompts, OCR text, speech transcripts, audio/image payloads, JWTs, Authorization headers, API keys, emails, passwords, cookies, or payment identifiers.
12. Logs are capped and rotated so they cannot grow without bound.
13. Logs are exportable or retrievable for support without requiring a new build.
14. Fatal crash reporting is sent to a real remote crash platform, for example Sentry or Firebase Crashlytics, before large-scale production launch.

Expected fixes:

1. Add a production-safe structured diagnostics logger with redaction and bounded local persistence.
2. Install global JS error and unhandled promise rejection handlers.
3. Persist authenticated logs to a queryable backend table with RLS, indexes on `user_id`, `occurred_at`, `level`, `event`, and `request_id`, and no client-side ability to write logs for another user.
4. Capture warning/error breadcrumbs while preserving original console behavior.
5. Add explicit structured breadcrumbs for high-risk flows: auth, subscription, sync, AI/OCR/TTS, pronunciation, share extension, storage, app update prompts, and account deletion.
6. Keep raw diagnostic logs development-only.
7. For production scale, add a remote crash backend with source maps uploaded during release.

Example queries:

```sql
select occurred_at, level, category, event, message, request_id, context
from public.app_diagnostic_logs
where user_id = 'USER_UUID_HERE'
order by occurred_at desc
limit 100;

select occurred_at, user_id, category, event, message, context
from public.app_diagnostic_logs
where level in ('error', 'fatal')
  and occurred_at > now() - interval '24 hours'
order by occurred_at desc;

select occurred_at, level, event, message, context
from public.app_diagnostic_logs
where request_id = 'REQUEST_ID_HERE'
order by occurred_at asc;
```

### 7. Session Storage And Token Handling

Check:

1. Mobile auth sessions are stored in Keychain/SecureStore/Keystore, not plain AsyncStorage when feasible.
2. Web apps use secure, httpOnly cookies where applicable.
3. Tokens have appropriate expiry and refresh behavior.
4. Logout clears local data, cached user content, and persisted session state.
5. Account switching cannot leak previous user's local data.
6. CSRF protections exist for cookie-based web sessions.

Expected fixes:

1. Migrate session storage to secure native storage.
2. Preserve migration fallback for existing users.
3. Avoid storing provider keys or long-lived secrets in local storage.

### 8. Subscription And Entitlement Security

Check:

1. Premium status is not controlled by client state alone.
2. Development bypasses cannot be enabled in production builds.
3. RevenueCat/App Store/Stripe entitlement is verified server-side.
4. Restore purchase updates global app state after success.
5. Paywall displays only actual purchasable products from provider offerings.
6. Webhooks cannot be spoofed.

Expected fixes:

1. Disable production subscription dev bypasses.
2. Remove default premium override from production scopes.
3. Sync entitlements server-side with provider API/webhook verification.
4. Avoid hard-coded fake plans in the UI.

### 9. Storage, Uploads, And Generated Media

Check:

1. Upload size, duration, and type limits.
2. MIME validation and extension validation.
3. Storage policies for read/write/delete.
4. Public-read bucket assumptions.
5. Filenames and paths do not leak user text, prompts, document contents, or private identifiers.
6. Signed URLs are used for private content.

Expected fixes:

1. Generate filenames with UUID/random IDs.
2. Keep user-owned paths enforced by policy.
3. Move sensitive media to private buckets when possible.

### 10. CORS, Admin Sync, And Misconfiguration

Check:

1. Admin/sync endpoints do not use broad `Access-Control-Allow-Origin: *` unless truly public and harmless.
2. Admin endpoints require a dedicated server-side token or role.
3. Debug mode is off in production.
4. Default credentials are removed.
5. Production and staging configs are separated.
6. App version/update policy cannot be modified by normal clients.

Expected fixes:

1. Restrict CORS to configured allowed origins.
2. Require sync/admin tokens for management endpoints.
3. Return generic errors for management failures.

### 11. Dependency And Supply Chain Risk

Check:

1. `npm audit`, `pnpm audit`, `yarn audit`, or native dependency advisories.
2. Known vulnerable packages in runtime dependencies.
3. Native/mobile dependency advisories.
4. Lockfile drift.
5. Untrusted postinstall scripts or abandoned packages.

Expected fixes:

1. Prefer targeted upgrades.
2. Do not run `npm audit fix --force` blindly before release.
3. Move major framework upgrades into a separate branch with full regression testing.
4. Document residual moderate vulnerabilities if they come from framework toolchain packages and are not directly exploitable in the shipped app.

### 12. Infra, Open Ports, SSH, And Admin Dashboards

Check:

1. Public SSH, database, Redis, admin dashboards, Supabase studio equivalents, or debug panels.
2. Firewall/security group exposure.
3. Whether SSH/admin access requires VPN such as Tailscale or equivalent.
4. Strong MFA for hosting, Apple, Supabase, RevenueCat, GitHub, and cloud providers.

Expected fixes:

1. Prefer VPN/private network for SSH/admin surfaces.
2. Close public DB/admin ports.
3. Require MFA and least-privilege roles.
4. Document anything that cannot be verified from the repo as a manual infrastructure check.

### 13. App Store And Mobile Release Security

Check:

1. Privacy Policy and Terms links are real and clickable.
2. Permission strings explain concrete use cases.
3. Account deletion exists if account creation/login exists.
4. Restore purchases works in TestFlight/production.
5. App version update policy uses a real App Store URL once listing is available.
6. App Review notes explain login, subscriptions, AI, TTS, pronunciation, share extension, and account deletion.
7. Production build numbers and version numbers are correct.
8. App Group, share extension, and provisioning profiles are correctly configured.

Expected fixes:

1. Keep App Store metadata tasks tracked separately from code blockers.
2. Verify TestFlight restore purchase and account deletion manually.
3. Do not submit until required Apple agreements, support URL, privacy URL, screenshots, build upload, and IAP submission are complete.

## Implementation Rules

When implementing fixes:

1. Keep changes scoped.
2. Do not rewrite unrelated architecture.
3. Do not weaken auth to make tests pass.
4. Do not expose new debugging output in production.
5. Do not revert user changes.
6. Add or update readiness/security scripts where useful.
7. Run verification after each risky change.

## Suggested Verification Commands

Use the commands that exist in the project. Examples:

```bash
npm run type-check
npm run lint
npm run check:security
npm run check:app-store
npm audit --omit=dev
```

For Supabase projects, also verify:

```bash
supabase migration list
supabase functions list
supabase db lint
```

For iOS native dependency changes:

```bash
cd ios
pod install
```

## Final Report Format

Report results worst-first:

1. Severity: Critical, High, Medium, Low, or Manual.
2. File and line.
3. Why it is exploitable.
4. Exact fix or action taken.
5. Verification command and result.
6. Remaining manual checks before launch.

## Launch Blocking Criteria

Block launch if any of these remain:

1. Secrets are committed or shipped to the client.
2. Sensitive routes trust frontend-only auth.
3. Cross-user data access is possible.
4. Paid/expensive APIs have no server-side quota.
5. Premium entitlement can be spoofed from the client.
6. Account deletion is missing when account creation/login exists.
7. Production build has a subscription dev bypass.
8. App Store legal/support/privacy metadata is missing.
9. Production logs leak private user content or tokens.

## Safe Residual Risk Criteria

These may be acceptable if documented:

1. Framework-toolchain audit warnings that require a major upgrade and are not directly exploitable in the shipped app.
2. Manual App Store Connect tasks that cannot be completed from code.
3. Infrastructure checks that require cloud console access, as long as they are explicitly listed for the owner.
