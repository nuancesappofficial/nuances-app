---
id: GM-014
title: Decide the Browser Observation Agent contract
status: closed
labels:
  - wayfinder:grilling
parent: GM-001
assignee: codex
blocked_by:
  - GM-011
---

# Decide the Browser Observation Agent contract

## Question

What browser-session isolation, read-only tool surface, schedule and lateness
rules, screenshot evidence format, metric extraction and operator-verification
rules, UI-change detection, blocked recovery, data retention, and explicit
prohibitions keep Facebook Group observation useful without representing it as
an official API or permitting unintended external actions?

## Decisions in progress

### Browser-session isolation

Use one dedicated Browser Profile for Distribution Manager observation. The
operator signs into Facebook and Reddit in that isolated profile; the Browser
Observation Agent never receives or stores the account password. It may access
only registered Placement URLs and their same-origin authentication redirects.
The operator's everyday Browser Profile, tabs, history, cookies, downloads, and
saved credentials remain outside the module's interface.

### Read-only interaction surface

Permit navigation, DOM reading, screenshot capture, scrolling, and a small
allowlist of non-mutating disclosure actions such as “see more”, “expand
comments”, and pagination. Before and after each action, verify the registered
origin, Placement identity, and absence of a composer or mutation confirmation.
Text entry, reactions, comments, shares, follows, joins, saves, private messages,
publishing, account changes, and downloads are prohibited. An unknown control,
unexpected navigation, or UI whose mutability cannot be proven stops the run and
marks the observation `blocked` for operator review.

### Schedule, reminder, and lateness

Each Placement schedules observations for 12 hours, 24 hours, 7 days, and 30
days after its recorded publication time. The hosted dispatcher sends a one-way
email at each due time asking the operator to open the localhost application;
the email cannot start the Browser Agent or mutate an observation.

When the application opens, due observations run in chronological order. If
several observation windows were missed, capture the Placement once at the real
current time. Store that snapshot under its actual observation time and mark
every earlier unobserved target `missed`; never clone the current values into
historical windows. Record lateness as the difference between target and actual
time. The next future target remains scheduled normally.

### Evidence retention

Retain screenshots through the 30-day observation and for 90 additional days,
then delete the image object through a recorded retention job. Preserve numeric
Metric Observations, Metric States, target and actual times, lateness, extraction
provenance, operator corrections, and deletion audit metadata indefinitely.
Deleting a screenshot never deletes or rewrites its derived observation.

### Extraction and operator verification

Extract every clearly labelled numeric field visible on the registered
Placement, preserving its platform label and mapping only definition-compatible
fields to canonical metrics such as comments, reactions, or views. A field that
is absent, hidden, suppressed, or ambiguous receives the appropriate Metric
State; it is never inferred as zero.

The first three successful observations for each platform require operator
verification against their screenshots. After calibration, structurally known,
high-confidence extractions may be accepted automatically. Require operator
verification again when the UI fingerprint changes, a selector becomes
ambiguous, extraction confidence falls below the configured threshold, or a
cumulative counter decreases. Preserve the original extracted value, operator
correction, actor, time, reason, and screenshot reference rather than overwriting
history.

### Failure and recovery

Retry transient page-load and browser failures after 5 minutes, 30 minutes, and
2 hours, for at most three attempts. Authentication expiry, insufficient
permission, deleted content, Placement identity mismatch, mutation risk, or an
unknown UI stops immediately without exploratory clicking. Mark the observation
`blocked`, preserve the failure evidence, and emit one deduplicated Operator
Alert. After the operator restores the session or verifies a safe observation
recipe, they explicitly resume the observation from localhost.

### Versioned observation recipes

An Observation Recipe identifies a platform and UI fingerprint, allowed origins,
safe disclosure actions, Placement identity checks, labelled metric extraction
rules, and prohibited mutation surfaces. A UI mismatch invalidates automatic
observation; the Agent may produce a proposed Recipe with screenshots and an
element-by-element explanation, but it cannot activate or silently edit one.
Only an operator-approved version becomes active. Every run records the exact
Recipe version it used so later corrections do not rewrite earlier provenance.

The first release supplies a Facebook Group Recipe. Reddit and other unsupported-
by-official-interface sources may add their own Recipes later without widening
the Browser Observation Agent interface or inheriting Facebook-specific rules.

## Contract

Expose a deep, read-only observation module with four operations:

- `schedulePlacementObservations` creates the 12h, 24h, 7d, and 30d targets.
- `runDueObservations` processes due work through the approved Recipe.
- `verifyObservation` accepts or corrects an extracted snapshot with provenance.
- `resumeBlockedObservation` retries only after the operator records recovery.

The interface returns typed observation results and never exposes arbitrary
browser automation, selector editing, credential entry, or mutation commands.
Observation status is `scheduled`, `due`, `observing`, `needs_verification`,
`observed`, `missed`, `blocked`, `cancelled`, or `completed`. Placement completion
still occurs after the 30-day target is observed or explicitly recorded as
missed/blocked and resolved by the operator.

## TDD seam

Contract tests use a fake clock, an isolated fake Browser Adapter, fixed HTML
fixtures, and an in-memory evidence store. Vertical slices must prove that:

- only registered Placement URLs in the dedicated profile can be opened;
- only actions allowed by the active approved Recipe can execute;
- any attempted text entry or mutation fails closed before browser execution;
- overdue targets create one current snapshot and honest `missed` states;
- absent and ambiguous metrics never become numeric zero;
- calibration, UI changes, low confidence, and decreasing counters require review;
- transient failures retry three times while unsafe failures block immediately;
- Recipe changes require operator approval and preserve the version per run; and
- screenshot retention removes the image after 90 days without changing metrics.
