---
id: GM-021
title: Implement Slice 6 — one verified browser observation
status: open
labels:
  - wayfinder:implementation
  - tdd:vertical-slice
parent: GM-001
assignee:
blocked_by:
  - GM-017
---

# Implement Slice 6 — one verified browser observation

Start with one failing Browser Observation behaviour test. Carry one registered
Facebook or Reddit Placement through controllable due time, Email reminder,
approved read-only Recipe, screenshot, metric extraction, and visible operator
verification. Prove fail-closed mutation controls, honest missing values,
correction history, and blocked recovery.

## HITL acceptance decisions

- Use Resend as the first-release one-way Operator Alert email adapter.
- A verified BandAce sending domain and operator recipient are required before
  real email and browser-observation acceptance.
- Email carries no approval, retry, resume, or mutation authority.
