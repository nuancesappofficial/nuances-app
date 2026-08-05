---
id: GM-009
title: Agree the public interfaces and TDD seams
status: closed
labels:
  - wayfinder:grilling
parent: GM-001
assignee: codex
blocked_by:
  - GM-004
  - GM-005
  - GM-006
  - GM-007
  - GM-008
  - GM-013
  - GM-014
---

# Agree the public interfaces and TDD seams

## Question

Which external and internal seams are explicitly approved as behaviour-test
surfaces, and which end-to-end acceptance scenarios prove real data ingestion,
truthful progress, persistent direct chat, approval safety, provider replacement,
and restart or queue recovery without coupling tests to implementation details?

## Approved behaviour-test seams

Tests may exercise exactly five stable module interfaces:

1. **Operator Interface** — localhost HTTP commands and SSE events for Dashboard
   reads, Agent conversation, approval, pause, and recovery.
2. **Campaign Agent Runtime Interface** — resume, message, run-next-task, pause,
   and cancellation behaviours independent of model provider.
3. **Action Execution Interface** — immutable Approval Record through hosted
   scheduling, provider result, webhook reconciliation, and Operator Alert.
4. **Project Data Interface** — Project connectors producing truthful Metric
   Observations and definition-compatible comparisons.
5. **Browser Observation Interface** — scheduling, approved read-only Recipe
   execution, verification, and blocked recovery.

React components, Supabase table shapes, queue-worker functions, prompts, and
provider payload formats remain implementation details. Adapter conformance is
tested through the interface it satisfies; tests do not reach around an
interface to inspect its storage or private collaborators.

## Vertical-slice rule

Implementation proceeds only as small vertical tracer bullets. Every slice must
start with one failing behaviour test at an approved seam, cross the minimum
required persistence and adapter implementation, and finish in immediately
observable Operator Interface behaviour. Do not build horizontal batches such
as all migrations, all connectors, all workers, or all React screens before
returning user-visible feedback. One red test becomes one minimal end-to-end
green capability before the next test is written.

### Slice 1 — Nuances outcome pulse

Prove a single Nuances Project Workspace can show one truthful outcome pulse in
the localhost Command Center:

- Supabase is authoritative for Paying Users and Freemium Users or Starter
  Allowance usage.
- App Store Connect is authoritative for First-Time Downloads.
- PostHog temporarily supplies Campaign attribution only where Supabase lacks a
  persisted Source Link or Growth Campaign relationship.
- First Launches remain separate from Downloads.
- unavailable or pending sources render their Metric State instead of zero.

The first green slice displays a deliberately small outcome card through the
Operator Interface. It does not prebuild the full Dashboard or every connector.

### Slice 2 — persistent Manager Agent conversation

From the Command Center, the operator sends one message to the Manager Agent.
The Operator Interface persists it in the Manager Agent Workspace, resumes the
Campaign Agent Runtime through its provider-neutral interface, persists the
reply, and streams the reply and progress through SSE. Restarting localhost and
reopening the Workspace shows the same conversation.

Behaviour tests use a deterministic Model Adapter and assert message identity,
ordering, persistence, progress events, restart recovery, and error states—not
the prose of a model response. A separate smoke acceptance uses the real
DeepSeek Adapter and server-only key to prove configuration and one round trip;
the adapter can later be replaced without changing the Workspace or tests.

### Slice 3 — approved schedule and Queue Coverage

The Manager Agent creates one Instagram content draft for an identified Campaign
and account. The Operator Interface shows the exact immutable action payload;
operator approval creates an Approval Record, `scheduleApproved` persists the
hosted publication, and the Command Center immediately increases Queue Coverage.

The green slice ends at durable `scheduled`, before provider publication. Tests
prove that edits invalidate approval, unapproved drafts cannot schedule, restart
does not lose the schedule, and only approved scheduled items contribute to
Queue Coverage. This vertically validates Agent output, review UI, approval,
control-plane persistence, hosted handoff, SSE feedback, and Dashboard state
without mixing Meta delivery failures into the same first diagnostic surface.

### Slice 4 — one real Instagram publication

When the approved schedule becomes due, the hosted dispatcher leases it and the
Instagram Adapter publishes the exact approved payload. Provider webhook and
reconciliation results move the publication monotonically to `published`, and
the Operator Interface shows its provider reference and post link.

Contract tests use a fake Meta Adapter to prove lease exclusivity, idempotency,
retry exhaustion, webhook deduplication, ambiguous-outcome reconciliation, and
restart recovery. A controlled acceptance publishes one explicitly identified
test post through a test Instagram Professional account. No ambiguous result may
cause a second publish before reconciliation proves the first attempt absent.

### Slice 5 — hierarchical Agent Workspaces

The Manager Agent creates one bounded task and assigns it to the Instagram
Content Agent. The specialist Workspace shows the task, the specialist reports
progress upward, and the Manager Workspace receives that progress. The operator
can open the specialist Workspace and send a direct message without routing it
through the Manager Agent.

Tests prove independent conversation identity and memory, task ownership,
ordered upward progress, direct operator messaging, restart persistence, and the
invariant that neither delegation nor direct chat grants external-action
authority. Any publication still crosses the Action Execution Interface and its
Approval Policy.

### Slice 6 — one verified browser observation

The operator records one manually published Facebook or Reddit Placement URL.
The system creates its Observation Targets; the hosted dispatcher emits the due
email; opening localhost runs the approved Recipe in the dedicated Browser
Profile; and the Operator Interface shows the screenshot, extracted visible
metrics, Metric States, and verification controls. The first acceptance uses a
controllable clock and one operator-selected test post rather than waiting 12
real hours.

Tests prove the due reminder, origin and Placement checks, read-only action
allowlist, screenshot provenance, absent-field semantics, correction history,
blocked recovery, and the prohibition on browser mutations.

## Delivery lanes

Slices 1 and 2 run sequentially to establish the shared Operator Interface,
persistence, SSE, Project Data, and Campaign Agent Runtime feedback loop. After
Slice 2 is green, three vertical lanes may proceed in parallel:

- Action lane: Slice 3 followed by its dependent Slice 4.
- Agent lane: Slice 5.
- Observation lane: Slice 6.

Each lane owns complete behaviour from an approved interface through persistence
and adapters to visible UI feedback. Parallel work must not be divided into
horizontal database, backend, worker, or frontend batches. Shared interface or
schema changes are integrated through the earliest consuming vertical slice and
communicated to the other lanes before they build on it.

### Slice 7 — weekly management loop

After the three lanes converge, the Manager Agent reads Metric Observations added
since its previous analysis, compares only compatible metrics, records a
checkable Manager Decision, delegates next-week content work, and presents the
result in Approval Center. Approved schedules update Queue Coverage and its
threshold colour in the Command Center.

Tests prove Paying Users rank before Freemium outcomes, First-Time Downloads,
and social engagement; incomparable or absent fields are excluded with reasons;
low coverage produces a visible warning; and every proposed publication remains
a draft until the Action Execution Interface receives an exact Approval Record.

## Cross-slice acceptance

The map is implementation-ready when the seven slices collectively prove real
Project data ingestion, truthful Metric States and progress, persistent Manager
and specialist conversation, exact approval safety, DeepSeek replaceability,
hosted queue restart and reconciliation, read-only browser observation, and a
complete weekly decision-to-queue loop. Every slice updates `docs/OPERATIONS.md`
for its new states, diagnostics, recovery steps, and safe verification command.
