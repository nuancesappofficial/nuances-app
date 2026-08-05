# Content Creation Manager

The Content Creation Manager compares active content campaigns and writes an
auditable report plus approval-gated Draft Agent Tasks.

## Decision order

1. `collect_more_data`: views are below the configured comparison threshold.
2. `scale`: the campaign has Paying Users, or leads eligible campaigns by Card
   Creator conversion.
3. `iterate`: the campaign has engagement or Card Creators but trails the
   leader.
4. `stop`: the campaign reached the threshold with no engagement and no Card
   Creators.

Comparisons are lexicographic: Paying Users first, then Card Creator conversion,
then engagement rate, then views. The report records the exact snapshot and a
plain-language reason for every decision.

## Permission model

The manager may create only these draft actions:

- `create_more_variants`
- `create_revised_variant`

Every generated task has `requires_approval = true`. The manager cannot publish
content, send messages, change an advertising budget, or execute a task.

## Current data seam

The deployed function accepts only platform reach metrics (`views` and
`engagements`). It reads product conversions from PostHog by
`growth_campaign_id`:

- `card_creation_succeeded` becomes Card Creators.
- `subscription_started` becomes Paying Users.

Client input cannot override either conversion count. The PostHog personal API
key has only `query:read`, is limited to the Nuances project, and is stored in
the `POSTHOG_PERSONAL_API_KEY` Supabase secret.

Each run is stored in `growth_manager_runs`, each combined snapshot in
`growth_campaign_performance_snapshots`, and each proposed task in
`growth_agent_tasks`. A read-only `GET` returns recent reports for review.

## Deployment note

Deploy Supabase functions sequentially. Concurrent CLI deploys can race: one
command may report success while its function is absent from the remote list.
