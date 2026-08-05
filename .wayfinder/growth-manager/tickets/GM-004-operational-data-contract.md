---
id: GM-004
title: Decide the operational data and metric contract
status: closed
labels:
  - wayfinder:grilling
parent: GM-001
assignee: codex
blocked_by:
  - GM-002
  - GM-003
  - GM-010
  - GM-012
---

# Decide the operational data and metric contract

## Question

What canonical snapshots, reporting windows, freshness signals, attribution
rules, common social metrics, platform-specific fields, missing-data states, and
ranking explanations must the Growth Manager expose so comparisons remain
truthful across real platforms and product outcomes?

## Resolution comment

Operational data has three explicit layers:

- **Distribution** records Placements, Source Link clicks, publications, public
  replies, and private messages.
- **Platform Performance** preserves common and provider-native Instagram,
  Threads, and Facebook-observation metrics with their media type and provenance.
- **Product Outcomes** records Apple First-Time Downloads, app First Launches,
  Freemium User segments and quota usage, and Paying Users.

Every snapshot identifies Project Workspace, Campaign, optional Placement,
metric definition/version, provider, observation window, observed value/state,
provider period, actual retrieval time, and provenance or evidence pointer.
Default Dashboard windows are 1 day for early signals, 7 days for weekly content
planning, 30 days for Campaign continuation, and Lifetime for accumulated
outcomes. Custom ranges are available but are not the default home view.

Numeric zero is valid only when the provider confirmed zero. Non-values are
typed as `unavailable`, `pending`, `suppressed`, `stale`, or `error`; none may be
coerced to zero for charts, rates, or ranking. UI and Manager Decisions expose
last successful sync and applicable state reasons.

Default freshness is event-driven for Meta webhooks; hourly Instagram/Threads
insight refresh during the first 48 hours and daily afterward; product-analytics
refresh every 15 minutes; daily Apple report import with provider latency shown;
and Facebook browser observations at 12 hours, 24 hours, 7 days, and 30 days.
Provider rate limits and backoff may reduce frequency, but adapters must expose
that degradation rather than hide it.

Metric Comparability is decided per metric, not per Dashboard. Items participate
only when their metric definitions, windows, and grain are compatible and their
data is usable. Paying Users, First-Time Downloads, and First Launches may be
compared across Projects when definitions match. Views participate only where
the relevant platforms/media define a compatible measure. Freemium quota usage
participates only when quota definitions align. Every comparison shows how many
items participated and why others were excluded.

There is no opaque composite score. The primary decision order remains Paying
Users; comparable Freemium User quota usage or conversion; First-Time Downloads
and First Launches; then comparable platform engagement. `collect_more_data`,
`scale`, `iterate`, or `stop` decisions cite the exact snapshots, comparable
metrics, excluded metrics, and plain-language reason. Raw cross-project results
may therefore be compared where valid without pretending every Project or post
has identical measurements.
