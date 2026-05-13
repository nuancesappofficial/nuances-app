# Runtime Loop Guard

This note exists because `Maximum update depth exceeded` can appear when React
state is used to track unstable animated objects or callback identities.

## Rules

- Do not put unstable animation objects, such as React Navigation card progress
  nodes, in a `useEffect` dependency if that effect updates React state.
- Do not use React state version counters to track per-render animated node
  identity. Prefer stable booleans, refs, or a native/Reanimated-only binding.
- Props-to-local-state sync must be guarded:
  `setValue((prev) => (prev === next ? prev : next))`.
- Modal dismiss/open chains should not depend on inline callbacks whose identity
  changes every parent render. Store callbacks in refs when an animation callback
  needs the latest value.

## Recent Incident

`withNavBarSync` previously read `useCardAnimation().current.progress` and sent
that animated node into context. The context setter bumped React state whenever
the node reference changed. Because that node can be unstable across renders,
the loop became:

`render -> new progress reference -> effect -> setState -> render`

The emergency fix is to hide the tab bar with a stable boolean while second-layer
screens are mounted, and restore it on unmount. If gesture-perfect tab bar sync
returns later, it must not use React state to mirror animated node identity.
