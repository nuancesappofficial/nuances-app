---
id: GM-015
title: Research iOS install attribution and deferred Source Links
status: closed
labels:
  - wayfinder:research
parent: GM-001
assignee: ios-attribution-research-agent
blocked_by: []
---

# Research iOS install attribution and deferred Source Links

## Question

Using current first-party Apple documentation and primary vendor documentation,
what can App Store campaign links, App Analytics, AdServices, Universal Links,
and reputable deferred deep-link or mobile-measurement providers truthfully
attribute for organic Instagram, Threads, and Facebook Group Placements? Compare
whether a unique Source Link can survive first installation and become available
inside the app, privacy and consent effects, data latency and retention, required
SDK or hosted redirect work, pricing or plan constraints, vendor lock-in, and
fallback behaviour. Clearly distinguish App Store-reported Downloads from the
app's `first_app_opened` proxy and from probabilistic attribution.

Record findings with a direct source for every material claim in
`docs/research/ios-install-attribution.md`. Do not implement or configure a
provider.

## Resolution comment

Apple Campaign Links provide privacy-thresholded aggregate attribution for
First-Time Downloads and downstream App Store measures, but they do not return a
Source Link to the app after first installation. Universal Links preserve a
Source Link only when the app is already installed. AdServices and
AdAttributionKit do not solve this organic-social use case.

Branch, AppsFlyer OneLink, and Adjust can provide deferred deep linking through
their hosted links and SDKs, but ordinary iOS matching may be probabilistic and
must not be presented as Apple-certified or deterministic. Branch NativeLink can
use an explicit web CTA and clipboard handoff for deterministic continuity, with
a paste-permission user experience and commercial/link-volume constraints.

The truthful baseline is a Distribution Manager Source Link and redirect that
records clicks, opens an installed app through a Universal Link, otherwise adds
Apple `pt` and `ct` parameters before App Store redirect, and later reconciles
aggregate Apple reports. `app_store_first_time_downloads`, `first_launches`, and
`attributed_first_launches` remain separate measures. A new install is
`unattributed` unless a separately approved deferred-link provider returns a
source with provenance and match method.

Full comparisons, privacy rules, primary-source citations, and recommended real
device proof cases are in
[`docs/research/ios-install-attribution.md`](../../../docs/research/ios-install-attribution.md).
