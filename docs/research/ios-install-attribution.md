# iOS install attribution and deferred Source Links

Checked against Apple documentation and primary vendor documentation on
2026-08-02. This note evaluates organic links placed in Instagram, Threads,
and Facebook Groups. Paid-ad attribution is mentioned only to rule out tools
that do not fit that use case.

## Decision summary

- **Apple Campaign Links are the cleanest first-release measurement baseline,**
  but they provide privacy-thresholded aggregate reporting, not a Source Link
  delivered to an individual app installation. Use one campaign token per
  Placement only where the expected volume can clear Apple's five-user
  threshold; otherwise aggregate at a coarser level.
- **A Universal Link does not carry context through an App Store install.** It
  opens the installed app, but opens the website when the app is absent. Apple
  does not later replay that URL when the newly installed app first launches.
- **A third-party deferred-deep-link/MMP SDK can attempt to restore a Source
  Link on first launch, but that result is vendor attribution, not an
  App-Store-certified download record.** Ordinary iOS matching can be
  probabilistic and is weakened by privacy protections. Clipboard-based flows
  can be deterministic, but add a user interaction/paste permission experience.
- **The current `first_app_opened` event is a first-launch proxy, not a
  download.** It can be joined to a Source Link only if the app obtains a valid
  deferred source from a chosen provider. It must remain separately labelled
  from App Store `First-Time Downloads`.
- **Recommended contract for the first decision:** use a Distribution Manager
  redirect/Source Link for click counts, append Apple's `pt`/`ct` campaign
  parameters for aggregate App Store reconciliation, and treat app-side
  first-open attribution as `unattributed` unless a separately approved DDL
  provider returns a source. Do not silently convert a probabilistic match into
  a deterministic fact.

## Three different facts called an “install”

| Measure | When it occurs | What it proves | Main limitation |
| --- | --- | --- | --- |
| App Store `First-Time Download` | Apple records a first download | A download in Apple's store accounting | Campaign output is aggregate and privacy-thresholded; it does not hand the app a per-user Source Link |
| Nuances `first_app_opened` | The instrumented installation launches for the first time | This installation reached first launch | It is not a store download and misses downloads that never launch; local storage reset/reinstall semantics can differ from Apple's accounting |
| MMP “install” | Usually SDK first session/launch | The vendor matched a first app session to a prior click under its model | May be deterministic or probabilistic; it is not Apple's download count |

