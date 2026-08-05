# Learning Cards

This context describes the learning content presented on a card and the language
used when that content must share limited card space.

## Language

**Card Section**:
A named portion of a learning card that owns a fixed share of the card's visible
space while collapsed.
_Avoid_: Block, panel

**Collapsed Allocation**:
The maximum visible share reserved for a Card Section before its excess content
is folded.
_Avoid_: Minimum height, default height

**Expanded Section**:
A Card Section whose full content is available through animated expansion and
vertical scrolling.
_Avoid_: Full mode, open block

**Learning Term**:
The smallest reusable English word or established English expression that
preserves the meaning the learner encountered in context.
An incomplete grammatical fragment, such as a verb followed only by a
determiner, is not a Learning Term.
_Avoid_: Target token, card title

**Selected Span**:
The exact source-language text selected by the learner for card creation. It is
evidence for resolving the Learning Term, not necessarily the final Learning
Term itself.
_Avoid_: Learning Term, canonical subject

**Lemma**:
The reusable single-word dictionary form appropriate to the Selected Span's
part of speech in context. Phrase resolution is considered only when the Lemma
does not preserve the encountered meaning.
_Avoid_: Stem, mechanically stripped word

**Collocation**:
A reusable multi-word usage pattern built around a Learning Term whose meaning
does not require replacing that Learning Term with the whole pattern.
_Avoid_: Phrase, example

**Complete Learning Card**:
A learning card whose generated learning content includes at least one valid
Collocation paired with a complete example sentence. A card with both fields
empty is incomplete and must not be persisted as successfully generated.
_Avoid_: Partial card, empty enrichment

**Reference Pronunciation**:
A curated natural-voice recording tied to a specific Learning Card. Every
pronunciation entry point for that card uses the same recording, including card
details and quizzes.
_Avoid_: Device voice, generated fallback

# First-Run Journey

**Onboarding**:
The required setup questions that establish a new learner's language and
learning preferences.

**Video Tour**:
The full-screen instructional video sequence shown immediately after
Onboarding.

**Tutorial**:
The interactive in-app spotlight walkthrough shown after the Video Tour. It
starts on the Cache screen.

**Offline Tutorial Bundle**:
The complete set of Video Tour media and Tutorial demo content shipped inside
the installed app. It includes the `nuances` image, localized learning-card
content, phonetic transcription, reference pronunciation, and all instructional
videos. Viewing or completing the first-run journey must not require an asset
download, dynamic code bundle, cloud AI request, or network fallback.

The required first-run order is:
`Onboarding → Video Tour → Tutorial → App`.

**Greeting**:
The “Now it’s your turn” choice shown immediately after Tutorial completion,
offering Upload or the iOS Share Sheet.

**Starter Allowance**:
The lifetime allowance of 20 AI-generated cards available to a non-Premium
learner. The next cloud AI request opens the Paywall.

**Downloads**:
The number of first-time app downloads.

**Freemium Users**:
Learners who have not paid and can use the 20-card Starter Allowance. They can
be grouped by the percentage of that allowance already used.

**Paying Users**:
Learners with a paid subscription. They are grouped by weekly, monthly, or
yearly billing plan.

**Shared Pronunciation Quota**:
The pronunciation-assessment allowance shared by Pronunciation Coach and Quiz.
For a non-Premium learner it remains available while the Starter Allowance is
active; both entry points consume the same daily allowance.

**Ghost Preview Page**:
The progressively assembled card for one Learning Term during a multi-card
creation run. When creation advances to the next Ghost Preview Page, the
incoming card is aligned to the viewport rather than left partially clipped.

**Optimistic Card Save**:
The local durable save that begins as soon as a generated card appears. Cloud
sync continues in the background and does not require a separate save action.

**Creation Done Action**:
The action shown after all requested cards have appeared. It returns the learner
to the app; it does not initiate card persistence.

# Notifications

**Retired Notification**:
A previously supported reminder that must no longer be delivered, including
copies already scheduled on a learner's device.

**Scanned Word**:
A word detected from an image and presented to the learner for selection or
correction.
_Avoid_: OCR block, OCR token

# Growth Operations

**Distribution Manager**:
The single-operator system that compares and coordinates distribution work
across multiple products. It owns the cross-project control plane and delegates
Project-specific execution to Growth Managers and Campaign Agents.
_Avoid_: Nuances admin, Growth Manager

