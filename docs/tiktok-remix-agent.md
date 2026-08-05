# TikTok Remix Agent

The TikTok Remix Agent converts one approved `tiktok_remix_agent` task into a
reviewable content draft. It does not browse autonomously, download source
media, edit video, publish, or spend money.

Its output contains:

- a source-discovery brief with transformation and credit rules;
- three English hook options;
- a 24-second beat sheet;
- a short real-app demonstration at the end;
- the campaign tracking link;
- `requires_publish_approval = true`.

The protected `approve_and_run_next` action is the task approval boundary. A
unique database constraint on `task_id` prevents duplicate drafts, and a failed
draft insert returns the task to `draft` so it can be retried.
