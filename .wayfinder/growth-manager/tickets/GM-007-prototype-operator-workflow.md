---
id: GM-007
title: Prototype and approve the four-screen operator workflow
status: closed
labels:
  - wayfinder:prototype
parent: GM-001
assignee: codex
blocked_by:
  - GM-004
  - GM-005
  - GM-006
---

# Prototype and approve the four-screen operator workflow

## Question

How should Overview, Campaign Detail, Agent Workspace, and Approval Center work
as one high-fidelity desktop flow so the operator can see what needs attention,
understand progress and evidence, talk directly to an Agent, and approve or stop
work without confusing Campaign Status with Agent Task Status?

## Resolution comment

The operator selected **A — Command Center** from three structurally different
interactive variants. The production UI should lead with the selected Project
Workspace, key comparable outcomes, Queue Coverage, active Campaigns, and a
dedicated attention rail that places approvals, blocked work, degraded
connectors, and low coverage above routine activity.

Primary navigation keeps four explicit surfaces: Overview, Campaign Detail,
Agent Workspace, and Approval Center. Campaign Status, Agent Task Status,
connector health, Metric State, and Queue Coverage use both text/icon cues and
color. Overview is the decision surface; detailed evidence stays one level down
rather than filling the home view.

Campaign Detail combines outcome metrics, Placement-level performance,
comparability state, Queue Coverage, and an auditable timeline. Agent Workspace
keeps Campaign-scoped conversation and working state together while preserving
direct operator intervention. Approval Center supports a weekly batch gesture
while showing independent immutable Approval Records and exact content versions.

The dark cross-project portfolio and the conversation-first three-pane layout
were not selected as the primary shell. Their validated ideas remain available
inside Command Center: cross-project switching/summary and direct hierarchical
Agent workspaces, respectively.

The throwaway primary-source prototype remains at
[`prototypes/operator-workflow/`](../prototypes/operator-workflow/README.md),
with variants selected through `?variant=A|B|C`. It contains fixture data and no
real integrations or mutations. It must be rewritten through the agreed public
interfaces during implementation rather than promoted directly.
