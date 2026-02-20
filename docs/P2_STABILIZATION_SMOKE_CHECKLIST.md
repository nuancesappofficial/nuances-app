# P2 Stabilization Smoke Checklist (No URL Input Scope)

## Purpose
Validate the stabilized auth/share/AI/sync flows after recent fixes.

## Test Data Feed
1. Open `DevTools` tab.
2. Tap `植入測試數據`.
3. Confirm `快取項目 >= 4` and `卡片 >= 5`.

## Environment Preconditions
1. Use a development build (not Expo Go for Share Extension/OCR native paths).
2. Ensure `.env` points to the active Supabase project.
3. Ensure latest Edge Function is deployed:
   `supabase functions deploy ai-proxy`

## Smoke Cases

### A. Auth Gate + AI Auth Error Handling
1. Sign out.
2. Try Create Card AI analysis.
Expected:
- App should not enter redirect loop.
- If no session: return to AuthGate.
- If stale JWT: show re-login action once, no repeated looping.

### B. Google Sign-in Recovery
1. Sign in with Google.
2. Return to app callback.
3. Trigger Create Card AI analysis again.
Expected:
- Analysis runs normally.
- No repeated `Invalid JWT` loop.

### C. Create Card Draft Persistence
1. Open Create Card and run AI analysis.
2. Tap `✕` (do not save).
3. Re-open same cached item.
Expected:
- Draft content is restored.
4. Save card successfully, re-enter.
Expected:
- Draft is cleared.

### D. Share Ingest (Text/Image, no URL)
1. Share text into app.
2. Share one or multiple images into app.
3. Re-open app to trigger ingest.
Expected:
- Items are imported into `cached_items`.
- No duplicate ingest from repeated foreground triggers.
- Concurrent triggers do not produce duplicate rows.

### E. OCR + AI Flow
1. Open image cached item.
2. Run OCR + AI analysis.
Expected:
- OCR succeeds locally.
- AI result returns keyword/definition/tags.
- Auth failures propagate to UI handling path (no silent fallback loops).

### F. Sync Smoke
1. Trigger sync from normal app flow.
2. Observe logs.
Expected:
- No blocking sync errors.
- No repeated concurrent-sync abort loops.

### G. AI Usage Visibility
1. Open `DevTools`.
2. Tap `讀取今日 AI 使用量`.
Expected:
- usage_summary data is shown (day, per-action counts, recent events count).

## Local Automated Checks Completed
- `npm run -s type-check` ✅
- `npm run -s lint` ✅

## Exit Criteria
All sections A-G pass on at least one real-device run.
