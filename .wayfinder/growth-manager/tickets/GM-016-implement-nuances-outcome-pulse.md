---
id: GM-016
title: Implement Slice 1 — Nuances outcome pulse
status: closed
labels:
  - wayfinder:implementation
  - tdd:vertical-slice
parent: GM-001
assignee:
blocked_by:
  - GM-009
---

# Implement Slice 1 — Nuances outcome pulse

Create the separate Distribution Manager repository and one minimal Command
Center outcome card. Start with one failing Operator Interface behaviour test;
cross the minimum Project Data adapters and persistence; finish with visible real
Nuances Paying Users, Freemium/Starter Allowance usage, First-Time Downloads, and
explicit non-value Metric States. Use Supabase and App Store Connect as sources
of truth and PostHog only for attribution not yet persisted in Supabase.

Create the initial `AGENTS.md`, domain glossary, `.env.example`, and
`docs/OPERATIONS.md`. Do not build unused Dashboard regions or connectors.

## Resolution

Implemented in the independent repository at
`/Users/users/vibe_coding_projects/distribution-manager` without changing the
Nuances application. The approved Variant A Command Center now reads a minimal
Operator Interface backed by read-only Nuances Supabase, App Store Connect, and
PostHog adapters.

Final acceptance on 2026-08-02:

- `npm test`: 5 files and 5 tests passed.
- `npm run type-check`, `npm run lint`, and `npm run build`: passed.
- localhost health returned `healthy`.
- the real pulse and visible Outcome Card agreed on Paying Users `3`, Freemium
  Users `9`, App Store First-Time Downloads `pending` because three daily reports
  were unavailable, and First Launches `4`.
- every card showed source, reporting window, retrieval time, and truthful Metric
  State; Downloads remained distinct from First Launches.
- Campaign, Agent, queue, and approval areas remained explicit unconfigured
  shells; no later slice was implemented.
- browser console verification found no warnings or errors.

The first type-check audit caught and removed an unapproved `sourceUrl` expansion
from the test fixture and Domain Interface before closure. Operational startup
also confirmed that only one `npm run dev` instance should own ports 4273/4274;
the Runbook remains the recovery source for local process conflicts.
