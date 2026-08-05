# Local Markdown tracker

Each effort lives in its own directory. `map.md` is the parent issue and files
under `tickets/` are its child issues.

Issue metadata is stored in YAML front matter:

- `id`: stable local issue identity
- `status`: `open` or `closed`
- `labels`: tracker labels
- `parent`: parent issue id for child issues
- `assignee`: blank means unclaimed
- `blocked_by`: issue ids that must close before this issue reaches the frontier

For this tracker, `blocked_by` is the fallback dependency convention. The
frontier is every open, unassigned child whose `blocked_by` issues are closed.

