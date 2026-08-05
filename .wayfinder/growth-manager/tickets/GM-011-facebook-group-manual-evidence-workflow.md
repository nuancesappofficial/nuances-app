---
id: GM-011
title: Decide the Facebook Group manual evidence workflow
status: closed
labels:
  - wayfinder:grilling
parent: GM-001
assignee: codex
blocked_by:
  - GM-010
---

# Decide the Facebook Group manual evidence workflow

## Question

What exact draft package, approval state, operator checklist, posting evidence,
comment or outcome capture, attribution link, reminder, and completion rule let
the Facebook Group Campaign Agent manage a truthful Campaign without claiming
that unavailable official automation occurred?

## Resolution comment

For every Facebook Group Placement, the Facebook Group Campaign Agent produces
a Posting Package containing the recommended Group and reason, approved copy and
media, Group-rule check, unique Source Link, suggested publication time, and
required evidence fields. The operator publishes manually.

Immediately after publishing, the operator records the Facebook post URL,
screenshot, actual publication time, publishing account, Group name, and a
confirmation that the approved version was used. Once uploaded, the Facebook
page may be closed; the Placement enters `observing` rather than `completed`.

Every actual Placement receives a unique, automatically generated Source Link,
even when the same Content Variant is published to several Groups. Source Links
sit below Campaign and Content Variant, are collapsed from the default UI, and
may be archived without deleting attribution history. This lets Distribution
Manager compare clicks, App Store visits, first opens, Freemium Users, and Paying
Users by Group and post while retaining Campaign-level rollups.

A local Browser Observation Agent uses an operator-authenticated browser session
to open the recorded post read-only and capture screenshots at 12 hours, 24
hours, 7 days, and 30 days after publication. It extracts visible Facebook
reactions and comments into numeric snapshots and retains the screenshot and
actual observation time as evidence. It never posts, replies, reacts, or sends a
message. If localhost is offline at the target time, the observation remains
queued and runs when available with lateness recorded. It never invents an
unavailable metric.

The Placement becomes `completed` after the 30-day observation. A deleted post,
lost permission, expired session, or UI/extraction failure becomes `blocked` and
requires operator action. The operator may stop future observations early while
preserving every existing Source Link, snapshot, and screenshot.

This is explicitly human-executed publishing plus unsupported-by-API browser
observation, not a Facebook Groups API integration. The separate Browser
Observation Agent contract must bound session access, read-only enforcement,
evidence extraction, lateness, and recovery before implementation.
