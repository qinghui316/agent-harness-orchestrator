# Agent Harness Orchestrator Agent Guide

Agent Harness Orchestrator (AHO) is a local-first Agent Development OS with a Spec-Anchored Harness Kernel. It turns natural-language development demand into project-scoped conversations, durable Change/Workpad/TaskGraph state, constrained agent runs, validation/audit evidence, and human-gated apply/landing decisions.

## 1. Current Handoff

- Current date: 2026-06-26.
- Active change: none.
- Pending Harness evolution: `harness/evolution/pending.md`.
- Latest archived product audit: Workbench Goal Loop Decision Surface Audit V1, archived at `harness/changes/archive/20260625-workbench-goal-loop-decision-surface-audit-v1/summary.md`.
- Latest archived product change: Workbench Mode-Aware Local Goal Loop V1, archived at `harness/changes/archive/20260626-workbench-mode-aware-local-goal-loop-v1/summary.md`.
- Previous product change: Workbench Local Landing Ready Terminal Close V1, archived at `harness/changes/archive/20260626-workbench-local-landing-ready-terminal-close-v1/summary.md`.
- Previous product change: Workbench Integration Apply Outcome Completion V1, archived at `harness/changes/archive/20260626-workbench-integration-apply-outcome-completion-v1/summary.md`.
- Latest archived product acceptance: Workbench Integration Applied Local Landing/Close Real UI Scout V1, archived at `harness/changes/archive/20260626-workbench-integration-applied-local-landing-close-real-ui-scout-v1/summary.md`.
- Previous repaired integration apply acceptance: `harness/changes/archive/20260626-workbench-repaired-integration-apply-real-ui-acceptance-v1/summary.md`.
- Previous IntegrationFix real UI acceptance: `harness/changes/archive/20260626-workbench-integrationfix-real-ui-acceptance-v1/summary.md`.
- Previous archived product change: Workbench Codex-Backed IntegrationFix Real Repair V1, archived at `harness/changes/archive/20260625-workbench-codex-backed-integrationfix-real-repair-v1/summary.md`.
- Previous scheduler progression: `harness/changes/archive/20260625-workbench-scheduler-worker-progression-to-integration-candidate-v1/summary.md`.
- Latest archived boundary guard: Workbench Loop-Per-Change Boundary Guard V1, archived at `harness/changes/archive/20260625-workbench-loop-per-change-boundary-guard-v1/summary.md`.
- Latest archived product acceptance: Workbench Confirmation Feedback Real UI Scout V1, archived at `harness/changes/archive/20260625-workbench-confirmation-feedback-real-ui-scout-v1/summary.md`.
- Latest completed Harness evolution: `harness/changes/archive/20260626-auto-evolve-post-integrationfix-apply-window/summary.md` (`noop`; subagent review score 91; no ECL/template/lint/product runtime change).
- Previous completed Harness evolution: `harness/changes/archive/20260625-auto-evolve-post-feedback-real-ui-window/summary.md` (`noop`; subagent review score 88; no ECL/template/lint/product runtime change).
- Previous archived product change: Workbench Confirmation Feedback To Rework V1, archived at `harness/changes/archive/20260625-workbench-confirmation-feedback-to-rework-v1/summary.md`.
- Previous post-apply landing autonomy: `harness/changes/archive/20260625-workbench-post-apply-local-landing-autonomy-v1/summary.md`.
- Previous Codex Plan Mode + Post-Plan Local Autonomy V1: `harness/changes/archive/20260625-workbench-codex-plan-mode-post-plan-local-autonomy-v1/summary.md`.
- Previous post-plan local autonomy change: `harness/changes/archive/20260625-workbench-post-plan-scoped-local-autonomy-v1/summary.md`.
- Previous post-plan automation hardening: Workbench Post-Plan Scoped Automation Execution V1, archived at `harness/changes/archive/20260625-workbench-post-plan-scoped-automation-execution-v1/summary.md`.
- Previous planning/decomposition hardening: `harness/changes/archive/20260625-workbench-planning-decomposition-scope-honesty-v1/summary.md`.
- Previous external-local restore change: `harness/changes/archive/20260625-workbench-external-local-restore-v1/summary.md`.
- Latest archived Harness docs change: Minimality Gate And Complexity Review, archived at `harness/changes/archive/20260625-document-minimality-gate-and-complexity-review/summary.md`.
- Previous scheduler apply/discard hardening: `harness/changes/archive/20260625-workbench-scheduler-integration-apply-discard-real-acceptance-v1/summary.md`.
- Previous completed Harness evolution: `harness/changes/archive/20260625-auto-evolve-post-loop-boundary-window/summary.md` (`docs_merge`; subagent review score 84; no ECL/template/lint/product runtime change).
- Other recent archives are discoverable via `docs/STATUS.md` and `harness/changes/INDEX.json`; avoid expanding this entry map into a phase ledger.

