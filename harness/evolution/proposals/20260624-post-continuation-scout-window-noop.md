# Harness Auto-Evolve Proposal: Post Continuation Scout Window

## Candidate Window

Pending source: `harness/evolution/pending.md`.

Candidate archives:

- `harness/changes/archive/20260623-scheduler-slow-runtime-reduction/summary.md`
- `harness/changes/archive/20260623-workbench-verification-runtime-convergence/summary.md`
- `harness/changes/archive/20260624-workbench-goal-loop-surface-gap-audit/summary.md`
- `harness/changes/archive/20260624-goal-driven-controlled-continuation-runtime-v1/summary.md`
- `harness/changes/archive/20260624-workbench-real-ui-continuation-next-blocker-scout/summary.md`

## Recommendation

Status: `noop` for ECL rules, review template, lint, tests, and product runtime.

Do not add another durable Harness rule from this window. Existing ECL and
review-template coverage already handles the repeated lessons:

- aggregate Workbench timeout / split-suite evidence;
- Workbench user-surface honesty and current primary gate alignment;
- Goal Loop recommendation authority and bounded continuation limits;
- source apply safety and external source/runtime separation;
- module-boundary and core-mechanism reuse;
- documentation entropy and Experience Lifecycle.

Apply only a handoff compression delta: shorten duplicated current/latest
archive narratives in `AGENTS.md` and `docs/STATUS.md`. Keep plan-level context
in `docs/CURRENT-DEVELOPMENT-PLAN.md` and detailed acceptance evidence in
archived summaries.

## Accepted Candidates

None for ECL rule, review template, lint, test, or product runtime changes.

## Rejected Candidates

- Promote a new Workbench verification rule: rejected because
  `docs/ECL.md` already requires aggregate timeout attribution and split
  evidence, and `workbench-verification-runtime-convergence` implemented daily
  versus release/deep gates.
- Promote a new Goal Loop / bounded continuation rule: rejected because
  `docs/ECL.md` already classifies Goal Loop evidence as non-authoritative and
  records bounded loop boundaries and human gates.
- Promote a new real UI acceptance rule: rejected because existing Real
  Acceptance Feedback, Workbench User-Surface Honesty, and Source Apply Safety
  coverage already require the relevant evidence. The latest scout's
  `.agent-harness/workbench/` ignore and BOM parser fixes are product
  implementation details, not reusable Harness process rules.
- Promote scheduler seeded-fixture mechanics: rejected because the details are
  test topology implementation, already represented by explicit daily/release
  package scripts.

## Experience Retention Scan

| Candidate | Decision | Evidence | Current-doc impact |
| --- | --- | --- | --- |
| Bounded continuation remains scoped and human-gated at apply/close/evolution boundaries. | Retain | `20260624-goal-driven-controlled-continuation-runtime-v1` | Already covered in ECL and current plan; no new rule. |
| Daily Workbench aggregate versus release/deep verification split. | Retain | `20260623-workbench-verification-runtime-convergence` | Keep current-plan summary; no new rule. |
| Workbench Goal Loop surface showed no gap under targeted audit. | Archive-only | `20260624-workbench-goal-loop-surface-gap-audit` | No current-doc expansion. |
| Real UI continuation scout passed ordinary external-local path after two small fixes. | Retain | `20260624-workbench-real-ui-continuation-next-blocker-scout` | Keep as latest product baseline, but compress repeated details. |
| Repeated latest-scout, previous-scout, and real-Codex acceptance narratives across entry/handoff docs. | Merge | Current `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md` | Compress `AGENTS.md` and `docs/STATUS.md`; keep plan-level details in current plan and archives. |
| Sandbox ids, full paths, run ids, visible gate sequence, exact timing chronology, and old candidate lists. | Archive-only | Candidate summaries and prior evolution proposals | Remove from entry/handoff docs unless they change current decisions. |
| Stale prior "latest" narratives after newer scout/continuation evidence. | Retire | Current handoff drift check | Replace with one current baseline pointer and selected archive links. |

## Independent Review

Authorized subagent review was performed by Laplace
(`019ef7fb-4497-7950-b8bf-d256376ee502`). Scope was read-only review and
scoring; the subagent did not edit files, apply evolution, or replace ECL
lifecycle.

Recommendation: compression-only / no new rule. Score: 82/100 for
`noop` on rules plus handoff compression.

Reviewer rationale:

- Existing ECL/template coverage already handles aggregate timeout split
  evidence, Goal Loop boundaries, user-surface honesty, source safety, module
  and core reuse, and Experience Lifecycle.
- The real issue is handoff entropy: `AGENTS.md` and `docs/STATUS.md` repeat
  current/latest archive facts and historical acceptance details.
- Detailed sandbox ids, old blocker lists, and prior latest narratives should
  be retired from entry/handoff docs or left archive-only.

Limitations: read-only review only; no files modified and no `mark-complete`
run by the subagent.

## Score

| Dimension | Score | Notes |
| --- | ---: | --- |
| Evidence grounding /30 | 26 | Five archive summaries and current ECL/template coverage were reviewed. |
| Project relevance /25 | 21 | Handoff compression directly improves future agent routing; new process rules would not. |
| Mechanical enforceability /15 | 10 | Harness lint/status and drift grep can verify active/pending/current-state consistency. |
| Regression safety /20 | 17 | Handoff compression only; no product runtime or Harness rule behavior changes. |
| Context cost /10 | 8 | Reduces current-doc duplication instead of adding another rule. |

Total: 82/100.

## Validation

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

Product tests are skipped because this proposal does not change product source
or runtime behavior.

## Decision

- status: `noop`
- eval_mode: `subagent_review`
- results.tsv note: post-continuation scout window reviewed with subagent
  Laplace; existing ECL/template rules retained; no ECL/template/lint/product
  runtime change; compressed handoff docs to reduce duplicated current/latest
  archive narrative before resuming product work.
