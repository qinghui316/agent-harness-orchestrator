# Review: workflow-result-summary-thread-visibility

Status: approved-with-notes.

## Findings

- P2: Parent transcript projection still relies on the upstream thread-stream rule that only terminal workflow entries synthesize workflow prose from `resultSummary`. A targeted regression test now confirms running workflow fallback copy stays out of the parent transcript. No close blocker remains.

## Verification

Passed.

- Selected verification scope: Workbench action service, Workbench thread read model, parent-agent transcript projection, Web App DOM render path, typecheck, lint, ECL, encoding, reindex, and Harness evolution check.
- Full / aggregate suites run or skipped: Full `npm run test` and `npm run build` skipped because this bounded slice changes Workbench projection/display paths rather than shared runtime, CLI integration, or release packaging. Targeted Workbench/UI suites cover the touched behavior.
- Rationale for selected scope: action service tests cover summary reuse and safe failure display; read-model tests cover terminal summary visibility, old-entry fallback, parent transcript visibility, running-workflow exclusion, and internal-term leakage; Web App DOM test renders the actual App against the snapshot/transcript shape used by the UI.

Commands and outcomes:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 preflight` - passed before creating the change.
- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/workbench-action-service.test.ts tests/unit/workbench-action-results.test.ts` - passed.
- `npx vitest run tests/unit/web-app.test.tsx` - passed.
- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx tests/unit/workbench-action-service.test.ts tests/unit/workbench-action-results.test.ts` - passed after parent-transcript coverage.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed after active handoff alignment.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed; no pending evolution.

## Acceptance Feedback

- Real/manual acceptance performed: no browser manual session.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user explicitly required real UI validation for product UI work. This slice used the actual Web App DOM render test because the changed UI path is snapshot/transcript rendering; a stable browser session would need built static assets plus a managed project seed and was not necessary to prove this rendering boundary.
- Retries or environment failures: initial Web App DOM test failed because the main conversation renders `parentAgentTranscript`, not raw `center.thread.items`; implementation was corrected to project workflow result summary into the parent transcript.
- Screenshots / artifacts / run ids: no screenshot. Test evidence: `tests/unit/web-app.test.tsx` now renders the workflow result summary in `.timeline-panel`.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: consider a reusable Workbench browser fixture/seed later so UI-affecting slices can run browser validation without ad hoc setup.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`.
- If applicable, before/after line counts: not recorded; edits were current-handoff pointer updates only.
- If applicable, duplicate current-state fields checked: yes; active change/product phase/status now point to the active change while it remains open.
- If applicable, roadmap/current-direction stale language checked: yes; no roadmap expansion was added.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: no archive history promoted.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`.
- If not applicable, reason: not applicable.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: no.
- If applicable, promote decisions: not applicable.
- If applicable, retain decisions: not applicable.
- If applicable, merge decisions: not applicable.
- If applicable, retire decisions: not applicable.
- If applicable, archive-only decisions: not applicable.
- If applicable, noop / no-change rationale after old-experience scan: not applicable.
- If applicable, tested with: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`.
- If not applicable, reason: no Harness evolution, rule/template, or experience lifecycle change was made.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect worktree-backed diff behavior.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- If applicable, checked scope: terminal workflow summary projection into thread items, workflow evidence body, parent-agent transcript cells, and legacy fallback for entries without `resultSummary`.
- If applicable, tested with: `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx`.
- If not applicable, reason: not applicable.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- If applicable, sampled surface: Workbench main conversation/timeline via parent-agent transcript and `.timeline-panel`.
- If applicable, visible primary UI backed by implemented workflow paths: yes; `resultSummary` comes from the existing action result summarizer and terminal workflow thread entry.
- If applicable, out-of-scope future capability check: no continuation, scheduler loop, whole-wave dispatch, apply, close, merge, or Harness evolution automation was added.
- If applicable, forbidden visible internal terms/actions checked: yes; tests assert absence of `derived-non-executing-workbench-handoff`, `artifactHash`, `preflight id`, and controlled-loop internal capability terms.
- If applicable, duplicate primary action check: not applicable; no actions were added.
- If applicable, high-impact action path result: unchanged; this is display projection only.
- If applicable, tested with: `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx`.
- If not applicable, reason: not applicable.

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

- Goal Loop boundary coverage applicable: yes.
- If applicable, persistent Goal/Change scope checked: yes; `resultSummary` is display-only and scoped to terminal Workbench workflow entries.
- If applicable, recommendation authority checked: yes; no Goal Loop decision authority changed.
- If applicable, fallback priority checked: not applicable.
- If applicable, packet / main-Agent context freshness checked: not applicable.
- If applicable, stale or superseded packet suppression checked: not applicable.
- If applicable, feedback selected Change / packet lineage / visible gate scope checked: not applicable.
- If applicable, feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: not applicable.
- If applicable, feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: not applicable.
- If applicable, hidden execution / source mutation check: yes; no execution or source mutation path was added.
- If applicable, ToolPolicyGate / human gate preservation checked: yes; no gate logic changed.
- If applicable, tested with: targeted read-model/action tests and code review.
- If not applicable, reason: not applicable.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: Workbench action service and Workbench read-model/projection modules.
- If applicable, module owners checked: yes.
- If applicable, moved responsibilities: terminal workflow entries may carry one display summary; thread stream and parent transcript project it for UI display.
- If applicable, retained facade responsibilities: no facade expansion.
- If applicable, forbidden write-back locations: scheduler runtime, Goal Loop policy, ToolPolicyGate, validation/audit, IntegrationCheck, apply/close gates, and accepted artifacts were not touched.
- If applicable, compatibility surface: `TopicThreadEntry.resultSummary?` and web `TopicMessageEntry.resultSummary?` are optional.
- If applicable, behavior path tested: summary capture, thread projection, parent transcript projection, App DOM render.
- If applicable, follow-up split candidates: reusable browser UI fixture/seed; broader Workbench test architecture split remains out of scope.
- If applicable, boundary tests or lint checks: targeted vitest files, typecheck, lint.
- If applicable, compatibility result: old entries without `resultSummary` still render existing fallback copy.
- If applicable, tested with: `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/workbench-action-service.test.ts tests/unit/web-app.test.tsx`.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: action result summarizers, terminal workflow thread entries, thread read-model projection, parent-agent transcript projection, and existing App rendering.
- If applicable, new cross-cutting mechanism and owner: none.
- If applicable, why existing mechanisms were insufficient: not applicable.
- If applicable, domain-specific logic location: controlled Scheduler handoff wording remains in action result/controlled scheduler modules.
- If applicable, shared cross-cutting logic location: display preference stays in read-model/projection code.
- If applicable, local framework / state machine / projection / validation / gate avoided: no new state machine, gate, evidence truth, report layer, or scheduler loop.
- If applicable, public API / facade / Workbench compatibility result: optional fields preserve compatibility.
- If applicable, future-cost reduction result: future workflow actions can surface existing summaries through the same field rather than adding per-action UI projection rules.
- If applicable, tested with: targeted service/read-model/Web App tests.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`.
- If applicable, stale active-path / phase grep: checked through ECL lint while active; final close will update to archived path.
- If applicable, latest archive / active path alignment: active alignment passed before close.
- If applicable, pending evolution state checked: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` returned no pending evolution.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
