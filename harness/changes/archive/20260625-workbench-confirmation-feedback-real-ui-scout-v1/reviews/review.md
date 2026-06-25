# Review: workbench-confirmation-feedback-real-ui-scout-v1

Status: approved.

## Findings

No unresolved findings.

Resolved product blocker:

- The real UI scout found that after result/apply feedback triggered bounded rework and the new audit blocked, an older approved worktree apply approval could still become the current primary gate. This was a Workbench projection bug, not a feedback routing failure. Fixed in `src/workbench/projections/read-model/decision-inspector.ts` by demoting same-Change `worktree-apply` approvals to history when a current validation/audit blocker exists.

## Verification

- Selected verification scope: real UI scout plus touched Workbench projection / DOM / action revalidation suites and required product gates.
- Targeted: `npx vitest run tests/unit/workbench-read-model.test.ts`
- Targeted: `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx tests/unit/action-revalidation.test.ts`
- Product: `npm run typecheck`
- Product: `npm run lint`
- Product: `npm run test:fast`
- Product: `npm run build`
- Product aggregate: `npm run test:workbench`
- Full / release suites skipped: this change touched Workbench read-model projection only. The daily Workbench aggregate and targeted DOM/revalidation coverage directly cover the changed boundary; slow scheduler/release paths are unrelated.

## Complexity Deletion Review

- delete: stale same-Change apply visibility was removed from the current decision surface when a current blocker exists.
- reuse: reused existing `decision-inspector`, `confirmationQueue`, result-review blocker classification, and current Workbench approval projection.
- yagni: avoided feedback runtime, permission system, projection framework, workflow engine, evidence family, and apply-handler changes.
- shrink: fixed the shared projection selection root instead of adding a local UI guard or special case in feedback routing.
- net: Lean already.

## Acceptance Feedback

- Real/manual acceptance performed: yes, through real Workbench browser UI at `http://127.0.0.1:4331/`.
- Real Codex acceptance claimed: yes for the rework/code paths in the external sandbox.
- Fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: real `coder-codex` runs produced artifacts under `E:\aho-accept\confirmation-feedback-scout-v1\home\projects\confirmation-feedback-scout-v1\runs\...`; no fake binary, mocked PATH, fixture result, or hand-written run artifact was used.
- Manual config edits: none during this change.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: the UI direct-project initial page needed `刷新项目` even though `/api/projects` was ready; recorded as non-blocking UI hydration polish.
- Screenshots / artifacts / run ids: plan revise action `action-1782394304381-00831c`; original coder `run-20260625-213641-src-message-js-greeting-hi-4679f8`; rework coder `run-20260625-213748-src-message-js-greeting-hi-bde346`; validation `run-20260625-213859-src-message-js-greeting-hi-3e7ba8`; blocked audit `run-20260625-213901-src-message-js-greeting-hi-cd3dce`.
- External source/state safety: source `E:\aho-accept\confirmation-feedback-scout-v1\src`; runtime home `E:\aho-accept\confirmation-feedback-scout-v1\home`; source root `git status --short` was clean before result/apply feedback and remained clean after rework/audit blocker. No apply was executed.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: fixed stale older apply primary after blocked rework audit.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes for close/handoff updates.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Before line counts: `AGENTS.md` 182, `docs/STATUS.md` 207, `docs/CURRENT-DEVELOPMENT-PLAN.md` 267.
- Duplicate current-state fields checked: active change, pending evolution, latest product change, latest real UI feedback scout.
- Roadmap/current-direction stale language checked: next product direction should point to this scout after close and should not claim confirmation feedback real UI had passed before this change.
- Archive-ledger content promoted / retained / merged / retired / archive-only: detailed run ids and sandbox evidence remain in this archived summary/review; handoff docs get only the compact current baseline delta.
- Over-budget documents and rationale: `AGENTS.md` remains near the target handoff-map size; `STATUS.md` and current plan remain longer current-roadmap summaries.
- Tested with: Harness lint and drift grep during closeout.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: no.
- If not applicable, reason: this is not an auto-evolve, Harness rule/template, or stable-memory change.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If not applicable, reason: the fix does not affect worktree diff collection; the real scout used existing diff-producing worktrees as acceptance evidence.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- Checked scope: same selected Change with a current audit blocker and an older worktree apply approval.
- Result: current primary gate is the audit blocker request-changes path; stale same-Change apply approval is not primary or related.
- Tested with: updated `tests/unit/workbench-read-model.test.ts`, targeted read-model suite, and real browser UI after rebuild.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Sampled surface: right confirmation queue / decision panel for plan-confirm feedback and result/apply feedback.
- Visible primary UI backed by implemented workflow paths: plan feedback triggered `planning.revise`; result feedback triggered `result.refresh-rework`; blocked audit showed `要求修改` / `重新审查`.
- Authoritative primary-surface alignment: after the fix, the visible primary gate no longer showed stale `result.apply` when latest audit evidence was blocked.
- Stale-history override checked: older apply approval is demoted to history under the current selected Change blocker.
- Out-of-scope future capability check: no new full-auto, scheduler loop, parallel executor, remote, merge, or Harness evolution affordance was added.
- Duplicate primary action / in-flight suppression check: real UI showed one current primary gate per stage.
- High-impact action path result: source apply was not executed during feedback scout.
- Real App DOM / browser UI verification result: passed after rebuild and server restart; UI displayed `审查未通过，需要修改或补证据` with no stale apply primary.
- Tested with: real browser UI, `tests/unit/web-app.test.tsx`, `tests/unit/workbench-read-model.test.ts`.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes.
- Checked target ids: current Change `src-message-js-greeting-hi`, planning bundle id in plan feedback, result worktree ids in apply/rework feedback.
- Tested action path: real UI plan feedback -> `planning.revise`; real UI result feedback -> `result.refresh-rework`.
- Duplicate action/evidence affordance check: after fix, old apply approval did not remain alongside the current audit blocker as a primary/related current action.

