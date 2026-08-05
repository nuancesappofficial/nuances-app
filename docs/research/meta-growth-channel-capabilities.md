# Meta growth channel capabilities

Checked against current first-party Meta documentation on 2026-08-02. Meta's
official Postman workspaces are treated as first-party API documentation. API
versions, metrics, and review rules can change; re-check the linked changelogs
before implementation.

## Decision summary

- **Instagram Content Agent is viable through the official API.** A connected
  Professional account can publish content, receive comment webhooks, inspect
  owned-media/account insights, and send one private reply to a qualifying
  comment under Meta's reply-window rules.
- **Threads Engagement Agent is viable through the official API.** It can
  publish text, image, video, and carousel posts, read/manage replies, and read
  media/profile insights. Threads does not provide the Instagram private-reply
  workflow described below.
- **Facebook Group Campaign Agent is not viable as an automated official-API
  integration.** Meta removed the Facebook Groups API and its associated
  permissions for every Graph API version on 2024-04-22. An official adapter
  therefore cannot publish to Groups, observe Group comments, or trigger DMs
  from those comments.
- The proposed keyword-triggered DM is technically supported **on owned
  Instagram Professional media**, not in Facebook Groups. Campaign-level
  approval, keyword matching, daily limits, and deduplication are product-side
  controls; Meta additionally enforces one initial private reply per comment
  and time-window restrictions.

## Instagram Content Agent

### Account, authentication, and review boundary

Instagram APIs support Professional accounts (Business or Creator), not
consumer accounts. Two login paths exist:

| Login path | Relevant scopes/permissions | Account relationship |
| --- | --- | --- |
| Instagram Login | `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`, `instagram_business_manage_insights` | Does not require a linked Facebook Page |
| Facebook Login | `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_insights`, `pages_read_engagement` (plus Page discovery/access permissions as needed) | Requires a Professional Instagram account linked to a Page |

Meta distinguishes **Standard Access** for professional accounts owned or
managed by the app owner and added in the App Dashboard from **Advanced
Access** when an app serves professional accounts it does not own or manage.
That means a single-owner localhost tool can initially operate under Standard
Access, while a future multi-customer product crosses an App Review/Advanced
Access boundary. See Meta's [official Instagram API collection and access
model](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-26e7999c-fc7e-44c8-8f71-ab2de8d35c32).

### Publishing

