# Spec: workbench-helper-boundaries-test-suite-split

## Goal

Reduce Workbench helper-test iteration cost by moving pure helper boundary assertions from the broad module-boundary suite into a small dedicated helper-boundary suite.

## Users

- Future AHO developers changing small Workbench helper modules.
- Reviewers checking Architecture Growth Control / Core Mechanism Reuse helper ownership.

## Acceptance Criteria

- AC-001: A new `tests/unit/workbench-helper-boundaries.test.ts` suite owns pure helper boundary tests for projection summary helpers, read-model evidence action/ref helpers, landing artifact selection, and active-target helper behavior.
- AC-002: `tests/unit/workbench-module-boundaries.test.ts` retains broad module/facade/wiring coverage and no longer duplicates the moved pure helper assertions.
- AC-003: Product source, Workbench behavior, action ids, human gates, ToolPolicy, scheduler, Goal Loop, landing, remote handoff, source apply, maintenance, and package scripts remain unchanged.
- AC-004: Targeted verification proves both the new helper suite and the remaining module-boundary suite pass, and `npm run test:fast` naturally includes the new unit test without script changes.

## Non-Goals

- Do not change product runtime or Workbench behavior.
- Do not change `package.json` scripts.
- Do not migrate the long action boundary wiring assertions from `workbench-module-boundaries.test.ts`.
- Do not reorganize all Workbench tests in one phase.

## Constraints

- Keep test movement mechanical and coverage-preserving.
- The new suite should import only the helper modules it tests.
- The broad module-boundary suite should keep legacy facade/export compatibility and cross-module wiring checks.
- Full `npm run test` and full `npm run test:workbench` are not required unless product runtime or package scripts change.

## Risks

- Accidentally moving cross-module wiring assertions into the helper suite would make the new suite too broad.
- Removing helper assertions without re-adding them would create a coverage gap.
- Changing imports carelessly could make `test:fast` slower instead of faster.