## Transcript Renderer Source-Boundary Coverage

- Transcript renderer source-boundary coverage applicable: no.
- If not applicable, reason: change does not alter the default Workbench transcript renderer.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: yes.
- Checked source project / fixture: `E:\aho-accept\confirmation-feedback-scout-v1\src`.
- Checked runtime home / external managed-project isolation: `E:\aho-accept\confirmation-feedback-scout-v1\home`.
- Checked worktree ids / result ids: original coder worktree and rework worktree remained AHO-owned worktree candidates; source root was not mutated.
- Source-root mutation gate checked: feedback did not apply source root; result apply gate was not executed.
- Out-of-scope source mutation check: `git status --short` in the external source was clean before and after feedback/rework.
- Tested with: real UI scout and external source `git status --short`.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: yes.
- Checked boundary: Codex runs remained worktree runtime evidence; Workbench projection selected gates from Harness artifacts and audit/validation evidence, not from Codex session state or UI state.
- Tested with: real `coder-codex` run artifacts and Workbench projection tests.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes.
- Artifact type and authority classification: plan drafts are proposals; feedback is scoped evidence; canonical plan artifacts are written only after user confirmation; rework output is candidate worktree evidence; audit blocked evidence is not approval.
- Boundary matrix checked: plan feedback did not accept canonical planning artifacts; result feedback did not apply source; blocked audit prevented current apply primary after the fix.
- Out-of-scope execution paths checked: no remote, merge, PR, Harness evolution, full parallel executor, or scheduler loop behavior was added.
- Stale/forged target behavior checked: covered by existing action revalidation suite and real current-gate routing.
- Tested with: real UI scout and targeted suites.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: no.
- If not applicable, reason: change does not add or change GoalLoopDecision policy, goal-loop confirmation surfaces, autonomous loop behavior, or conflict-aware continuation behavior.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Owner module: `src/workbench/projections/read-model/decision-inspector.ts`.
- Moved responsibilities: none.
- Retained facade responsibilities: none changed.
- Forbidden write-back locations: feedback routing, apply handler, automation runtime, and UI-local guards were not used for the projection fix.
- Compatibility surface: Workbench confirmation queue and decision inspector shapes unchanged.
- Behavior path tested: blocked audit plus older apply approval.
- Follow-up split candidates: none.
- Compatibility result: no API or UI contract shape change.
- Tested with: targeted read-model and Workbench aggregate suites.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- Existing mechanisms reused or strengthened: decision inspector blocker priority and confirmation queue derivation.
- New cross-cutting mechanism and owner: none.
- Why existing mechanisms were insufficient: existing mechanism was sufficient; it needed one same-Change stale apply demotion.
- Domain-specific logic location: Workbench read-model projection.
- Shared cross-cutting logic location: existing action revalidation and apply source safety remain unchanged.
- Local framework / state machine / projection / validation / gate avoided: all avoided.
- Public API / facade / Workbench compatibility result: compatible.
- Future-cost reduction result: stale current-action issues are handled at the shared projection owner rather than per-button UI code.
- Tested with: targeted suites and real UI.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Stale active-path / phase grep: checked during closeout.
- Latest archive / active path alignment: to be finalized by `harness-change close`.
- Pending evolution state checked: no pending evolution before this change.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
