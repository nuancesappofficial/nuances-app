---
id: GM-003
title: Inventory the current growth data and execution seams
status: closed
labels:
  - wayfinder:task
parent: GM-001
assignee: codex
blocked_by: []
---

# Inventory the current growth data and execution seams

## Question

What authoritative campaign, attribution, user-segment, performance, draft-task,
approval, and agent-run data already exists in the repository, Supabase, and
PostHog; which interfaces expose it; and what concrete gaps must later decisions
account for? This is read-only inventory work and must not implement a gap.

## Resolution comment

Inventory completed against the repository and hosted Supabase on 2026-08-02.
All three growth migrations are present remotely. The `growth-campaigns`,
`content-creation-manager`, and `tiktok-remix-agent` Edge Functions are active.
Hosted table statistics estimate 2 Campaigns, 2 manager runs, 4 performance
snapshots, 4 Agent tasks, and 1 content draft, so these are deployed data seams,
not merely unshipped local code.

### Existing authoritative data and interfaces

- **Campaign Registry:** `growth_campaigns` owns stable Campaign ID, name,
  responsible Agent, manager, platform, method, and Campaign Status. Its deep
  module interface can register, list/filter, and update status through a
  `CampaignRepository`; the deployed HTTP and CLI interfaces currently expose
  register, list, and activate only.
- **Product attribution:** the app parses four `growth_*` values from an incoming
  URL, persists them per installation, and attaches them to later typed analytics
  events. `first_app_opened`, `freemium_quota_updated`, and
  `subscription_started` already exist for Downloads proxy, Freemium User quota
  distribution, and Paying Users.
- **Analytics seam:** product code uses the provider-neutral `AnalyticsAdapter`.
  The server-side `PostHogPerformanceAdapter` currently queries unique Card
  Creators and Paying Users by Campaign over a lookback window.
- **Manager evidence:** `growth_manager_runs` stores the report;
  `growth_campaign_performance_snapshots` stores views, engagements, Card
  Creators, Paying Users, and observation time.
- **Task and approval queue:** `growth_agent_tasks` assigns one Campaign and
  Agent, stores a short brief and one of two content actions, and requires
  approval. Current statuses are draft, approved, running, completed, and
  cancelled.
- **Reviewable output:** `growth_content_drafts` links one unique draft to one
  task and Campaign, stores structured source/script plus tracking URL, and
  separates draft approval from published state.
- **Existing execution proof:** TikTok Remix atomically claims one draft task,
  validates an active Campaign, creates one reviewable draft, restores the task
  to draft if saving fails, and marks it complete after persistence.
- **Security seam:** growth tables are service-role-only. Growth Edge Functions
  require the server-side `GROWTH_OPERATIONS_TOKEN`; PostHog querying uses a
  server-side personal API key.

### Concrete gaps later decisions must cover

- The registry's public interface cannot yet pause, complete, archive, or inspect
  one Campaign, despite the repository supporting generic status updates.
- The generated tracking URL is a `nuances://open` deep link, not an App Store
  URL or deferred-install attribution mechanism. It cannot by itself preserve
  Campaign attribution through a first-time App Store install.
- The manager snapshot and PostHog query omit Downloads and Freemium quota
  segments even though the app emits the required events. Platform metrics are
  accepted as caller-provided totals without provenance, reporting window,
  freshness, provider-native fields, or missing-versus-zero semantics.
- Manager logic and schema are fixed to Content Creation, four scalar metrics,
  two draft actions, and the old ranking order. They do not represent the newly
  agreed outcome priority or Instagram/Threads/Facebook manual evidence.
- Agent tasks lack queued, waiting-for-approval, blocked, failed, retry,
  idempotency, attempt, priority, concurrency-slot, heartbeat, cancellation
  reason, and provider-run identity data. No three-active-Campaign limit is
  enforced.
- There is no persistent Agent conversation, message stream, progress event,
  model-provider adapter, DeepSeek integration, tool-call ledger, or direct-chat
  interface.
- Approval records are boolean/status fields rather than auditable proposals
  with approver, evidence, scope, expiry, rejection reason, or a pre-approved
  Keyword-Triggered DM policy.
- There is no Instagram, Threads, public webhook/media ingress, or Facebook
  manual-evidence adapter. The deployed TikTok function produces a deterministic
  draft and is not a general Campaign Agent runtime.
- Existing read interfaces return only recent manager reports or TikTok drafts;
  no interface composes the four Growth Manager UI views or live state.

This inventory made install attribution independently decidable and confirms
that the operational data, runtime, approval, localhost, and TDD tickets must
design replacements or extensions at their existing seams rather than layer a
dashboard directly over the current tables.
