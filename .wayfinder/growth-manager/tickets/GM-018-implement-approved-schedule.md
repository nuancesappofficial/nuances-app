---
id: GM-018
title: Implement Slice 3 — approved schedule and Queue Coverage
status: open
labels:
  - wayfinder:implementation
  - tdd:vertical-slice
parent: GM-001
assignee:
blocked_by:
  - GM-017
---

# Implement Slice 3 — approved schedule and Queue Coverage

Start with one failing Action Execution behaviour test. Carry one Instagram
draft through exact operator approval into a durable hosted schedule and visible
Queue Coverage. Prove edits invalidate approval, restart preserves schedules,
and drafts or unapproved actions never increase coverage. Stop at `scheduled`.
