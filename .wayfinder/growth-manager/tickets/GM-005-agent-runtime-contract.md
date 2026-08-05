---
id: GM-005
title: Decide the Campaign Agent Runtime contract
status: closed
labels:
  - wayfinder:grilling
parent: GM-001
assignee: codex
blocked_by:
  - GM-002
  - GM-003
---

# Decide the Campaign Agent Runtime contract

## Question

What small provider-neutral interface must create or resume a Campaign Agent,
send persistent messages, stream progress, invoke tools, and pause, retry, or
cancel work; and what ownership, queue, concurrency, idempotency, failure, and
recovery semantics must its DeepSeek adapter hide?

## Resolution comment

The provider-neutral Campaign Agent Runtime is a localhost planning module with
six external operations: `resumeAgent`, `sendMessage`, `runNextTask`,
`streamEvents`, `pauseTask`, and `cancelTask`. Its interface uses Agent,
Campaign, Task, and message identities; DeepSeek prompts, context caching,
context assembly, tool calls, queue leases, and provider details remain inside
the implementation. A DeepSeek adapter is first, but the seam permits another
model adapter without changing callers.

Each specialist Campaign Agent owns an independent Agent Workspace and may run
at most three active Campaigns. Campaign-scoped and Agent-level messages remain
distinguishable. Agents normally report to the Growth Manager, which talks to
the operator; the operator may enter any Agent Workspace directly. Direct
operator instructions take precedence and remain visible to the Growth Manager.

The runtime uses these Agent Task Status values: `queued`, `running`,
`waiting_for_you`, `blocked`, `completed`, and `cancelled`. Scheduled-publication
state belongs to a separate module. Supabase persists task and conversation
state so localhost can resume safely.

DeepSeek automatically provides best-effort prefix caching, but Supabase owns
memory. Only the current unarchived conversation is retained as raw chat. At 80%
of the active context allowance, the Agent proposes a dated memory summary and
changes to its durable `agent.md`. The operator compares the proposal with the
source conversation and may edit or approve it. Only after approval may the
runtime save the dated summary, update `agent.md`, and delete that raw segment.
Approvals, tool activity, publishing, errors, and performance snapshots remain
separate permanent audit or numeric records and are never discarded as chat.

Performance numbers stay in normalized Supabase snapshots and UI charts. Memory
summaries record decisions, reasons, dates, Campaign IDs, and snapshot pointers,
not copied time-series data.

Content planning maintains a rolling seven-day queue. Queue Coverage counts
future days containing at least one approved, scheduled item: green at seven or
more days, yellow at three through six, red below three, and gray when no active
Campaign or no valid calculation exists. The warning threshold is configurable
and defaults to three days. Drafts do not count.

The Campaign Agent Runtime does not publish scheduled content. A separate
hosted scheduling dispatcher receives Meta webhooks, persists external events,
and publishes previously approved schedule items while localhost is offline.
For each scheduled item, explicit failure permits up to three retries after the
initial attempt. Before retrying an ambiguous result, the dispatcher reconciles
provider state to prevent duplicates. Exhausted work becomes `blocked` and
requires manual operator action.
