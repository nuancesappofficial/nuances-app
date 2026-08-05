---
id: GM-001
title: Chart the multi-project Distribution Manager
status: closed
labels:
  - wayfinder:map
---

# Chart the multi-project Distribution Manager

## Destination

A production-usable, single-operator Distribution Manager in its own repository,
running its planning UI and Agent runtime on localhost while managing multiple
Project Workspaces through a dedicated Supabase control plane. Its four approved
UI surfaces connect to real campaign, product-analytics, social-platform, and
Campaign Agent data; DeepSeek is replaceable, scheduled execution remains hosted,
and external actions preserve explicit human approval.

## Notes

- Domain: cross-project Distribution Operations, with Nuances as the first
  Project Workspace. Use the glossary in
  [`docs/CONTEXT.md`](../../docs/CONTEXT.md).
- Every session uses Wayfinder, I Have ADHD, Codebase Design, Domain Modeling,
  and TDD. Use Diagnosing Bugs for pipeline or queue failures.
- One Growth Campaign has exactly one responsible Campaign Agent; one specialist
  Campaign Agent may own several Growth Campaigns.
- Product outcome ranking is Paying Users, Freemium User allowance usage or
  conversion, Downloads, then social engagement. Preserve common cross-platform
  metrics and platform-specific fields.
- Cursor is the development UI, not the Campaign Agent runtime. DeepSeek is the
  initial model adapter; conversation, task, approval, and run history belong to
  the localhost application and Supabase.
- The first release is single-operator with no login screen. Secrets remain
  server-side and never reach the browser.
- The BandAce domain is reserved for Source Links, provider webhooks, and hosted
  dispatch; the first-release Operator UI remains localhost-only. DeepSeek
  credentials remain in the local server environment until runtime hosting is
  separately approved.
- The destination repository includes a detailed, tested `docs/OPERATIONS.md`
  that lets a new IT Agent diagnose and recover the system without chat history.
- Research and drafts may run autonomously. Publishing and external messaging
  require approval. Pausing a campaign is immediately allowed.
- This charting session creates planning artifacts only. This effort explicitly
  carries later execution into the map after its decision tickets make that work
  specifiable; do not implement ahead of the frontier.

## Decisions so far

