# Growth Campaign Registry

The Campaign Registry is the source of truth for distribution experiments. It
creates draft campaigns, assigns collision-safe Campaign IDs, produces Nuances
tracking links, and lets the Growth Manager list campaigns by manager or status.

## Agent interface

Agents use the repository command instead of reading credentials or assembling
URLs themselves:

```bash
npm run growth:campaigns -- register \
  --name "TikTok Remix Pilot 002" \
  --owner-agent tiktok_remix_agent \
  --manager content_creation \
  --platform tiktok \
  --method remix
```

The Growth Manager can list work waiting in the registry:

```bash
npm run growth:campaigns -- list \
  --manager content_creation \
  --status draft
```

Activation is an explicit operator action; registration never activates a
campaign automatically:

```bash
npm run growth:campaigns -- activate \
  --campaign-id content_creation-tiktok-remix-20260802-example
```

## Safety rule

Registration only creates a `draft`. It does not post content, send a message,
spend money, or activate an advertising campaign. Those actions require their
own permission-gated modules.

## Canonical managers

- `content_creation`
- `cold_messaging`
- `engaging`

The registry normalizes platform, method, and Campaign Agent names to lowercase
snake case before persistence. The Growth Campaign itself remains the stable
join between the registry and PostHog through `growth_campaign_id`.
