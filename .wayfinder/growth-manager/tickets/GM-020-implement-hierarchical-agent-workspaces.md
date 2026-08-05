---
id: GM-020
title: Implement Slice 5 — hierarchical Agent Workspaces
status: open
labels:
  - wayfinder:implementation
  - tdd:vertical-slice
parent: GM-001
assignee:
blocked_by:
  - GM-017
---

# Implement Slice 5 — hierarchical Agent Workspaces

Start with one failing Campaign Agent Runtime behaviour test. Carry one Manager
delegation into a specialist Workspace, stream progress upward, and let the
operator message the specialist directly. Prove independent memory, restart
persistence, task ownership, and that conversation grants no external-action
authority.
