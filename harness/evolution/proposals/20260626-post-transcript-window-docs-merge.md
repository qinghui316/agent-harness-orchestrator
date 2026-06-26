# Post Transcript Window Harness Evolution Proposal

## Window

Pending window:

- `harness/changes/archive/20260626-auto-evolve-post-mode-aware-loop-window/summary.md`
- `harness/changes/archive/20260626-workbench-mode-aware-local-goal-loop-real-ui-acceptance-v1/summary.md`
- `harness/changes/archive/20260626-workbench-local-loop-scheduler-handoff-boundary-scout-v1/summary.md`
- `harness/changes/archive/20260626-workbench-local-scheduler-terminal-path-real-ui-scout-v1/summary.md`
- `harness/changes/archive/20260626-workbench-paged-virtual-transcript-with-pretext-v1/summary.md`

## Recommendation

Decision: `docs_merge`.

No new ECL rule, review-template field, lint rule, product runtime behavior, or
Workbench capability is justified. The window repeats current rules rather than
exposing an uncovered process gap.

## Repeated Lessons

- `请求批准` waits on the real current gate; scoped `完全访问权限` applies only
  after human plan confirmation and only inside the selected Change.
- Raw scheduler actions, manual IntegrationCheck, integration apply/discard,
  PR, remote, merge, and Harness evolution remain outside full-access
  automation.
- Scheduler work is bounded same-Change execution, not a full parallel
  executor, slot allocator, or child-Change system.
- Workbench primary surfaces must prefer fresh concrete local gates/blockers
  over stale scheduler, audit, PR/provider, or history context.
- Transcript performance improvements must preserve canonical transcript
  source-boundary behavior. `@chenglou/pretext` is a height-measurement helper,
  not a renderer or workflow authority.
- Real UI run ids, E-drive paths, patch hashes, ports, and detailed gate
  sequences belong in archived summaries, not current handoff docs.

## Experience Retention Scan

- `Promote`: none. Current ECL sections already cover scoped authorization,
  human gates, scheduler boundedness, source safety, Workbench honesty,
  transcript source-boundary coverage, module boundaries, and documentation
  entropy.
- `Retain`: compact current baseline in `AGENTS.md`,
  `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- `Merge`: align pending/latest current-state facts across handoff docs so
  later agents do not see contradictory pending-evolution state.
- `Retire`: no old rule retired in this window.
- `Archive-only`: detailed browser acceptance traces, run ids, sandbox paths,
  source patch hashes, port numbers, and previous auto-evolve score history.

## Independent Review

Subagent: `Kuhn`.

Recommendation: `docs_merge`, score `84/100`.

Key rationale: the window has strong evidence but no uncovered process gap.
The docs entropy risk is medium because current-state pointers drifted across
handoff documents; this supports a small docs-merge alignment pass, not a new
durable ECL/template/lint/product rule.

## Validation Plan

- Align current handoff docs.
- Run `lint-ecl`, `lint-encoding`, `harness-change reindex/status`, and
  `harness-evolve mark-complete`.
- Close the structured evolution change and git settle.
