# workbench-codex-plan-mode-post-plan-local-autonomy-v1

## Purpose

Use Codex Plan Mode as the Workbench planning proposal source while keeping AHO's accepted planning artifacts, stale-target checks, and local scoped automation as the authority boundary.

Users still manually confirm the plan. The plan confirmation card offers two execution modes: `请求批准` keeps step-by-step gates after confirmation, while `完全访问权限` records a current-Change scoped authorization and starts the existing local automation runtime only after canonical planning artifacts are written.

## Scope

In scope:

- Prefer Codex native app-server Plan Mode for `planning.generate` / `planning.revise` when available.
- Fall back to a prompt-level `<proposed_plan>...</proposed_plan>` contract when native Plan Mode is unavailable.
- Store proposal metadata on `PlanningArtifactBundle` without replacing existing required planning fields.
- Add a minimal proposed-plan parser for block extraction, stripped prose, and lightweight heading detection.
- Show both execution modes on the planning confirmation card.
- Submit `planning.confirm-execution` for both modes, with `postPlanAutomationMode` included.
- Start existing post-plan scoped local automation internally only after plan confirmation succeeds and fresh gate revalidation passes.

Out of scope:

- New workflow runtime, permission system, planner framework, projection system, or evidence family.
- Automatic planning confirmation.
- Raw `planning.scheduler.*` automation, integration apply/discard automation, remote/merge/PR automation, or Harness evolution automation.
- Full parallel executor, scheduler loop, slot allocator, or automatic child Change creation.

## Current Status

Completed / ready to close.

## Verification

Passed:

- `npx vitest run tests/unit/project-git.test.ts tests/unit/proposed-plan.test.ts tests/unit/automation-runtime.test.ts tests/unit/workbench-live-actions.test.ts tests/unit/workbench-planning-scheduler-prep.test.ts`
- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx tests/unit/automation-runtime.test.ts tests/unit/project-git.test.ts tests/unit/proposed-plan.test.ts tests/unit/workbench-live-actions.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm run lint`
- `npm run test:fast`
- `npm run test:workbench`

Real acceptance:

- External sandbox: `E:\aho-accept\codex-plan-post-auto-v1-clean4\src`
- Runtime home: `E:\aho-accept\codex-plan-post-auto-v1-clean4\home`
- Workbench URL: `http://127.0.0.1:4336`
- Demand/change: `add-salute-function`
- Proposed plan run: `run-20260625-192149-add-salute-function-a8aae6`
- Planning mode recorded: `prompt-plan-contract`. Native app-server Plan Mode did not emit native plan deltas in this environment, but the prompt-level `<proposed_plan>` contract produced the plan artifact.
- Post-plan automation run: `automation-run-20260625112252-86097123`, completed `planning.decompose -> planning.decomposition.confirm -> planning.decomposition.assess-readiness -> code.run -> audit.accept -> result.apply`, then stopped at unsupported local landing preflight.
- Final close automation run: `automation-run-20260625113056-fda1b6bd`, completed `change.close` and stopped with `no-primary-gate` / `Local close completed; no further local automation gate remains.`
- Archive path: `harness/changes/archive/20260625-add-salute-function`
- Source apply commit in sandbox: `fc35509 Apply AHO result: add-salute-function`
- No remote, merge, PR, integration apply/discard, or Harness evolution action was executed automatically.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures:
  - Initial app-server Plan Mode payloads proved that native collaboration mode requires a non-empty configured `settings.model`; AHO now reads the current Codex config model and falls back to prompt-level plan contract when native deltas are unavailable.
  - Initial automation runs exposed a 10s current-gate snapshot timeout and AHO-owned repo-local memory files being treated as dirty source; both were fixed.
  - Close projection initially showed stale archived-topic gates; archived selected topics now suppress executable primary gates.
- Screenshots / artifacts / run ids: see verification run ids above.
- External source/state safety: E-drive sandboxes only; no C-drive acceptance directory used.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: clean4 acceptance required a final close automation trigger after the main post-plan run stopped at `landing.prepare`; this is expected because local autonomy V1 does not execute landing/PR gates. Once close readiness was corrected, `change.close` was visible and automation completed it.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: close/handoff pending.
- Experience lifecycle result: not applicable; this is not Harness evolution.
- Roadmap/current-direction stale language check: close/handoff only.
- Old experience retained / merged / retired / archive-only: not applicable.