Latest scheduler progression closeout: existing scheduler owners already cover
same-Change two-worker progression to a ready `SchedulerIntegrationCandidate`.
Scoped automation now records `terminal-human-gate` when bounded controlled
continuation lands on the manual `planning.scheduler.integration-check.run`
gate at the step budget; raw scheduler actions still stay outside direct
`完全访问权限`.

Latest IntegrationFix closeout: failed IntegrationCheck conflict, aggregate
validation, or aggregate audit paths now default to Codex-backed bounded repair
inside the integration fix checkout. Attempts record repair mode, Codex run id,
run artifact refs, repaired patch hash, and summary. Marker deletion remains
only an explicit deterministic test helper. IntegrationCheck and integration
apply/discard remain human-gated.

Latest IntegrationFix real UI acceptance:
`harness/changes/archive/20260626-workbench-integrationfix-real-ui-acceptance-v1/summary.md`.
It verified the E-drive Workbench UI path through two same-Change scheduler
worker worktrees, ready integration candidate, IntegrationCheck, real
Codex-backed IntegrationFix in the integration fix checkout, repaired patch,
aggregate validation/audit pass, and final human integration apply/discard
gate. It also fixed the controlled-continuation boundary so
`planning.scheduler.integration-check.run` remains a manual scheduler barrier.

Latest integration apply outcome closeout:
`harness/changes/archive/20260626-workbench-integration-apply-outcome-completion-v1/summary.md`.
It verifies the post-integration-apply surface: after human
`apply-check.apply`, stale integration apply/discard gates disappear, the
existing controlled scheduler outcome/completion path becomes current, and the
Workbench decision inspector aligns with the authoritative confirmation queue
when the next gate is local `landing.prepare`.

Latest local terminal closeout:
`harness/changes/archive/20260626-workbench-local-landing-ready-terminal-close-v1/summary.md`.
It fixes the local-only terminal surface after a ready landing package: when
PR/remote are unavailable or out of scope, provider readiness no longer becomes
the selected Change primary gate. Workbench now shows local `change.close` if
the existing close gate is ready, or a local terminal blocker backed by the
same close requirements. PR/provider evidence may remain background context.

Latest mode-aware local loop closeout:
`harness/changes/archive/20260626-workbench-mode-aware-local-goal-loop-v1/summary.md`.
Workbench now has a thin local Goal Loop coordinator: both `请求批准` and
`完全访问权限` observe the same current Change gate, but only full-access
delegates allowed local gates to scoped automation after human plan
confirmation. Request-approval remains non-dispatching and leaves one real
primary confirmation for the user.

Previous local landing scout:
`harness/changes/archive/20260626-workbench-integration-applied-local-landing-close-real-ui-scout-v1/summary.md`.
It verified that the repaired IntegrationFix apply path can advance through
scheduler outcome/completion and local `landing.prepare` on an E-drive
external source. The scout fixed a shared untracked-file patch rendering bug
that blocked landing attribution for repaired patches adding new files.

Previous repaired integration apply acceptance:
`harness/changes/archive/20260626-workbench-repaired-integration-apply-real-ui-acceptance-v1/summary.md`.
It verified through the real Workbench UI that the repaired IntegrationFix
artifact can be human-applied to the E-drive external source root. The
IntegrationCheck status became `applied`, the old integration apply/discard
gate stopped being the current primary gate, and integration apply/discard
remains a human decision outside `完全访问权限`.

