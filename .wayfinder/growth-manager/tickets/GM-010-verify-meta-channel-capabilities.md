---
id: GM-010
title: Verify Meta channel capabilities and policy constraints
status: closed
labels:
  - wayfinder:research
parent: GM-001
assignee: meta-api-research-agent
blocked_by: []
---

# Verify Meta channel capabilities and policy constraints

## Question

Using only current official Meta documentation, which authenticated interfaces,
permissions, app-review requirements, webhooks, rate limits, publishing formats,
insight fields, and messaging rules support the proposed Instagram Content
Agent, Threads Engagement Agent, and Facebook Group Campaign Agent? In
particular, can a localhost integration observe configured comment keywords and
send one Campaign-specific private message per matching user after campaign-level
approval, and what product or policy constraints change that design?

Record findings in `docs/research/meta-growth-channel-capabilities.md` and link
the source for every material claim. Do not implement an integration.

## Resolution comment

Official Meta documentation confirms that Instagram Professional accounts can
publish owned media, receive comment webhooks, read insights, and send one
private reply to a qualifying owned-media comment within Meta's reply windows.
Threads supports publishing, public reply management, and insights, but not that
private-reply workflow. Meta removed the Facebook Groups API on 2024-04-22, so
an official adapter cannot publish Group posts, observe Group comments, or send
keyword-triggered DMs from them.

The operator chose a hybrid first release: automate Instagram and Threads via
official APIs; keep Facebook Groups as an Agent-authored, human-published,
human-observed Campaign. Keyword-Triggered DM belongs to Instagram owned media.
A localhost UI also needs narrowly scoped public webhook ingress and public
media URLs. Full evidence and first-party citations are in
[`docs/research/meta-growth-channel-capabilities.md`](../../../docs/research/meta-growth-channel-capabilities.md).
