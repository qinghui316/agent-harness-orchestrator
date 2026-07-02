# main-agent-child-agent-workspace-flow-v2

## Purpose

Repair the Workbench main-agent / child-agent interaction flow so planning and role agents are visible as scoped child-agent workspaces instead of long synthetic plan text in the main conversation or ordinary confirmation cards.

The target UX is: user talks to the main Agent, the main Agent delegates to a bounded child Agent, the child Agent status/output appears in a reusable right-side Agent workspace, and the main Agent receives the final child result before continuing through existing Harness gates.

## Scope

In scope:

- Reuse the existing transcript cell renderer for both the main Agent conversation and the right-side child Agent workspace.
- Add an `Agent` right-rail workspace for planning-agent and other role-agent projections.
- Move planning draft review/revision/implementation affordances from the main conversation / ordinary confirmation queue into the planning-agent workspace.
- Keep `planning.confirm-execution` as the backend canonical promotion action behind the user-facing "实施此计划" affordance.
- Update Workbench docs and tests to reflect the child-agent workspace model.

Out of scope:

- No new workflow truth, runner, controller, action type, automation allowlist, ToolPolicy authority, Scheduler authority, IntegrationCheck authority, apply/close authority, remote/PR/merge authority, or Harness evolution authority.
- No ordinary Agent mode.
- No fake child-agent conversations or synthetic assistant prose.
- No deletion of existing canonical planning/action owners.

## Current Status

Completed.

## Verification

Passed:

- `npx tsc --noEmit --pretty false`
- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx tests/unit/workbench-module-boundaries.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts`
- `npx vitest run tests/unit/workbench-demand-worker.test.ts tests/unit/workbench-planning-scheduler-prep.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:workbench`
- `npm run test:fast`
- `npm run build`
- Mojibake marker scan over `src docs harness AGENTS.md` returned no matches.

Harness checks are recorded in `reviews/review.md`.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: in-app browser control could not discover the user's already-open tab; a new in-app browser tab could open the local App and verify the right Agent workspace entry/panel without creating more conversations. Full fresh-demand real Codex acceptance is not claimed.
- Screenshots / artifacts / run ids: browser DOM snapshot showed `right-tool-launcher-agent` and `agent-workspace-panel` visible in the local App.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: no fake Codex, mocked binary, hand-written run artifact, or direct manager write was used for acceptance.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable because this change updates Workbench current interaction docs and handoff files.
- Experience lifecycle result: old planning-as-main-transcript / ordinary planning-confirmation-card experience is retired from the current Workbench surface.
- Roadmap/current-direction stale language check: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, and `docs/WORKBENCH.md` were updated for the active child-agent workspace flow.
- Old experience retained / merged / retired / archive-only: planning backend action ids and canonical artifact promotion are retained; visible planning review moves to the Agent workspace.
