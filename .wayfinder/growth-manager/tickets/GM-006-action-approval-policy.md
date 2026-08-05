---
id: GM-006
title: Decide the action and approval policy
status: closed
labels:
  - wayfinder:grilling
parent: GM-001
assignee: codex
blocked_by:
  - GM-002
  - GM-005
---

# Decide the action and approval policy

## Question

Which tools and actions may each Campaign Agent invoke autonomously, which need
one-time or per-action approval, what evidence must an approval show, when an
approval expires, and how are pause, rejection, retry, duplicate execution, and
audit history represented?

## Resolution comment

Tool permissions have three levels:

- Reading data, analysing results, and producing drafts are automatically
  allowed.
- Publishing, public replies, private messages, and schedule changes require an
  applicable Approval Record.
- Pausing a Campaign or stopping its queue is an emergency-safe automatic
  action. Automatic authority never includes resuming or publishing.

An Approval Record binds the exact content and media version, provider account,
Campaign, action, tracking link, and scheduled time or validity window. Any
change invalidates the approval. A weekly batch can be approved in one operator
gesture, but every content item receives an independent record so one rejection
or revision does not affect the rest. Batch approval is not standing permission
for an Agent to publish arbitrary future content.

A scheduled publication may use its approval until either three retries after
the initial attempt have been exhausted or six hours have elapsed after the
scheduled time, whichever happens first. It then stops and becomes
`waiting_for_you`; rescheduling requires a new approval.

A Keyword-Triggered DM approval binds Campaign keywords, exact message template,
tracking link, provider account, daily limit, and end date. Its first-release
maximum duration is 30 days. The maximum is an adjustable Approval Policy rather
than Agent logic, so future platform- or Campaign-specific durations can change
without changing the Campaign Agent Runtime. A policy change never silently
extends an existing approval. The operator may revoke immediately.

Approval history is immutable. Each record permanently stores a content-version
hash, Campaign, provider account, action, schedule or expiry, Agent preview and
reason, operator decision and timestamp, optional rejection reason, revocation,
execution outcome, and provider identifiers. A revision creates a new record and
may point to the superseded record; it never overwrites the old evidence.