The API can create and publish Professional-account media. Supported workflows
include feed images, videos/Reels, and carousels; Stories are restricted to
Business accounts. Publishing is container-based: create/upload a media
container, wait until processing finishes where applicable, then publish it.
Remote image/video inputs must be reachable by Meta from a public server, so a
file that exists only on localhost is not a valid media URL. See Meta's
[content-publishing documentation](https://developers.facebook.com/docs/instagram-platform/content-publishing/)
and [official publishing examples](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-26e7999c-fc7e-44c8-8f71-ab2de8d35c32).

Do not hard-code an assumed posting allowance. Query the documented publishing
limit endpoint and handle Graph API usage headers/backoff at runtime; the
Campaign Agent's own daily cap should be below the live provider limit.

### Comments, webhooks, and keyword-triggered private replies

Meta's `comments` webhook includes the comment ID, commenter information,
comment text, and media ID. This gives the local application enough information
to apply a Campaign-specific keyword rule and deduplication rule. Meta also
supports querying comments, but recommends webhooks to avoid polling-related
rate pressure. See the official [comment webhook payload
reference](https://www.postman.com/meta/instagram/request/23987686-db99ce99-bf76-475c-8b76-718576c11cae),
[webhook subscription example](https://www.postman.com/meta/instagram/request/23987686-0223707a-7035-46a2-8015-1fdf7249278f),
and [comment moderation endpoints](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-26e7999c-fc7e-44c8-8f71-ab2de8d35c32).

The Private Replies endpoint supports an initial private message to a person
who comments on the app user's Professional post, Reel, Story, Live, or ad:

- only one initial private reply can be sent for the comment;
- it must be sent within seven days of an ordinary comment;
- a Live private reply must be sent while the broadcast is live;
- follow-up messages are allowed only after the recipient responds, and then
  within 24 hours of that response.

The initial reply uses the comment ID as the recipient reference. Depending on
the login path, it requires the business/basic and comment-management
permissions listed above; the integration must subscribe to `comments` (and
`live_comments` if needed). See Meta's [Private Replies official
reference](https://www.postman.com/meta/instagram/request/23987686-189d7215-22b3-403f-b2f5-a46c7e66a514).

Therefore, the proposed flow is valid only in this narrower form:

1. The owner approves a Campaign's media, keywords, reply template, tracked App
   Store URL, and daily product limit.
2. A public webhook endpoint receives an owned-media comment event.
3. The server verifies the webhook, associates the media with the Campaign,
   matches the keyword, and atomically deduplicates by comment/private-reply.
4. The server sends the one allowed private reply inside Meta's time window and
   records the provider IDs/result.

A browser UI can remain on localhost, but Meta must be able to reach the webhook
callback and any publishing media URLs over the internet. A tunnel or small
public webhook/media-ingest service is therefore required during local-only
operation; secrets and reply execution should remain server-side. Meta's
[official Webhooks guide](https://www.postman.com/meta/messenger-platform-api/folder/22794852-b5d97624-14d8-4e67-a2e4-529add49ca58)
also warns that deliveries can be retried and may arrive out of order, so event
handling must be idempotent and use webhook timestamps.

### Insights

Account insights include fields such as reach, profile views, follower count,
website clicks, accounts engaged, and total interactions. Media insights expose
metrics such as views/plays, reach, likes, comments, shares, saves, and
watch-time depending on media type. The adapter must retain provider-native
metric name, media type, period, and retrieval time rather than assuming every
metric exists for every post. See Meta's [account insights
reference](https://www.postman.com/meta/instagram/request/23987686-26e7999c-fc7e-44c8-8f71-ab2de8d35c32)
and [media insights reference](https://www.postman.com/meta/instagram/request/23987686-0089d9e0-6141-4f69-a967-9d4c1c277ec9).

Important limitations from the same official documentation: user metrics are
retained for up to 90 days; some account metrics require at least 100 followers;
media insights cover media owned by the Professional account; and some
aggregates exclude ads-driven data. Missing/unavailable insight data can be an
empty data set rather than numeric zero.

## Threads Engagement Agent

### Authentication and publishing

A Meta app configured for the Threads use case obtains user authorization for
`threads_basic` and `threads_content_publish`. Publishing supports text, image,
video, and carousel posts through `graph.threads.net`; non-text media uses
publicly reachable URLs. Threads also supports replies and controls over who can
reply. See Meta's [official Threads collection](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api)
and [posting examples](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api?entity=request-34203612-b4339073-a559-4e15-9ffe-974d6f0451ec).

Reading and managing replies requires the relevant
`threads_read_replies`/`threads_manage_replies` permissions. The integration can
read top-level and nested replies, publish replies, and hide/unhide replies, but
this is public reply management—not a private-message channel. See Meta's
[Threads reply-management documentation](https://developers.facebook.com/docs/threads/reply-management).

### Insights and limits

`threads_manage_insights` permits reading media and user insights. Media metrics
include `views`, `likes`, `replies`, `reposts`, `quotes`, and `shares`; the
official documentation marks some metrics as still in development. User metrics
include profile views, likes, top-level replies, reposts, quotes, follower count,
and follower demographics; demographics require at least 100 followers. See
Meta's [Threads Insights API](https://developers.facebook.com/docs/threads/insights).

Provider limits must stay adapter-owned and observable. The official reply
documentation currently states an API-published reply limit of 1,000 replies per
Threads profile in a rolling 24-hour window; the runtime should nevertheless
treat the live provider response/headers as authoritative rather than using
that number as the Campaign safety limit.

## Facebook Group Campaign Agent

Meta deprecated the Facebook Groups API, `publish_to_groups`,
`groups_access_member_info`, and the ability for Group admins to install apps on
a Group in Graph API v19.0; the removal applied to all API versions on
2024-04-22. See Meta's [Graph API v19 announcement](https://developers.facebook.com/blog/post/2024/01/23/introducing-facebook-graph-and-marketing-api-v19/)
and [v19 changelog](https://developers.facebook.com/docs/graph-api/changelog/version19.0).

Consequences for the current Wayfinder map:

- an official Meta adapter cannot publish posts into Facebook Groups;
- it cannot subscribe to/read Group comments to detect Campaign keywords;
- it cannot implement Group-comment-to-DM automation;
- Group work can only be modeled as a human-executed/externally observed
  Campaign, unless the destination explicitly accepts unsupported browser
  automation and its account/policy risk.

Browser automation must not be presented as a Meta API capability. The clean
first-release replacement is to move keyword-triggered private replies to
Instagram owned media and either remove Facebook Groups from automated scope or
keep it as an approval/checklist/manual evidence workflow.

## Architecture decisions this research supports

1. Model provider capabilities explicitly (`publish`, `comment_webhook`,
   `private_reply`, `insights`, `reply_management`) rather than giving every
   channel one uniform interface.
2. Separate a **Campaign safety limit** from a **provider-enforced limit** and
   persist rate-limit/backoff state per connected account.
3. Store external media/comment/message IDs and enforce an atomic idempotency key
   before sending a private reply.
4. Keep the localhost UI, but introduce a narrowly scoped public ingress for
   Meta webhooks and media fetches.
5. Do not include an automated Facebook Group adapter in the first-release
   roster under an official-API-only constraint.
