# workbench-reference-style-slash-skill-composer-v1

## Purpose

Implement reference-style Skill selection in the Workbench composer. Users can
type `/skill-name` or `$skill-name`, see real scanned Skills, select a Skill,
and send a cleaned demand/message while the Skill is enabled for the current
topic.

The change keeps Skill as an agent runtime capability. It does not change
Harness workflow truth, confirmation gates, Goal Loop, Scheduler, validation,
audit, apply/close, remote, merge, PR, or Harness evolution behavior.

## Scope

In scope:

- `/` and `$` Skill autocomplete in the home and topic composers.
- Inline Skill token parsing, cleanup, de-duplication, and stable topic
  enablement.
- Draft Skill selection migration to the newly created topic.
- Composer chips / sync state for real scanned Skills.
- Tests covering parser behavior, DOM behavior, Skill bridge, Workbench server,
  and Codex diagnostics boundaries.

Out of scope:

- Full slash-command system, file references, attachments, marketplace, fake
  provider/model controls, and ordinary Agent mode.
- Direct execution of Skill scripts by AHO.
- Any change to workflow authority, source mutation, apply/close, Scheduler,
  remote, merge, PR, or Harness evolution.

## Current Status

Completed / ready to close.

## Verification

- `npx vitest run tests/unit/skill-mentions.test.ts --reporter=dot` passed.
- `npx vitest run tests/unit/web-app.test.tsx -t "slash Skill|dollar Skill" --reporter=dot` passed after tightening DOM queries to the real composer textbox.
- `npx vitest run tests/unit/skill-mentions.test.ts tests/unit/web-app.test.tsx tests/unit/skill-bridge.test.ts tests/unit/workbench-server.test.ts tests/unit/codex.test.ts --reporter=dot` passed: 5 files, 105 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed: 64 files, 600 tests.
- `npm run build` passed.
- `npm run test:workbench` passed: 9 files, 138 tests.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.