Current baseline: the local manual-gated Workbench loop has real browser
acceptance through planning, code, validation/audit, human apply, and
close/archive. Workbench planning now prefers Codex Plan Mode and records a
proposal-only `proposedPlanMd`; when native plan deltas are unavailable, it
falls back to a prompt-level `<proposed_plan>` contract. The user still
manually confirms the plan. Workbench exposes `请求批准` and scoped
`完全访问权限` as post-plan execution modes over the same local Goal Loop
coordinator: request-approval observes and leaves the current gate for the
user, while full-access may run Codex with full-access runtime capability but
AHO authority remains bound to the selected Change, current target ids, source
state, accepted artifacts, stale revalidation, ToolPolicyGate,
validation/audit, and scoped local terminal gates. After human plan
confirmation, scoped `完全访问权限` can consume local execution/recovery gates,
safe `audit.accept`, local `result.apply`, local `landing.prepare`, and local
`change.close`, then stops with no primary gate after the Change is archived.
The latest post-apply landing hardening verified this local gate through
targeted automation/revalidation/read-model/DOM tests and the daily Workbench
aggregate; the earlier E-drive acceptance remains the real UI baseline through
local apply and close. It still does not auto-run planning confirmation, raw
`planning.scheduler.*`, integration apply/discard, merge, remote landing, PR,
Harness evolution, scheduler loops, or parallel execution.

Latest completed product audit: Goal Loop decision surface alignment found no
new product-code gap. The existing decision chain remains an explanation and
assisted-gate layer over the authoritative Workbench `confirmationQueue.primary`;
it does not create a new decision engine or execution authority.

Latest completed product hardening: planning/decomposition scope honesty before
low-conflict scheduler readiness. Explicit user source scopes are preserved
through planning and DecompositionPlan, and unaccepted expansion into tests,
docs, indexes, or other files blocks scheduler-ready continuation.

Scheduler acceptance has reached real two-worker `coder-codex` worktrees,
worker validation/audit, ready integration candidate, manual IntegrationCheck,
aggregate validation/audit, and the human integration apply/discard gate. Raw
`planning.scheduler.*` actions remain outside direct `完全访问权限`. The latest
apply/discard acceptance proves the repaired IntegrationFix artifact can be
human-applied through the Workbench UI; apply/discard remains human-gated and
handler-level discard protection stays fail-closed. External-local restore now
rehydrates old projects opened by path when `.agent-harness/project.json` and
the current `AHO_HOME/projects/<projectId>` memory exist; missing memory is
shown as an explicit `AHO_HOME` mismatch instead of generic Harness
uninitialized state.

Latest boundary guard: one loop execution maps to one parent Change.
Multi-worktree outputs may feed an IntegrationCheck only when all targets
belong to that same Change; cross-Change merge remains a future explicit
higher-level design. The resulting Harness evolution window has been marked
complete; do not auto-apply future Harness evolution without an explicit
decision.

Latest Harness evolution reviewed the five-archive window ending with the
loop-per-Change boundary guard. It recorded a `docs_merge` result for compact
handoff alignment and no ECL/template/lint/product runtime change.

Latest Harness evolution reviewed the five-archive window from
`20260625-auto-evolve-post-feedback-real-ui-window` through
`20260626-workbench-repaired-integration-apply-real-ui-acceptance-v1`. The
decision was `noop` with subagent Leibniz score 91; pending evolution was
marked complete and no
ECL/template/lint/product runtime change was made.

Daily `npm run test:workbench` is the fast Workbench unit-capability gate; slow
scheduler/apply/Goal Loop coverage remains in explicit release/deep scripts.

Latest product slice: `workbench-confirmation-feedback-to-rework-v1`
so user feedback entered at a confirmation point can revise/rework and return
to confirmation or continuation. V1 routes plan-confirm feedback to
`planning.revise`, routes result/apply feedback to `result.refresh-rework`, and
keeps unsupported confirmation feedback record-only.

Latest real UI scout: `workbench-confirmation-feedback-real-ui-scout-v1`
verified the two confirmation feedback loops in an E-drive external sandbox.
Plan-confirm feedback revised the planning draft and returned to plan
confirmation without accepting canonical artifacts early. Result/apply feedback
entered bounded rework and preserved source-root safety. The scout fixed one
projection bug: when a newer validation/audit blocker exists, older same-Change
worktree apply approvals no longer remain current primary gates.

