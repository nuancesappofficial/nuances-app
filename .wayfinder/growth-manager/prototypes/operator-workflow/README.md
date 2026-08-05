# PROTOTYPE — Distribution Manager operator workflow

Question: which information hierarchy should unify Overview, Campaign Detail,
Agent Workspace, and Approval Center for a multi-project Distribution Manager?

This is throwaway UI code with in-memory fixture data. It does not connect to
Supabase, DeepSeek, Meta, PostHog, Apple, or any real mutation.

Run from the repository root:

```bash
python3 -m http.server 4173 --directory .wayfinder/growth-manager/prototypes/operator-workflow
```

Open `http://127.0.0.1:4173/?variant=A`. Use the bottom switcher or left/right
arrow keys to compare:

- A — Command Center
- B — Agent Workspaces
- C — Project Portfolio

