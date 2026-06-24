# Harness Auto-Evolve Proposal: Post Bounded Rework Window

## Candidate Window

Pending source: `harness/evolution/pending.md`.

Candidate archives:

- `harness/changes/archive/20260624-auto-evolve-post-continuation-scout-window/summary.md`
- `harness/changes/archive/20260624-workbench-two-tier-scoped-automation-authorization-v1/summary.md`
- `harness/changes/archive/20260624-workbench-scoped-automation-decomposition-gate-coverage-v1/summary.md`
- `harness/changes/archive/20260624-workbench-scoped-automation-audit-acceptance-v1/summary.md`
- `harness/changes/archive/20260624-workbench-scoped-automation-bounded-rework-acceptance-v1/summary.md`

## Recommendation

Status: `docs_merge` for compact handoff/current-doc alignment, and `noop` for
ECL rules, review template, lint, tests, and product runtime.

Do not add another durable Harness rule from this window. The repeated lessons
are already covered by current ECL/template/current-plan boundaries:

- Codex full-access runtime capability is not AHO workflow authority.
- Scoped automation consumes only the current authoritative primary gate.
- Every automated child step must revalidate selected Change scope and required
  target ids.
- `audit.accept` is safe only for exactly `approved` audit evidence.
- Bounded rework/revalidate/reaudit remain local recovery gates and still stop
  before source apply.
- Apply, close/archive, merge, remote landing, and Harness evolution remain
  human-gated terminal actions.
- Detailed E-drive sandbox/run histories stay archive-only.

The only accepted delta is handoff/current-doc alignment: record the active
evolution while it is open, clear pending evolution after `mark-complete`, point
current docs at the archived evolution summary, and avoid copying the candidate
window history forward.

## Accepted Candidates

Compact handoff/current-doc alignment only.

## Rejected Candidates

- Promote a new "full-access" Harness rule: rejected because `AGENTS.md`,
  `docs/ECL.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md` already separate Codex
  runtime capability from AHO scoped workflow authority.
- Promote a new scoped automation target rule: rejected because scoped Workbench
  action payload, stale revalidation, ToolPolicy/human gate, and source apply
  safety coverage already require explicit target ids and fail-closed behavior.
- Promote `audit.accept` / bounded rework specifics into generic templates:
  rejected because they are product-domain gates, while the reusable rule is
  already captured as "safe local gates only; terminal source/close/remote gates
  remain human."
- Promote E-drive sandbox paths into current docs: rejected because external
  source/runtime separation is already a Source Apply Safety acceptance rule;
  exact sandbox paths and run ids are archive-only evidence.
- Add product runtime or UI behavior: rejected because this is an evolution
  review after a completed product slice, not a new product change.

## Experience Retention Scan

| Candidate | Decision | Evidence | Current-doc impact |
| --- | --- | --- | --- |
| Two-tier `请求批准` / `完全访问权限` surface with scoped authorization. | Retain | `20260624-workbench-two-tier-scoped-automation-authorization-v1` | Current docs already state the baseline; no new rule. |
| Codex full-access runtime does not expand AHO action authority. | Retain | Two-tier and later scoped automation archives | Covered by hard boundaries and current plan; no new rule. |
| Current authoritative primary gate is the only automation input. | Retain | Two-tier, decomposition, audit-accept, bounded-rework archives | Covered by scoped action/revalidation rules; no template change. |
| `planning.decompose` can be automated only after human plan confirmation. | Archive-only | Decomposition gate archive | Product gate detail; keep in archive/current baseline, not ECL. |
| Safe `audit.accept` is automatic only for exactly approved audits. | Retain | Audit acceptance archive | Current baseline; generic rule already covered by safe local gate and human terminal gate boundaries. |
| `result.refresh-rework`, `result.revalidate`, and `result.reaudit` are bounded recovery gates. | Retain | Bounded rework archive | Current baseline; no new framework. |
| Positive/negative E-drive sandbox evidence and run ids. | Archive-only | Audit-accept and bounded-rework archive summaries | Detailed acceptance evidence stays archive-only. |
| Previous evolution was noop with handoff compression. | Retain | `20260624-auto-evolve-post-continuation-scout-window` | Continue compact docs; no repeated compression rule needed. |
| Product capability still excludes apply/close/merge/remote/Harness evolution automation. | Retain | All scoped automation archives | Already current hard boundary; no expansion. |

## Independent Review

Authorized subagent review was performed by Helmholtz
(`019efa30-1e95-7401-9264-37362d77188d`). Scope was read-only review and
scoring; the subagent did not edit files, apply evolution, or replace ECL
lifecycle.

Recommendation: `docs_merge`. Score: 86/100.

Reviewer rationale:

- The archive window's core lessons are already covered by existing ECL and
  boundary rules.
- The needed delta is minimal handoff/current-doc alignment and compression,
  especially active/latest/pending state and latest Harness evolution pointers.
- ECL, templates, lint, product runtime, and automation permissions should not
  change.

Limitations: read-only review only; no files modified and no `mark-complete`
run by the subagent.

## Score

| Dimension | Score | Notes |
| --- | ---: | --- |
| Evidence grounding /30 | 27 | Candidate summaries, current boundaries, and prior evolution evidence were reviewed. |
| Project relevance /25 | 22 | Minimal docs merge fixes current handoff drift without adding process weight. |
| Mechanical enforceability /15 | 11 | Harness lint/status/evolve checks can verify pending/active/archive alignment. |
| Regression safety /20 | 18 | No product runtime, ECL rule, template, or lint behavior changes. |
| Context cost /10 | 8 | Keeps scoped automation details compact and archive-owned. |

Total: 86/100.

## Validation

Planned:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

Product tests are not planned because this proposal does not change product
source or runtime behavior.

## Decision

- status: `docs_merge`
- eval_mode: `subagent_review`
- results.tsv note: post-bounded-rework scoped automation window reviewed with
  authorized subagent; existing scoped-action, ToolPolicy/human-gate, source
  safety, documentation entropy, Experience Lifecycle, and architecture growth
  rules are sufficient; no ECL/template/lint/product runtime change; compact
  handoff/current-doc alignment applied.
