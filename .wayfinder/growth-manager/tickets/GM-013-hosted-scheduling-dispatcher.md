---
id: GM-013
title: Decide the hosted scheduling dispatcher contract
status: closed
labels:
  - wayfinder:grilling
parent: GM-001
assignee: codex
blocked_by:
  - GM-005
  - GM-006
---

# Decide the hosted scheduling dispatcher contract

## Question

What small interface, durable schedule states, lease and idempotency rules,
provider reconciliation, webhook inbox, retry timing, three-retry exhaustion,
manual recovery, and observability contract let a minimal hosted dispatcher
publish only approved Instagram and Threads work while localhost is offline?

## Decision

Expose a narrow hosted boundary with five operations:

- `scheduleApproved` persists an exact, already-approved publication.
- `dispatchDue` leases due work and invokes the provider adapter.
- `ingestWebhook` verifies and durably records provider events before applying them.
- `reconcilePublication` resolves ambiguous provider outcomes without blindly republishing.
- `cancelScheduled` cancels work that has not entered an irreversible provider operation.

The durable publication states are `scheduled`, `leased`, `publishing`,
`reconciling`, `retry_wait`, `published`, `waiting_for_you`, and `cancelled`.
A worker receives a five-minute lease and heartbeats every 30 seconds. An expired
lease or ambiguous provider response enters `reconciling` before another publish
attempt, so lease expiry alone can never duplicate a post.

Transient failures retry after 5 minutes, 30 minutes, and 2 hours. Provider
`Retry-After` guidance may delay an attempt, but no attempt begins after the
approval's six-hour retry window. Three failed attempts, an expired retry window,
an unrecoverable authentication error, or an outcome that cannot be safely
reconciled moves the publication to `waiting_for_you`. Recovery requires a new
schedule and, where the immutable action changes or its authorization expires, a
new Approval Record.

Webhook ingress verifies the provider signature, writes the original event to an
immutable inbox before acknowledging it, and deduplicates by provider event ID.
Duplicate deliveries increment delivery metadata without repeating effects.
Provider timestamps and monotonic transition rules prevent delayed or
out-of-order events from regressing publication state.

The dispatcher emits structured state transitions, attempt records, provider
references, reconciliation results, and alert reasons. Email is the first-release
notification channel because this is a single-operator, one-way alert path. Send
email only for `waiting_for_you`, connector authentication expiry, repeated
webhook-ingress failure, and Queue Coverage crossing below its configured
threshold. Email cannot approve, retry, reschedule, or mutate any campaign; it
links the operator back to the localhost UI.

## TDD seam

Contract tests use a deterministic clock and fake provider adapter to prove:

- only exact approved content can be scheduled and dispatched;
- concurrent workers cannot both own a valid lease;
- lease expiry and ambiguous responses reconcile before any second publish;
- retries stop after three attempts or six hours, whichever happens first;
- duplicate and out-of-order webhooks are idempotent and cannot regress state;
- terminal alert conditions emit one deduplicated email notification; and
- notification delivery can never invoke an operational command.