**Project Workspace**:
The isolated Distribution Manager scope for one distributed product, including
its Campaigns, Agents, connectors, dashboards, approvals, schedules, memory, and
secret references.
_Avoid_: Dashboard, repository

**Operations Runbook**:
The maintained diagnostic and recovery guide that lets a new IT Agent operate
Distribution Manager without prior conversation history. It contains procedures
and safe evidence lookup, never plaintext credentials.
_Avoid_: README, Agent memory

**Growth Manager**:
The manager responsible for comparing all growth approaches and prioritizing
them by Paying Users, Freemium User quota usage, and Downloads.

**Content Creation Manager**:
The manager responsible for content published through Nuances-owned accounts
across different platforms.

**Cold Messaging Manager**:
The manager responsible for private one-to-one outreach across different
platforms.

**Engagement Manager**:
The manager responsible for public participation across platforms, including
replies, comments, answers, and original posts.

**Growth Campaign**:
A single trackable distribution experiment owned by one growth manager and run
through one platform and one method. Its Campaign ID remains unchanged from
draft through completion so product outcomes can be attributed consistently.

**Campaign ID**:
The unique, human-readable identifier assigned to a Growth Campaign. It is the
value carried by campaign links and recorded with product analytics events.
_Avoid_: Tracking code, UTM ID

**Campaign Registry**:
The authoritative catalog of Growth Campaigns. It assigns Campaign IDs,
produces campaign links, records lifecycle state, and supplies campaigns to the
Growth Manager for comparison.

**Campaign Agent**:
The sub-agent responsible for executing one or more Growth Campaigns under a
manager. Every Growth Campaign names exactly one Campaign Agent so the Growth
Manager can assign follow-up work to the correct operator.
_Avoid_: Growth Manager, channel

**Campaign Status**:
The lifecycle state of a Growth Campaign: draft, active, paused, completed, or
archived. Creating a campaign does not publish content; new campaigns begin as
drafts.

**Campaign Performance Snapshot**:
The versioned Distribution, Platform Performance, or Product Outcome observation
for one Growth Campaign and reporting window. It records its metric definition,
grain, provider, value or Metric State, retrieval time, and provenance. It is an
input to a Manager Decision, not a permanent claim about Campaign quality.

**Metric Comparability**:
The evidence that two metric observations share compatible definitions, grain,
and time windows and may therefore participate in the same comparison. Missing
or incompatible observations are excluded with a reason rather than treated as
zero.
_Avoid_: normalized score, available field

**Metric State**:
The meaning of a non-numeric observation: unavailable, pending, suppressed,
stale, or error. Numeric zero is reserved for a provider-confirmed zero.
_Avoid_: null, no data

**Manager Decision**:
The next action selected after comparing eligible campaigns: collect more data,
scale, iterate, or stop. Every decision includes the observed metrics and a
plain-language reason that can be checked by a person.

**Draft Agent Task**:
A proposed unit of campaign work assigned by a manager to one Campaign Agent.
It cannot publish content, send a message, or spend money until a separate
permission-gated action approves execution.

**Campaign Agent Runtime**:
The provider-neutral operator of persistent Campaign Agents. It resumes an
agent, carries messages and progress, invokes permitted tools, and controls
pause, retry, and cancellation without making a model provider the owner of
campaign history or permissions.
_Avoid_: DeepSeek Agent, Codex Task

**Agent Task Status**:
The execution condition of one Campaign Agent task, distinct from Campaign
Status. It communicates whether work is queued, running, waiting for approval,
blocked, failed, cancelled, or complete.
_Avoid_: Campaign Status, agent presence

**Agent Workspace**:
The operator view for one Campaign Agent's persistent conversation, current
work, assigned Growth Campaigns, and recent execution history.
_Avoid_: Chat window, Campaign Detail

**Queue Coverage**:
The number of future calendar days for which an active Growth Campaign has at
least one approved and scheduled content item. Draft content does not increase
coverage.
_Avoid_: Draft count, queue length

**Agent Memory Summary**:
An operator-approved, dated record of decisions, outcomes, reasons, and evidence
pointers extracted from an Agent Workspace before an old raw conversation is
deleted. Performance time series remain in numeric snapshots rather than being
copied into this record.
_Avoid_: Transcript, analytics snapshot

