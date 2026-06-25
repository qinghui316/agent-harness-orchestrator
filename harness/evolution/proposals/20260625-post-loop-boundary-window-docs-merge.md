# Post Loop Boundary Window Evolution Proposal

## Window

Pending file: `harness/evolution/pending.md`

Candidate archives:

- `harness/changes/archive/20260625-auto-evolve-post-goal-loop-decision-surface-window/summary.md`
- `harness/changes/archive/20260625-workbench-post-plan-scoped-automation-execution-v1/summary.md`
- `harness/changes/archive/20260625-workbench-post-plan-scoped-automation-real-ui-scout-v1/summary.md`
- `harness/changes/archive/20260625-workbench-post-plan-scoped-local-autonomy-v1/summary.md`
- `harness/changes/archive/20260625-workbench-loop-per-change-boundary-guard-v1/summary.md`

## Recommendation

Status: `docs_merge`

No ECL rule, review-template field, lint rule, or product runtime change is
recommended for this window. The useful lessons are already covered by current
Harness rules:

- controlled evolution is human-gated;
- experience lifecycle prevents append-only docs growth;
- documentation entropy keeps current docs compact;
- source safety and stale-target revalidation remain required;
- Goal Loop evidence stays non-authoritative;
- `完全访问权限` remains scoped to the current Change and does not apply Harness
  evolution;
- IntegrationCheck now has a same-Change boundary.

The only durable action is compact current-doc alignment: AGENTS, STATUS, and
CURRENT-DEVELOPMENT-PLAN must agree that a pending evolution exists while this
change is active, and after `mark-complete` they must agree that no pending
evolution remains and point to this archived evolution.

## Evidence Summary

### Previous Auto-Evolve Window

`auto-evolve-post-goal-loop-decision-surface-window` already concluded `noop`
with subagent review. It verified that existing ECL/template/handoff rules were
sufficient for Goal Loop surface lessons and did not justify new runtime or
rules.

### Post-Plan Scoped Automation

`workbench-post-plan-scoped-automation-execution-v1` tightened the product
boundary so `planning.confirm-execution` is not automatically consumed by
`完全访问权限`. This is already represented in current ECL and product boundary
docs; no new Harness rule is needed.

### Real UI Scout

`workbench-post-plan-scoped-automation-real-ui-scout-v1` proved the visible
Workbench surface: full access is unavailable for plan confirmation and becomes
available only after human plan acceptance. Its detailed sandbox/run evidence
belongs in archive summaries, not current docs.

### Scoped Local Autonomy

`workbench-post-plan-scoped-local-autonomy-v1` widened the existing automation
runtime through local apply/close under current-Change scoped authorization and
existing source safety. It did not automate planning, remote, merge, PR,
integration apply/discard, raw scheduler actions, or Harness evolution.

### Loop-Per-Change Boundary

`workbench-loop-per-change-boundary-guard-v1` closed the boundary that one loop
execution maps to one parent Change. Multi-worktree outputs may feed
IntegrationCheck only inside that same Change; cross-Change merge remains a
future explicit design.

## Independent Review

Subagent: `019efdf2-86de-7a20-b614-04ce76d54bd3` (Gauss)

Recommendation: `docs_merge` for handoff/current-state alignment, `noop` for
ECL/template/lint/product runtime changes.

Score: 84/100

Rationale: the window shows current-state drift, not a missing process rule.
Existing ECL rules already cover controlled evolution, experience lifecycle,
documentation entropy, source safety, scoped action target revalidation, Goal
Loop boundaries, and human-gated authority.

## Experience Retention Scan

### Promote

None. No new durable ECL/template/lint rule is warranted.

### Retain

- Human-only `planning.confirm-execution`.
- Scoped `完全访问权限` only after accepted planning artifacts.
- Local apply/close only under current-Change scoped authorization plus
  source/artifact/stale-target revalidation.
- Same-Change IntegrationCheck boundary.
- Cross-Change merge remains future explicit higher-level design.
- Harness evolution remains human-gated and outside full-access automation.

### Merge

- Merge post-plan automation, local autonomy, and loop-per-Change lessons into
  one compact current-baseline statement across handoff docs.
- Merge pending/active state wording so AGENTS, STATUS, and CURRENT agree while
  this evolution is active and after it is completed.

### Retire

- Retire stale "pending none" wording and stale "active none" wording when the
  filesystem contains active evolution or pending evolution.

### Archive-only

- Real UI sandbox paths, run ids, Codex artifacts, environment notes, aggregate
  test diagnostics, retries, and previous auto-evolve no-op detail.

## Validation Plan

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status docs_merge -EvalMode subagent_review ...`

Product tests are not required because this evolution changes Harness
proposal/result/handoff docs only, not product runtime behavior.