Use `docs/STATUS.md` for short handoff context and
`harness/changes/INDEX.json` plus archived `summary.md` files for historical
detail. Do not rebuild current context by reading the full archive ledger unless
the task requires it.

## 2. Context Loading Order

1. Read this `AGENTS.md`.
2. Read `docs/ECL.md`.
3. If `harness/changes/active/` contains a change, read its `summary.md`, `spec.md`, `plan.md`, `tasks.md`, and relevant `reviews/`.
4. If no active change exists and `harness/evolution/pending.md` exists, read it before `docs/STATUS.md`.
5. Read `docs/STATUS.md`.
6. Read task-specific docs only as needed.

Archive history is loaded selectively through `docs/STATUS.md` paths or `harness/changes/INDEX.json`. Start with archived `summary.md` files; open specs, plans, reviews, or source only when the current task needs that evidence.

## 3. Project Sources

| Document | Purpose |
| --- | --- |
| `docs/PRODUCT.md` | Product requirements, MVP boundaries, and final product shape |
| `docs/AGENT-DEVELOPMENT-OS.md` | End-to-end product loop and staged roadmap |
| `docs/CURRENT-DEVELOPMENT-PLAN.md` | Current development plan and post-Phase-10Y roadmap context |
| `docs/ARCHITECTURE.md` | Architecture layers and major decisions |
| `docs/RUNTIME.md` | Runtime objects, facts, projections, and derived views |
| `docs/WORKBENCH.md` | Workbench information architecture and user interaction model |
| `docs/AGENT-MODEL.md` | Role, worker, review, rework, and document-agent model |
| `docs/BOUNDARIES.md` | Module and authority boundaries |
| `docs/ECL.md` | Change lifecycle, Harness rules, and evolution constraints |
| `docs/DEVELOPMENT.md` | Local commands and verification |
| `docs/references/index.md` | Reference source maps and when to use each reference |

## 4. Work Classification

Small changes are local, low-risk edits such as typos, comments, or narrowly scoped documentation wording with no interface, data, permission, architecture, runtime, or validation-chain impact.

Structured changes include cross-file behavior, APIs, schemas, architecture, validation chains, Harness rules/templates/scripts, reference source updates, unclear requirements, or work likely to exceed 20 minutes. Structured changes use active change files.

If an active change exists, first choose one path:

- `close`: the active change is implemented, verified, reviewed, and close-ready.
- `park`: the active change is incomplete or waiting for acceptance and the user is switching topics.
- `extend`: the new request is a same-scope defect fix or acceptance supplement.

For structured work, run or mentally apply:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 preflight
```

Do not silently append unrelated phases to an old active change.

## 5. Structured Change Gate

Structured work needs:

- `spec.md` for WHAT and WHY.
- `plan.md` for HOW and planning-discovered gaps.
- `tasks.md` for executable steps mapped to acceptance criteria.
- `reviews/review.md` for independent review, coverage, and verification.

High-impact unknowns are recorded as `[NEEDS CLARIFICATION: ...]` and resolved before implementation.

## 5A. Minimal Implementation Gate

Before adding code or a Harness rule, check in order: can this be a no-op, can
an existing owner/helper solve it, can platform/stdlib/current dependencies
solve it, can the shared root cause be fixed instead of one caller, and only
then write the smallest coherent implementation. New evidence, projection,
summary, descriptor, or local framework layers are not justified unless they
replace an older layer or make a real product action reachable. This gate must
not weaken validation, source safety, stale revalidation, ToolPolicyGate, human
gates, security, or required tests.

## 6. Verification

Harness verification:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check
```

Product verification:

```powershell
# Always start from the touched boundary: targeted Vitest suites, script contract
# checks, or drift greps that prove the changed behavior.
npm run typecheck
npm run lint
npm run test:fast
npm run build
# Escalate only when the changed boundary needs it:
npm run test:integration
npm run test:workbench
npm run test:workbench:slow
npm run test:workbench:release
npm run test
```

Use full `npm run test`, `npm run test:workbench:release`, or slow Workbench suites for broad runtime, full Workbench contracts, gate/source/apply, validation/audit, remote, scheduler, Goal Loop, package-script, or release-risk changes. For bounded docs, helper, or test-topology changes, record the targeted verification and why aggregate/full suites were not needed.

