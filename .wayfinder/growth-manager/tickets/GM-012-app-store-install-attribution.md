---
id: GM-012
title: Decide the App Store install attribution contract
status: closed
labels:
  - wayfinder:grilling
parent: GM-001
assignee: codex
blocked_by:
  - GM-003
  - GM-015
---

# Decide the App Store install attribution contract

## Question

What operator-visible Campaign link, redirect, privacy rule, fallback, and
attribution window can send a new visitor to the iOS App Store and truthfully
restore the Campaign ID after first install, while preserving direct deep links
for already-installed users and distinguishing App Store Downloads from the
`first_app_opened` proxy?

## Resolution comment

The first release uses an Apple-native baseline behind a provider-neutral
Attribution Adapter and does not include Branch, AppsFlyer, Adjust, or another
MMP. Every Placement retains a unique Distribution Manager Source Link. Its
redirect records an anonymous click, then uses a Universal Link to open an
already-installed app with `source_link_id`; when the app is absent, it redirects
to an App Store Campaign Link carrying Apple `pt` and `ct` parameters.

Redirect logging, attribution import, or provider failure must never prevent the
visitor from reaching the App Store. The redirect does not create a person
profile. The system does not infer an installation from IP address, timestamps,
or a globally recent click. A first launch remains `unattributed` unless a
deterministic direct link or a separately approved future provider supplies
truthful provenance.

The Dashboard displays separate facts:

- **Source Link Clicks** from Distribution Manager redirects;
- **App Store First-Time Downloads** from Apple's aggregate reporting;
- **First Launches** from the app's `first_app_opened` event;
- **Attributed First Launches** only where the source is proven; and
- **Unattributed First Launches** for the remainder.

Apple privacy-threshold suppression or delayed absence is shown as data
unavailable/insufficient, not numeric zero. App Store First-Time Downloads are
never silently converted into First Launches or allocated to individual users.

Distribution Manager Source Links always remain Placement-grained. Apple `ct`
tokens default to Growth Campaign grain because Apple reporting requires enough
first-time users before a campaign appears. A Campaign may deliberately use
Placement-grained Apple tokens only where sufficient volume is expected. The UI
shows the Apple reporting grain, and Campaign-level Apple totals are never
invented into Placement allocations.

Any future MMP must satisfy a separate real-device proof and preserve
`source_provider`, `match_method`, attribution window, consent state, and
provider reference. A probabilistic match must remain visibly modeled rather
than being called Apple-confirmed.
