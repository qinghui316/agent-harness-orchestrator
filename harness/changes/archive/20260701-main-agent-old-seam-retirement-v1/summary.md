# main-agent-old-seam-retirement-v1

## Purpose

Retire only safe old seams left after the main-agent architecture migration,
using an inventory-backed cleanup instead of deleting by name.

This V1 does not rename public action ids or remove live Workbench read-model
fields. It classifies old seams as dead, live compatibility, live boundary, or
rename-only, then makes only safe label/test cleanup so future V2 work can
remove compatibility surfaces deliberately.

## Scope

In scope:

- Record the seam inventory and classification.
- Keep negative boundary coverage for retired production entrypoints.
- Update safe user-visible labels that still say "role pipeline".
- Confirm live seams that must remain for now: `role.pipeline.*`,
  `rolePipeline`, and `MainAgentLoopProjection`.

Out of scope:

- Renaming or deleting `role.pipeline.*` action ids.
- Removing the `rolePipeline` Workpad read-model field.
- Removing `MainAgentLoopProjection`.
- Changing Scheduler runtime, IntegrationCheck, confirmationQueue, action
  revalidation, automation allowlist, apply/close, remote, PR, merge, or
  Harness evolution authority.

## Current Status

Completed.

## Verification

- `npx vitest run tests/unit/workbench-module-boundaries.test.ts tests/unit/web-app.test.tsx tests/unit/workbench-read-model.test.ts tests/unit/orchestration-engine.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts`
  - First run had one transient `web-app` overlay lookup failure; the single
    test passed on immediate rerun, and the full targeted command then passed:
    6 files, 210 tests.
- `npx vitest run tests/unit/web-app.test.tsx --testNamePattern "keeps the Agent orchestration map usable while the confirmation rail is collapsed"`
- Mojibake marker scan over touched source, test, active change, and handoff
  files.
  - No matches.
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
  - 77 files, 739 tests.
- `npm run build`
  - Passed with existing Vite chunk-size warning.
- Harness checks pending final closeout.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: subagent Beauvoir reviewed the plan
  and recommended revising it to distinguish dead legacy names from live
  compatibility/action/read-model surfaces before implementation.
- Retries or environment failures: first full targeted Vitest run hit one
  transient `web-app` overlay lookup failure; immediate single-test rerun and
  full targeted rerun both passed.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable; this change reduces old current
  user-surface terminology without rewriting archive history or expanding
  current handoff docs beyond the active change pointer.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: active path and next
  architecture step will be aligned during closeout.
- Old experience retained / merged / retired / archive-only: retired visible
  "角色流水线" / "Role orchestration" wording; retained `role.pipeline.*`,
  `rolePipeline`, and `MainAgentLoopProjection` as live compatibility /
  boundary seams for V2.

