# Post Goal Loop Decision Surface Window Evolution Proposal

## Window

Pending file: `harness/evolution/pending.md`

Candidate archives:

- `harness/changes/archive/20260625-auto-evolve-post-scheduler-integration-window/summary.md`
- `harness/changes/archive/20260625-workbench-external-local-restore-v1/summary.md`
- `harness/changes/archive/20260625-document-minimality-gate-and-complexity-review/summary.md`
- `harness/changes/archive/20260625-workbench-planning-decomposition-scope-honesty-v1/summary.md`
- `harness/changes/archive/20260625-workbench-goal-loop-decision-surface-audit-v1/summary.md`

## Recommendation

Status: `noop`

No durable ECL rule, review-template field, lint rule, current-doc content
change, or product runtime change is justified from this pending window. The
useful lessons are already covered by current ECL rules, review templates, and
handoff docs.

The only required action is mechanical: record this no-op result through the
normal evolution machinery and clear `harness/evolution/pending.md` with
`harness-evolve mark-complete`.

## Evidence Summary

### Previous Harness Evolution

`auto-evolve-post-scheduler-integration-window` already merged compact handoff
wording for scheduler integration state and intentionally avoided new runtime,
ECL, template, or lint behavior.

### External-Local Restore

`workbench-external-local-restore-v1` restored old external projects opened by
path when `.agent-harness/project.json` and matching `AHO_HOME` memory exist.
This was a product entrypoint/projection bug fix within existing owner
boundaries, not a reusable Harness process gap.

### Minimality Gate

`document-minimality-gate-and-complexity-review` already promoted the
Ponytail-inspired minimality lesson into durable rules and templates:
`AGENTS.md`, `docs/ECL.md`, change plan/review templates, and
`docs/CURRENT-DEVELOPMENT-PLAN.md`.

### Scope Honesty

`workbench-planning-decomposition-scope-honesty-v1` proved source-scope
honesty before scheduler readiness. Existing proposal/runtime boundary,
Workbench honesty, Goal Loop boundary, and source-safety review rules already
cover the durable constraint.

### Goal Loop Decision Surface

`workbench-goal-loop-decision-surface-audit-v1` found no product-code gap. It
confirmed that Goal Loop evidence remains explanation and assisted-gate
context over authoritative Workbench gates, not a new decision or execution
authority.

## Experience Retention Scan

| Candidate | Decision | Evidence | Current-doc impact |
| --- | --- | --- | --- |
| Pending evolution should not become append-only docs growth | Retain | Existing `docs/ECL.md` Controlled Evolution, Documentation Entropy, and Experience Lifecycle rules plus previous `docs_merge` evolution | No new rule; keep current process. |
| External-local restore source/home separation and source cleanliness | Retain | `workbench-external-local-restore-v1` | Already covered by Real Acceptance Feedback, Runtime Bridge Boundary, and Source Apply Safety concepts; no edit. |
| Minimality / complexity review before new layers | Retain | `document-minimality-gate-and-complexity-review` | Already durable in AGENTS/ECL/templates/current plan; no additional template update. |
| Explicit source scopes before scheduler readiness | Archive-only | `workbench-planning-decomposition-scope-honesty-v1` | Product behavior and tests are archived/current baseline; no new Harness rule. |
| Goal Loop decision surface is explanatory over `confirmationQueue.primary` | Retain | `workbench-goal-loop-decision-surface-audit-v1` | Existing ECL Goal Loop Boundary and Workbench honesty rules are sufficient. |
| Detailed E-drive paths, run ids, retries, sandbox setup | Archive-only | Candidate summaries and acceptance notes | Do not copy into `AGENTS.md`, `STATUS.md`, `CURRENT-DEVELOPMENT-PLAN.md`, or ECL. |
| Current docs line budget and role separation | Retain | Current `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md` | Current split is acceptable; no compression needed now. |

## Independent Review

Subagent: `019efd37-f4fd-7100-91dd-50ccae2f0795` (Aquinas)

Recommendation: `noop`

Score: 89/100

| Dimension | Score | Notes |
| --- | ---: | --- |
| Evidence grounding /30 | 27 | Reviewed pending window, ECL evolution rules, handoff docs, and requested summaries. |
| Project relevance /25 | 22 | Lessons are relevant but already product-specific baseline or promoted Harness constraints. |
| Mechanical enforceability /15 | 12 | Existing templates already cover complexity, source safety, surface honesty, Goal Loop, and documentation entropy. |
| Regression safety /20 | 19 | No-op avoids expanding Harness process or duplicating archive history. |
| Context cost /10 | 9 | Keeps current docs compact. |

## Result

- status: `noop`
- eval_mode: `subagent_review`
- results.tsv note: post-goal-loop-decision-surface window reviewed with
  subagent Aquinas score 89; existing ECL/template/handoff rules sufficient;
  no durable ECL/template/lint/docs/product runtime change.

