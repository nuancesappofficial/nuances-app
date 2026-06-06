# Account Deletion Backend

## Function

Supabase Edge Function: `delete-account`

The function requires a valid user JWT in the `Authorization` header and deletes only the authenticated user's account data.

## Required Supabase Secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

## Client Configuration

- `EXPO_PUBLIC_DELETE_ACCOUNT_FUNCTION_NAME=delete-account`

## Deleted Data

- `review_history`
- `sync_metadata`
- `subscriptions`
- `cards`
- `cached_items`
- `profiles`
- Supabase Auth user
- User-owned files under the `cached-images` storage bucket

The shared `audio_cache` bucket is intentionally not deleted because it stores reusable pronunciation/TTS cache objects that are not owned by a single account.

## Manual Test Notes

Use a disposable test account only. Account deletion is destructive and cannot be safely tested against a real production account.