- [Choose the first-release channel portfolio and Campaign Agent roster](tickets/GM-002-first-release-channel-portfolio.md) — Start with Instagram content, Threads engagement, and human-executed Facebook Group campaigns; cap each specialist Agent at three active Campaigns.
- [Verify Meta channel capabilities and policy constraints](tickets/GM-010-verify-meta-channel-capabilities.md) — Automate Instagram publishing and keyword-triggered private replies plus Threads publishing and engagement; keep Facebook Groups manual because its official API was removed.
- [Inventory the current growth data and execution seams](tickets/GM-003-inventory-current-growth-seams.md) — Deployed Registry, PostHog, manager snapshot, approval-task, and content-draft seams exist, but install attribution, full outcome metrics, persistent Agent runtime/chat, auditable approval, Meta adapters, and composed UI reads do not.
- [Decide the Campaign Agent Runtime contract](tickets/GM-005-agent-runtime-contract.md) — Use a six-operation localhost planning runtime with hierarchical Agent workspaces, operator-supervised 80% context archiving, rolling seven-day Queue Coverage, and a separate hosted dispatcher for approved scheduled work.
- [Decide the action and approval policy](tickets/GM-006-action-approval-policy.md) — Bind immutable per-action approvals to exact content and execution scope, permit weekly batch review and time-limited Instagram DM policies, and reserve automatic authority for reading, drafting, pausing, and stopping.
- [Decide the localhost application seam and operating model](tickets/GM-008-localhost-application-seam.md) — Build a separate multi-project TypeScript workspace with its own Supabase control plane, React-to-server HTTP/SSE seam, isolated Project connectors and secrets, degraded mode, and a mandatory Operations Runbook.
- [Decide the Facebook Group manual evidence workflow](tickets/GM-011-facebook-group-manual-evidence-workflow.md) — Use Agent-authored Posting Packages, human publishing evidence, one Source Link per Placement, and read-only browser observations at 12 hours, 24 hours, 7 days, and 30 days.
- [Research iOS install attribution and deferred Source Links](tickets/GM-015-research-ios-install-attribution.md) — Apple supports truthful aggregate Campaign Link reconciliation but not first-install Source Link recovery; per-install deferred attribution requires a separately proven MMP and explicit match provenance.
- [Decide the App Store install attribution contract](tickets/GM-012-app-store-install-attribution.md) — Use anonymous Placement Source Link redirects plus Universal/App Store Campaign Links, keep clicks, Apple First-Time Downloads, and attributed or unattributed first launches separate, and add no MMP in the first release.
- [Decide the operational data and metric contract](tickets/GM-004-operational-data-contract.md) — Separate distribution, platform, and product outcomes across 1-day, 7-day, 30-day, and Lifetime windows; preserve non-value states and compare only definition-compatible metrics with explicit reasons.
- [Prototype and approve the four-screen operator workflow](tickets/GM-007-prototype-operator-workflow.md) — Use A — Command Center as the primary shell: Project outcomes and Campaign/queue state in the center, urgent approvals and blockers in an attention rail, with Campaign, Agent, and Approval detail one level down.
- [Decide the hosted scheduling dispatcher contract](tickets/GM-013-hosted-scheduling-dispatcher.md) — Use leased, idempotent hosted execution with reconciliation before republish, three retries inside six hours, a durable webhook inbox, manual recovery, and one-way email alerts that return the operator to localhost.
- [Decide the Browser Observation Agent contract](tickets/GM-014-browser-observation-agent-contract.md) — Isolate browser observation in a dedicated profile, permit only approved read-only Recipes, email at due windows, preserve honest missed states and evidence, require risk-based verification, and fail closed on unknown UI or mutation risk.
- [Agree the public interfaces and TDD seams](tickets/GM-009-public-interfaces-and-tdd-seams.md) — Build seven immediately visible vertical slices: outcome pulse and Manager chat first, then parallel action, Agent, and observation lanes, followed by one weekly management-loop acceptance.

## Implementation frontier

- [Implement Slice 1 — Nuances outcome pulse](tickets/GM-016-implement-nuances-outcome-pulse.md)
  is complete with real Supabase, App Store Connect, and PostHog-backed Outcome
  Cards in the approved localhost Command Center.
- [Implement Slice 2 — persistent Manager Agent conversation](tickets/GM-017-implement-manager-agent-conversation.md)
  is complete with a real DeepSeek round trip, dedicated Supabase persistence,
  idempotent commands, durable SSE cursor, and restart recovery.
- Three open, unblocked, unclaimed vertical lanes are now available in parallel:
  [Implement Slice 3 — approved schedule and Queue Coverage](tickets/GM-018-implement-approved-schedule.md),
  [Implement Slice 5 — hierarchical Agent Workspaces](tickets/GM-020-implement-hierarchical-agent-workspaces.md),
  and [Implement Slice 6 — one verified browser observation](tickets/GM-021-implement-browser-observation.md).
- After GM-017 establishes persistent Manager conversation, GM-018, GM-020, and
  GM-021 form three parallel vertical lanes.
- GM-019 follows GM-018 because real publication requires a proven immutable
  approval and durable schedule.
- GM-022 joins all lanes into the first complete weekly management loop.

## Deferred extension

- The future paid-ad adapter and paid metrics such as spend, CPA, and ROAS; only
  its extension seam is part of the first release.

## Out of scope

- Public hosting of the operator UI for the first release; the minimal scheduling
  dispatcher and webhook ingress remain hosted infrastructure.
- Multi-user authentication, roles, and collaborative approvals.
- Running paid advertising or changing paid budgets in the first release.
- Third-party mobile-measurement or deferred-deep-link SDK integration in the
  first release; the Attribution Adapter remains available for a later proven
  provider.
- Replacing Cursor or building a code-editing environment.
