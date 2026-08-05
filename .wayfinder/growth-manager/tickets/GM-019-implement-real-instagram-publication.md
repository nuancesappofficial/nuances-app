---
id: GM-019
title: Implement Slice 4 — one real Instagram publication
status: open
labels:
  - wayfinder:implementation
  - tdd:vertical-slice
parent: GM-001
assignee:
blocked_by:
  - GM-018
---

# Implement Slice 4 — one real Instagram publication

Start with one failing dispatcher contract test and a fake Meta Adapter. Carry
one due schedule through lease, exact publication, webhook/reconciliation, and a
visible provider link without duplicate publication. After contract tests are
green, run one controlled acceptance against a designated Instagram Professional
test account.