**Hosted Scheduling Dispatcher**:
The always-available module that receives provider events and publishes only
previously approved scheduled content while the localhost Growth Manager is
offline. It executes durable instructions; it does not make campaign or content
decisions.
_Avoid_: Campaign Agent Runtime, Growth Manager

**Operator Alert**:
A deduplicated, one-way email emitted when hosted execution needs attention or
Queue Coverage crosses its warning threshold. It may link to the localhost UI
but carries no authority to approve, retry, reschedule, or change campaign state.
_Avoid_: command email, approval message

**Approval Center**:
The operator view that gathers proposed external actions and the evidence needed
to approve or reject each action. Approval is explicit and auditable; viewing a
proposal does not approve it.
_Avoid_: Task queue, inbox

**Approval Record**:
The immutable evidence that an operator approved, rejected, or revoked one exact
version of an external action. It binds the action to its Campaign, provider
account, content, schedule or validity window, and execution result. Editing an
action creates a new record rather than changing its history.
_Avoid_: Permission flag, task status

**Approval Policy**:
A versioned rule limiting what an Approval Record may authorize, including
duration, retry window, daily limit, and actions that always require review.
Changing a policy does not silently change existing Approval Records.
_Avoid_: Agent prompt, platform limit

**Community Conversion Campaign**:
A Growth Campaign that publishes useful content inside an interest-based online
community and converts explicit responses into attributable visits to the app.
It is public engagement followed by a configured conversion action, not
unsolicited bulk outreach.
_Avoid_: Cold messaging, group spam

Its execution may be automated through an official platform interface or
human-executed from an Agent-prepared package. A human-executed Campaign records
operator evidence rather than representing manual work as automated progress.

**Posting Package**:
The approved copy, media, target-community rationale, rule check, Source Link,
timing, and evidence checklist prepared for a human-executed Placement.
_Avoid_: Content draft, scheduled post

**Placement**:
One actual publication of a Content Variant to one account or community. Each
Placement has its own Source Link, evidence, observation schedule, and outcome
snapshots while rolling up to its Growth Campaign.
_Avoid_: Campaign, platform

**Source Link**:
The unique attributable distribution link assigned to one Placement. It may be
archived without deleting historical attribution.
_Avoid_: Campaign ID, generic App Store link

**First-Time Downloads**:
Apple's aggregate count of first downloads from App Store reporting. It is not
the same fact as an instrumented installation's first launch.
_Avoid_: First Launches, attributed installs

**First Launches**:
The count of installations that emitted the app's first-open event. It is a
product-analytics observation rather than App Store download accounting.
_Avoid_: First-Time Downloads

**Attributed First Launch**:
A First Launch accompanied by a Source Link and explicit attribution provenance.
Without proven provenance, a First Launch remains unattributed rather than being
guessed from time, network address, or another user's click.
_Avoid_: Apple-confirmed download, modeled install

**Browser Observation Agent**:
The local, read-only Agent that uses an operator-authenticated browser session to
capture dated visual evidence and extract visible metrics for a Placement whose
platform provides no official interface. It cannot publish, reply, react, or
message.
_Avoid_: Platform adapter, Campaign Agent

**Observation Recipe**:
An operator-approved, versioned description of how the Browser Observation Agent
may identify one platform's Placement, disclose hidden read-only content, and
extract clearly labelled metrics. Every observation records its Recipe version;
an Agent may propose a changed Recipe but cannot activate it.
_Avoid_: browser script, selector list

**Observation Target**:
One intended evidence-capture time for a Placement, such as 12 hours, 24 hours,
7 days, or 30 days after publication. Its target time remains distinct from the
actual observation time; a missed Target is recorded rather than reconstructed
from a later snapshot.
_Avoid_: snapshot, scheduled post

**Keyword-Triggered DM**:
A private campaign message sent once to a community participant after their
public response matches a Campaign's pre-approved keyword rule. The keyword,
message template, daily limit, and tracking link belong to that Campaign.
In the first-release Meta portfolio this term applies to qualifying comments on
owned Instagram Professional media, not Facebook Groups.
_Avoid_: Auto-reply, cold DM
