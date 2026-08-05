---
id: GM-008
title: Decide the localhost application seam and operating model
status: closed
labels:
  - wayfinder:grilling
parent: GM-001
assignee: codex
blocked_by:
  - GM-003
  - GM-005
---

# Decide the localhost application seam and operating model

## Question

Which module owns the browser-to-server interface, live updates, server-only
secrets, startup and shutdown, environment validation, persistence access, and
adapter composition so the localhost application is easy to run now and can be
hosted later without leaking infrastructure concerns into the UI?

## Resolution comment

Distribution Manager will live in its own repository rather than inside the
Nuances mobile repository. One Distribution Manager application serves multiple
Project Workspaces and can show both project-specific dashboards and a parallel
cross-project overview. Nuances is the first Project Workspace, not a structural
dependency of the product.

The repository is a TypeScript workspace with separate React web and localhost
server applications plus domain, runtime, and connector modules. One development
command starts both applications. The browser sends commands through a small
localhost HTTP interface and receives Agent, queue, webhook, and publication
events through SSE. SSE reconnection uses a durable event cursor so missed events
can be replayed. The browser never imports connectors or talks directly to the
control-plane database.

Distribution Manager owns its own Supabase control plane for Projects,
Campaigns, Agents, tasks, memory summaries, schedules, approvals, audit records,
and events. Each Project Workspace uses adapters to read or write its product's
PostHog, Supabase, App Store attribution, and social accounts. Existing Nuances
growth data requires a later explicit migration; new cross-project operations
must not be written into Nuances Supabase.

Connector configuration and secret references may be stored in the control
plane. Actual Meta, PostHog, and project credentials remain in server-side Vault
or Edge Function secrets. The DeepSeek key remains in the local Keychain or
localhost server environment. Each Project has its own secret scope. Browsers
and ordinary database rows never receive plaintext secrets.

Startup validates the control plane, DeepSeek, and configured Project
connectors. A control-plane failure blocks startup. One failing Project connector
puts only that Project into degraded mode; other dashboards and already-approved
hosted schedules continue. The UI shows connector status, reason, last successful
sync, and a retry action.

The new repository must include `docs/OPERATIONS.md` as a detailed Operations
Runbook for a fresh IT Agent with no conversation history. It documents
architecture and data flow; modules and interfaces; startup, shutdown, and health
checks; Project connector setup and validation; Agent, queue, webhook, schedule,
and retry states; symptom-led diagnostic and recovery procedures; log/event and
domain-ID lookup; safe reruns and duplicate-publication prevention; migrations,
backup, and disaster recovery; known limits; prohibited operations; and approval
or credential escalation points. It contains no plaintext secrets.

`AGENTS.md`, the domain glossary, and `docs/OPERATIONS.md` form the minimum
handoff context for a new IT Agent. Interface, schema, or operating changes must
update the Runbook, and the public-interface/TDD ticket must make that a verified
acceptance requirement.

The first-release Operator UI remains bound to localhost. The purchased BandAce
domain is reserved for public Source Link redirects, verified provider webhooks,
and hosted scheduling-dispatcher ingress; it does not expose or replace the UI.
A future `manager` subdomain remains an extension point and requires a separate
authentication, authorization, rate-limit, and security-review decision.

The DeepSeek credential is supplied only to the localhost TypeScript server
through an ignored local environment file or OS secret store, with an empty
variable documented in `.env.example`. It is never delivered to React or stored
in the Nuances Supabase project. If the Agent Runtime is hosted later, the same
model-adapter seam reads it from that host's secret store.
