# Review: Verification Scope Guidance Alignment

Status: approved.

## Findings

No blocking findings.

Independent close-ready review: subagent `019ee22b-bb69-79b3-a2bb-e1c0bb407130` returned PASS. It confirmed ECL/workflow truth and human gates are not weakened, no local verification framework was added, docs remain compact, ECL/template/review evidence are aligned, and product tests are not required for this Markdown/template/index-only change.

## Verification

Passed:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
- Placeholder and stale active-none drift checks across `AGENTS.md`, `docs/STATUS.md`, and active `spec.md` / `plan.md` / `tasks.md`.
- `rg -n -e 'selected verification scope' -e 'Full / aggregate suites' -e 'Use `test:fast`' -e 'Use full `npm run test`' -e 'Review verification evidence must name' AGENTS.md docs/ECL.md docs/STATUS.md harness/templates/change/reviews/review.md`

- Selected verification scope: Harness/rule/template documentation checks and targeted drift greps.
- Full / aggregate suites run or skipped: skipped full `npm run test`, full `npm run test:workbench`, slow Workbench suites, typecheck, lint, and build.
- Rationale for selected scope: this change modifies tracked Markdown handoff/rule/template files and the generated Harness index only. It does not modify product source, package scripts, tests, runtime behavior, Workbench behavior, gates, validation/audit code, scheduler, Goal Loop, or remote/source-apply paths.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: plan review subagent `019ee223-7a6a-7b82-a10d-08ae23e7e9a0` returned PASS before ECL creation and noted template alignment if ECL guidance changes.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, `docs/ECL.md`, `harness/templates/change/reviews/review.md`, and this active change.
- If applicable, before/after line counts: `AGENTS.md` 101 -> 108, `docs/STATUS.md` 110 -> 113, `docs/ECL.md` 293 -> 294, review template 122 -> 126.
- If applicable, duplicate current-state fields checked: active change path and active product phase are aligned between `AGENTS.md` and `docs/STATUS.md`; pending evolution remains none.
- If applicable, roadmap/current-direction stale language checked: no roadmap docs were changed; touched handoff docs do not add phase archive narrative.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: merged current validation-scope practice into reusable guidance; no archive ledger content copied forward.
- If applicable, over-budget documents and rationale: none; touched current docs remain under the ECL budget.
- If applicable, tested with: ECL lint, encoding lint, status, reindex, evolve check, and targeted drift greps.
- If not applicable, reason: not applicable.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: yes.
- If applicable, promote decisions: targeted verification scope is promoted into ECL review guidance and review template fields.
- If applicable, retain decisions: full `npm run test` remains retained as the broad-risk/release gate.
- If applicable, merge decisions: existing test-script layering practice is merged into one short rule instead of repeated per-phase explanations.
- If applicable, retire decisions: default-full-test implication in `AGENTS.md` Product verification is retired.
- If applicable, archive-only decisions: historical reasons for Workbench test splits remain in archived summaries and are not copied forward.
- If applicable, noop / no-change rationale after old-experience scan: not applicable.
- If applicable, tested with: ECL lint, documentation drift grep, and handoff status check.
- If not applicable, reason: not applicable.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect worktree-backed diff behavior.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: no.
- If applicable, checked scope: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect derived read models, approval inboxes, thread/run projections, role summaries, or Harness gap reports.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: no.
- If applicable, checked target ids: not applicable.
- If applicable, tested action path: not applicable.
- If applicable, duplicate action/evidence affordance check: not applicable.
- If not applicable, reason: change does not add or change Workbench live/server UI actions that depend on explicit target ids.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: no.
- If applicable, checked source project / fixture: not applicable.
- If applicable, checked worktree ids / result ids / integration check ids: not applicable.
- If applicable, source-root mutation gate checked: not applicable.
- If applicable, out-of-scope source mutation check: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect result review, worktrees, apply/discard flows, source refresh rework, integration checks, multi-demand confirmation, or source-root apply handoff.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: no.
- If applicable, checked boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect external executors, Codex bridge integration, SQLite stores, Topic sessions, prompt stack composition, AHO-managed skills, or runtime projections.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: no.
- If applicable, artifact type and authority classification: not applicable.
- If applicable, boundary matrix checked: not applicable.
- If applicable, out-of-scope execution paths checked: not applicable.
- If applicable, stale/forged target behavior checked: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not introduce or change planning proposals, decomposition plans, readiness manifests, workflow plans, recovery material, scheduler-readiness artifacts, or similar proposal/runtime boundary artifacts.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: no.
- If applicable, persistent Goal/Change scope checked: not applicable.
- If applicable, recommendation authority checked: not applicable.
- If applicable, fallback priority checked: not applicable.
- If applicable, packet / main-Agent context freshness checked: not applicable.
- If applicable, stale or superseded packet suppression checked: not applicable.
- If applicable, feedback selected Change / packet lineage / visible gate scope checked: not applicable.
- If applicable, feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: not applicable.
- If applicable, feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: not applicable.
- If applicable, hidden execution / source mutation check: not applicable.
- If applicable, ToolPolicyGate / human gate preservation checked: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not add or change GoalLoopDecision policy, goal-loop confirmation surfaces, autonomous loop behavior, or conflict-aware continuation behavior.

## Module Boundary Coverage

- Module boundary coverage applicable: no.
- Future feature owner module: not applicable.
- If applicable, module owners checked: not applicable.
- If applicable, moved responsibilities: not applicable.
- If applicable, retained facade responsibilities: not applicable.
- If applicable, forbidden write-back locations: not applicable.
- If applicable, compatibility surface: not applicable.
- If applicable, behavior path tested: not applicable.
- If applicable, follow-up split candidates: not applicable.
- If applicable, boundary tests or lint checks: not applicable.
- If applicable, compatibility result: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not add or change Workbench action execution, projections, runtime services, frontend panels, typed workflow artifacts, or cross-module workflow state; forbidden write-back locations stayed untouched.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes for Harness/rule reuse, not product runtime reuse.
- If applicable, existing mechanisms reused or strengthened: existing npm script layers, ECL verification evidence, review template, Documentation Entropy Coverage, and Harness lifecycle checks.
- If applicable, new cross-cutting mechanism and owner: not applicable.
- If applicable, why existing mechanisms were insufficient: no new mechanism was introduced; existing guidance was aligned.
- If applicable, domain-specific logic location: not applicable.
- If applicable, shared cross-cutting logic location: `docs/ECL.md` and `harness/templates/change/reviews/review.md`.
- If applicable, local framework / state machine / projection / validation / gate avoided: no per-feature validation framework or new test runner was introduced.
- If applicable, public API / facade / Workbench compatibility result: not applicable.
- If applicable, future-cost reduction result: future agents can record narrower verification evidence without rediscovering the same full-test tradeoff.
- If applicable, tested with: Harness checks and targeted drift greps.
- If not applicable, reason: product-code reuse coverage is not applicable because no product feature path, artifact family, state transition, projection, validation/safety gate, ledger event, maintenance record, or cross-module protocol changed.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, active change files.
- If applicable, stale active-path / phase grep: checked for stale active-none wording in touched handoff files.
- If applicable, latest archive / active path alignment: active path aligned in `AGENTS.md` and `docs/STATUS.md`; latest archive pointers remain the previous closed product/evolution changes until this change closes.
- If applicable, pending evolution state checked: `scripts/harness-evolve.ps1 check` reports no pending evolution.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
