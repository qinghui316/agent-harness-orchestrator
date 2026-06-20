# workbench-read-model-evidence-action-helper-reuse

## Purpose

Converge duplicated Workbench read-model evidence action construction into a single read-model owner helper. Decision inspector and confirmation queue projections currently build the same "view evidence" action shape in multiple places, including a local helper inside `decision-inspector.ts` and repeated optional-artifact checks in confirmation surfaces.

This change strengthens the Workbench projection layer without changing runtime action execution, approval semantics, human gates, source apply, remote landing, Goal Loop, or Scheduler authority.

## Scope

In scope:

- Add a read-model owned evidence action helper at `src/workbench/projections/read-model/evidence-actions.ts`.
- Reuse that helper from `decision-inspector.ts` and touched confirmation projection modules.
- Preserve evidence action shape, labels, ids, and optional-artifact behavior.
- Add focused boundary/unit coverage for helper ownership and behavior preservation.

Out of scope:

- Runtime action handlers, server endpoints, approval command execution, ToolPolicyGate, human-gate semantics, source apply, remote landing, Goal Loop, Scheduler, and reference project runtime behavior.
- Broad landing or integration confirmation refactors beyond replacing duplicated evidence action construction.

## Current Status

Ready to close.

## Verification

- `npx vitest run tests\unit\workbench-module-boundaries.test.ts` - passed.
- `npx vitest run tests\unit\workbench-read-model.test.ts` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run build` - passed.
- `npx vitest run tests\slow\workbench-apply-integration-flow.test.ts -t "projects multiple ready results into a confirmation queue integration check"` - passed.
- `npx vitest run tests\slow\workbench-remote-landing-flow.test.ts -t "prepares a local landing package after apply without committing, pushing, or creating PR controls"` - passed.
- `npx vitest run tests\unit\web-app.test.tsx -t "shows a blocked queue as the primary decision instead of a generic approval list"` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1` - passed after active handoff alignment.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: close-ready subagent review initially found handoff alignment and untracked-helper close blockers; handoff files were aligned to the active change and the helper file will be included in the final staged diff while unrelated `README.md` remains out of scope.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
