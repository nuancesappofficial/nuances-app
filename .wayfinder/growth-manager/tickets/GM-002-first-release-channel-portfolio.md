---
id: GM-002
title: Choose the first-release channel portfolio and Campaign Agent roster
status: closed
labels:
  - wayfinder:grilling
parent: GM-001
assignee: codex
blocked_by: []
---

# Choose the first-release channel portfolio and Campaign Agent roster

## Question

Which owned-content, cold-messaging, and public-engagement channels must the
localhost release operate for real, and which specialist Campaign Agents own
them, so that platform integrations and realistic concurrency limits can be
specified without including paid advertising?

## Resolution comment

The first release operates three specialist Campaign Agents:

- **Instagram Content Agent** produces owned Instagram content, directs it to
  Campaign-specific App Store links, and owns Keyword-Triggered DM conversion
  on qualifying comments under Meta's reply rules.
- **Threads Engagement Agent** publishes original Threads content and performs
  public engagement.
- **Facebook Group Campaign Agent** prepares valuable group content, while the
  operator publishes it and returns observable evidence manually because Meta
  provides no official Facebook Groups API.

Each Campaign Agent may run at most three active Growth Campaigns concurrently;
additional work remains queued. Inbox support and unsolicited bulk cold DMs are
not part of this first-release roster. Reddit remains a later adapter rather
than a first-release channel.

The later official Meta capability research narrowed the approved automation:
Campaign-level keyword, DM-template, and daily-limit approval applies to
Instagram owned media, not Facebook Groups.