Apple defines `Total Downloads` as First-Time Downloads plus Redownloads and
excludes iCloud restores and automatic downloads to other devices. Apple
attributes campaign First-Time Downloads when a first download occurs within
24 hours of a Campaign Link/token click. By contrast, AppsFlyer explicitly
defines its install timestamp as first launch and notes that app stores use the
download time. See Apple's [Acquisition metric definitions](https://developer.apple.com/help/app-store-connect-analytics/acquisition/acquisition/),
[Campaign Links rules](https://developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links/),
and AppsFlyer's [attribution model](https://support.appsflyer.com/hc/en-us/articles/207447053-AppsFlyer-attribution-model).

Nuances currently emits `first_app_opened` once according to local installation
storage and documents it as a Downloads proxy. Therefore the Distribution
Manager should expose separate fields such as `app_store_first_time_downloads`,
`first_launches`, and `attributed_first_launches`; it should never label all
three simply `downloads`.

## Apple-native capabilities

### Campaign Links and App Store Connect Analytics

An App Store Campaign Link has the form:

```text
https://apps.apple.com/app/apple-store/id123456789?pt=123456&ct=source-token&mt=8
```

Apple can associate impressions, product-page views, downloads, usage, sales,
and subscriptions with the campaign token. A first download within 24 hours of
the click is a campaign First-Time Download; where several campaign links were
clicked, the most recent eligible link receives credit for subsequent sales.
The campaign token accepts at most 30 characters. See Apple's [Campaign Links
documentation](https://developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links/).

Material reporting constraints:

- A campaign appears only after at least 24 hours and at least five individual
  users generated first-time downloads. Low-volume per-Placement links can
  therefore yield no campaign row even when clicks or downloads occurred.
- App Store Analytics detailed reports apply stronger privacy protections.
  Apple's Analytics Reports API is suitable for scheduled aggregate imports,
  not synchronous first-open lookup. Ongoing reports take roughly 24–48 hours
  for the first instance and daily data takes two days to be complete. See
  Apple's [Analytics Reports API overview](https://developer.apple.com/help/app-store-connect-analytics/overview/analytics-reports-api/).
- App usage metrics in App Store Connect are based on users who agreed to share
  analytics; download reporting and downstream usage reporting therefore do not
  necessarily have identical populations. See Apple's [Analytics dashboard
  notes](https://developer.apple.com/help/app-store-connect-analytics/overview/analytics-dashboard/).

Campaign Links are consequently good for **aggregate reconciliation** and do
not solve deferred Source Link recovery inside the app. The Distribution
Manager should retain its own `source_link_id` and redirect click log, while
mapping that ID to an Apple-compatible `ct` token or a deliberately coarser
campaign token.

### Universal Links

For an installed app, a Universal Link opens the app and supplies an
`NSUserActivity` containing the URL. If the app is not installed, iOS opens the
URL in the default browser so the website can handle it. Apple's documented
flow does not preserve the URL across an App Store install and deliver it on
first launch. See [Allowing apps and websites to link to your content](https://developer.apple.com/documentation/xcode/allowing-apps-and-websites-to-link-to-your-content/)
and [Supporting Universal Links](https://developer.apple.com/documentation/xcode/supporting-universal-links-in-your-app).

Universal Links should still be the direct-link path for already-installed
users. The Distribution Manager redirect needs a web fallback that sends an
uninstalled user to the App Store, but that fallback alone is not deferred deep
linking.

### AdServices and AdAttributionKit

`AdServices` retrieves attribution for **Apple Ads** campaigns and therefore
cannot identify organic Instagram, Threads, or Facebook Group placements. See
Apple's [AdServices overview](https://developer.apple.com/documentation/AdServices/).

AdAttributionKit is designed around registered ad networks, publisher apps
showing attributable ads, and privacy-preserving install/re-engagement
postbacks. It is not a generic organic-social redirect service and does not
return an arbitrary Facebook Group Source Link to the advertised app. Its
postbacks can arrive 24–48 hours after app launch, which also makes it unsuitable
for first-launch routing. See Apple's [Ad Attribution overview](https://developer.apple.com/app-store/ad-attribution/)
and [AdAttributionKit documentation](https://developer.apple.com/documentation/AdAttributionKit).

### App Clip as a larger alternative

An App Clip can receive an invocation URL before full installation and can save
state in a shared app-group container that the full app later reads. This can
create first-party continuity, but requires an App Clip target, an invocation
experience, and a different user journey; it is not a drop-in App Store Source
Link. See Apple's [Responding to invocations](https://developer.apple.com/documentation/AppClip/responding-to-invocations)
and [App Clip launch experience](https://developer.apple.com/documentation/appclip/configuring-the-launch-experience-of-your-app-clip).

## Third-party deferred deep-link options

### Comparison

| Option | Can return a Source Link after first install? | Installed-app path | Matching/privacy reality | Integration and commercial boundary |
| --- | --- | --- | --- | --- |
| Branch | Yes, through Branch links + iOS SDK; NativeLink can make the handoff deterministic | Branch Universal Link opens the app | Standard install matching may not be guaranteed after iOS privacy changes. NativeLink copies link data to pasteboard after an explicit CTA and iOS can show paste permission | Hosted Branch redirect, SDK, Associated Domains, vendor link schema. Current Intro plan is $39/month after trial with 500 links/month; Short Link API is not included |
| AppsFlyer OneLink | Yes, through OneLink + AppsFlyer SDK/UDL | OneLink Universal Link opens the app | Vendor attribution/deep-link result; AppsFlyer documents probabilistic attribution windows of at most 24 hours, while owned-media UDL data can remain available for non-consenting users | Hosted OneLink redirect, SDK, template/domain config. Standalone paid plans support DDL; the Zero plan does not |
| Adjust | Yes, through Adjust link + SDK deferred-deep-link callback | Adjust Universal Link/app scheme opens the app | Adjust's documented iOS test flow requires probabilistic modeling for this matching path; treat it as modeled unless the returned match method proves otherwise | Hosted Adjust link, SDK, link/domain config. Public docs describe the feature, but public fixed pricing was not found; obtain a quote/plan confirmation |
| Apple Campaign Link only | No | Separate Universal Link can open installed app; campaign link itself goes to App Store | Apple aggregate, thresholded result—not probabilistic app-side recovery | No third-party SDK; App Store Connect/API ingestion and Distribution Manager redirect only |

### Branch

Branch links can route installed users into the app and uninstalled users via
the App Store, then return link data to the SDK. Branch warns that post-iOS 14
install matches are usually not guaranteed unless the user permits IDFA
collection. For sensitive behavior it instructs apps to check
`+match_guaranteed`. See Branch's [attribution-method guidance](https://help.branch.io/developer-hub/docs/implement-attribution-methods).

Branch NativeLink instead presents a web CTA that copies the link to the
pasteboard, sends the person to the App Store, and reads the clipboard after
installation. Branch describes this as 100% matching without unique PII, but
iOS may display a paste permission prompt; denial or abandonment requires a
fallback to unattributed launch. See Branch's [NativeLink documentation](https://help.branch.io/developer-hub/docs/nativelink-deferred-deep-linking)
and [iOS integration details](https://help.branch.io/developer-hub/docs/ios-advanced-features).

Branch's currently documented Intro limits are 500 web links/QR codes and
25,000 tracked clicks per month for $39/month, with overages; it does not
include a Short Link API. That is a material constraint for one automatically
created link per Facebook Group Placement. See the [Branch Intro plan](https://help.branch.io/docs/branch-intro-plan).
Branch says identifiable activity logs are retained for no more than 14 days
(or up to 60 days for configured/specific fields), pseudonymized logs for up to
12 months, and aggregated reporting for up to 24 months. See its [Data
Retention Policy](https://help.branch.io/account-hub/docs/data-retention-policy).

### AppsFlyer OneLink

OneLink supports direct and deferred deep linking for owned-media journeys such
as social-to-app and returns deferred link data through the AppsFlyer SDK. Its
current Standalone Deep Linking Suite supports DDL on paid Standard, Advanced,
and Premium subscriptions; the Zero plan does not support DDL. See AppsFlyer's
[OneLink Standalone Deep Linking Suite](https://support.appsflyer.com/hc/en-us/articles/44703014449809-OneLink-Standalone-Deep-Linking-Suite)
and [OneLink setup](https://support.appsflyer.com/hc/en-us/articles/208874366-Create-deep-linking-and-redirection-links-for-your-campaigns-with-OneLink).

AppsFlyer says Unified Deep Linking data for paid and owned media remains
available for iOS 14.5+ users who do not consent, while other conversion-data
APIs can be restricted. That statement does not make every install match
deterministic: AppsFlyer's attribution model separately documents probabilistic
modeling with a 0–24 hour adaptive window. See its [iOS SDK integration guide](https://support.appsflyer.com/hc/en-us/articles/207032066-Basic-SDK-integration-guide)
and [attribution model](https://support.appsflyer.com/hc/en-us/articles/207447053-AppsFlyer-attribution-model).
User-level raw-data access is typically limited to 90 days when the plan
includes raw data, while aggregated data is retained up to 25 months. See
[AppsFlyer user-level data retention](https://support.appsflyer.com/hc/en-us/articles/360006091197-User-level-data-retention).

### Adjust

Adjust documents a deferred flow in which its hosted link records the click,
redirects to the App Store, the SDK sends first-session/attribution requests,
and a callback receives the deferred URL. See [Adjust deferred deep linking](https://dev.adjust.com/en/sdk/ios/features/deep-links/deferred/).
Its official iOS testing instructions require probabilistic modeling to be
enabled for this deferred matching scenario, so a recovered Placement must be
labelled as modeled rather than Apple-confirmed. See [Adjust deep-link testing](https://dev.adjust.com/en/sdk/ios/v4/features/deep-links/testing/).

Adjust provides configurable consent-expiry and user-data-retention controls,
with a documented maximum of 25 months; the publisher remains responsible for
obtaining legally required consent. See [Adjust data privacy](https://help.adjust.com/en/article/manage-data-collection-and-retention).

## Privacy, truthfulness, and consent contract

The app should store an attribution result with its provenance rather than only
a `campaign_id`:

```text
source_link_id
source_provider          # apple_aggregate | branch | appsflyer | adjust | none
match_method             # direct_link | deterministic_deferred | probabilistic | aggregate_only
matched_at
attribution_window
consent_state
provider_reference
```

Rules implied by the evidence:

1. Apple Campaign Link results must remain aggregate and must not be attached
   to a specific PostHog person merely because dates line up.
2. A probabilistic MMP result may drive aggregate optimization, but the UI must
   display it as modeled and must not claim that Apple verified the placement.
3. When privacy controls, Private Relay, paste denial, an expired window, or an
   SDK/network failure prevents recovery, first launch succeeds normally and
   attribution becomes `unattributed`; never guess from the most recent global
   click.
4. Direct Universal Links may deterministically carry `source_link_id` for an
   already-installed app, but that is re-engagement/direct-link attribution,
   not a new download.
5. Provider-specific IDs stay behind a Distribution Manager attribution
   adapter. The durable domain record uses the provider-neutral fields above,
   so changing MMP does not rewrite Campaign, Placement, or product-event data.

## Recommended decision path

For the current organic channels, start with a provider-neutral link service
owned by the Distribution Manager:

```text
Placement Source Link
  -> DM redirect records source_link_id + click
  -> installed: Universal Link opens Nuances with source_link_id
  -> not installed: redirect to App Store Campaign Link (pt + ct)
  -> App Store Connect imports aggregate downloads/sales/subscriptions later
```

This yields truthful click and aggregate-download reporting without an MMP.
It does **not** promise that a new install will recover `source_link_id`.

If per-first-launch Placement attribution proves necessary, run a separate
provider selection and proof on real iOS devices, including Instagram/Threads
in-app browsers and Facebook's browser. Evaluate Branch first because its
public low-volume pricing and deterministic NativeLink trade-off are explicit;
also compare AppsFlyer OneLink and Adjust quotes. Acceptance tests must cover
ATT denied, iCloud Private Relay, paste denied, click-window expiry, reinstall,
multiple Source Links, offline first launch, and provider outage before any
provider result is called reliable.