For documentation or Harness-rule changes, also run targeted drift checks for active paths, duplicate current-state fields, stale latest-phase language, and documentation entropy where applicable.

## 7. Task-To-Artifact Map

| Task Type | Start Here | Expected Artifact |
| --- | --- | --- |
| Product requirement | `docs/PRODUCT.md`, `docs/AGENT-DEVELOPMENT-OS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md` | Active change spec/plan/tasks |
| Architecture decision | `docs/ARCHITECTURE.md`, `docs/BOUNDARIES.md` | Plan decision and review evidence |
| Runtime object decision | `docs/RUNTIME.md` | Runtime boundary note |
| Workbench behavior | `docs/WORKBENCH.md` | Workbench spec or UI acceptance record |
| Agent/role model | `docs/AGENT-MODEL.md` | Role/spec proposal or architecture note |
| Harness rule change | `docs/ECL.md` | Structured change, review template/lint update if needed |
| Reference research | `docs/references/index.md` | Updated reference map or design doc |
| Current handoff | `docs/STATUS.md` | Resume, park, close, or next active change |

## 8. Product Boundaries

AHO workflow truth remains Change/ECL files, accepted Spec/Plan/Tasks/AC, TaskGraph, Run artifacts, Validation, Audit, Worktree state, Apply/Close decisions, and Harness evolution records.

Demand conversations are the primary user-facing work surface. Workpad, Topic, TaskQueue, SchedulerRun, Goal Loop packets/policies, SQLite, projections, and UI state are coordination or evidence layers unless a later accepted architecture decision promotes them.

Human confirmation remains required before high-impact canonical transitions such as source apply/merge, close/archive, remote landing, and Harness evolution apply. Agent audit, merge review, and Goal Loop recommendations are evidence, not final authority.

Current Goal Loop evidence is non-executing. Controller policy, next-step packets, prompt context, feedback evidence, gate-readiness preflight, and close-gate handoff metadata may explain, check, or recommend existing Harness gates, but they must not execute actions, mutate source, bypass ToolPolicyGate/human gates, or become workflow truth. A preflight id may attach to the matching concrete action as evidence only; close-gate handoff may attach to the existing `change.close` approval as derived context only. Accepted Spec/Plan/Tasks/AC artifact hash drift makes Goal Loop guidance stale until fresh evidence is recorded.

Scheduler and parallel-work artifacts remain bounded. First/next worker gates, validation/audit/rework, integration handoff/outcome, and SchedulerRun completion evidence do not authorize whole-wave dispatch, scheduler loops, slot allocators, child Changes, automatic apply/merge, or a full parallel executor unless a later phase explicitly implements those paths.

New product features must prefer reusing and strengthening existing core mechanisms. Feature modules should express domain differences; shared artifact, lineage, stale-revalidation, authority, ledger, projection, gate, and ToolPolicy logic belongs in common owners rather than feature-local mini-frameworks. Architecture quality is judged by ownership, reuse, verification, and lower future cost for similar features, not by file count, line count, or surface modularity alone.

## 9. Reference Source Rules

Reference source code is under `reference-projects/`. Read `docs/references/index.md` and the relevant `docs/design-docs/ref-*.md` map before inspecting reference source.

Treat reference projects as evidence, not implementation instructions. Do not vendor-copy reference code into AHO product code. Do not edit reference submodule source as part of this repository.

## 10. Documentation Entropy

`AGENTS.md` is a map, not the project history. It should stay compact and route agents to the current handoff, source docs, and archive index.

`docs/STATUS.md` is a short handoff, not the archive ledger. Historical facts stay in archived summaries and `harness/changes/INDEX.json`.

When updating handoff docs, add only current behavior and links that change agent decisions now. If old experience is superseded, merge it into a shorter rule, retire it from current docs, or leave it archive-only.

## 11. File Safety

- Preserve user changes. Do not revert unrelated edits.
- Use UTF-8 for source and documentation.
- PowerShell reads and writes must explicitly use UTF-8.
- Do not hand-edit `harness/changes/INDEX.json`; regenerate it with `scripts/harness-change.ps1 reindex`.
- Do not auto-apply Harness evolution from `pending.md`; use evidence, proposal, independent review, validation, and results logging.
