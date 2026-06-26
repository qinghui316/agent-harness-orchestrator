# Post Orchestration Map Window Harness Evolution Proposal

## Window

Pending window:

- `harness/changes/archive/20260626-auto-evolve-post-transcript-window/summary.md`
- `harness/changes/archive/20260626-workbench-transcript-one-time-pressure-acceptance-v1/summary.md`
- `harness/changes/archive/20260626-workbench-cursor-incremental-transcript-projection-v2/summary.md`
- `harness/changes/archive/20260626-workbench-rudder-style-agent-orchestration-map-v1/summary.md`
- `harness/changes/archive/20260626-workbench-orchestration-map-real-ui-and-collapsible-confirmation-rail-v1/summary.md`

## Recommendation

Decision: `docs_merge`.

No durable ECL rule, review-template field, lint/script change, product runtime
change, or Workbench capability is justified. The window repeats existing
rules and exposes only current-handoff drift.

## Repeated Lessons

- Long transcript optimization must keep workflow truth separate from
  interaction/projection storage. SQLite message paging, virtual rendering,
  long-message folding, and `@chenglou/pretext` measurement remain UI /
  projection mechanisms, not workflow authority.
- Large pressure acceptance should use synthetic temporary E-drive data, avoid
  Codex token spending, avoid durable large fixtures, and keep only compact
  results in archive summaries.
- Workbench visual surfaces such as `Agent 编排图` and the collapsed
  confirmation rail are projections/UI shell. They do not execute actions and
  do not replace `confirmationQueue.primary`.
- Product-visible UI changes need deterministic DOM coverage and real browser
  evidence when feasible. Exact screenshot paths, run ids, ports, and sandbox
  setup details should remain archive-only.
- Current handoff docs must agree on pending/latest Harness evolution state.

## Experience Retention Scan

- `Promote`: none. Existing ECL sections already cover Workbench user-surface
  honesty, transcript source-boundary, read-model projection coverage, runtime
  bridge boundaries, documentation entropy, Experience Lifecycle, and close /
  handoff drift.
- `Retain`: compact current baseline that Workbench transcripts now use
  cursor-incremental paging and virtual rendering, and that orchestration
  graph / rail UI are projection-only surfaces.
- `Merge`: align `AGENTS.md`, `docs/STATUS.md`, and
  `docs/CURRENT-DEVELOPMENT-PLAN.md` so pending/current Harness evolution and
  latest product pointers no longer contradict each other.
- `Retire`: stale lower-section references that still frame older
  mode-aware-loop work as the latest product/current Harness evolution
  context.
- `Archive-only`: exact pressure timings, payload sizes, E-drive paths,
  screenshots, ports, run ids, sandbox setup details, and the first graph
  acceptance gap.

## Independent Review

Subagent: `Aquinas`.

Recommendation: `docs_merge`, score `86/100`.

Key rationale: the transcript pressure and V2 evidence is strong but
product-specific; it does not require a new general Harness invariant. The
orchestration map and collapsed rail evidence fits existing Workbench
user-surface honesty and projection authority rules. The only justified delta
is compact current-doc alignment.

## Validation Plan

- Align current handoff docs.
- Run `lint-ecl`, `lint-encoding`, `harness-change reindex/status`, and
  `harness-evolve check`.
- Run `harness-evolve mark-complete` so `pending.md` is removed and
  `results.tsv` / `state.json` advance.
- Close the structured evolution change and git settle.
