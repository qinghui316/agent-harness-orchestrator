# workbench-orchestration-map-real-ui-and-collapsible-confirmation-rail-v1

## Purpose

Complete the real-browser acceptance gap for the Rudder-style `Agent 编排图`
and make the Workbench right confirmation surface default to a compact
Codex-style rail. The collapsed rail keeps the authoritative confirmation
signal visible through an icon, count badge, and primary-gate emphasis while
giving the center conversation/workbench/graph area more width.

## Scope

In scope:

- Add a frontend-only `DecisionPaneShell` around the existing
  `DecisionInspectorPane`.
- Default the right decision surface to a 48px collapsed rail and allow manual
  expansion back to the existing confirmation pane.
- Keep confirmation buttons mounted only in the expanded inspector.
- Verify that `Agent 编排图` still renders with the rail collapsed.
- Capture real in-app browser screenshots from a fresh built Workbench process.

Out of scope:

- No confirmation queue, action revalidation, apply/close, scheduler,
  automation, remote, merge, PR, Harness evolution, or workflow truth changes.
- No persisted collapsed-state preference.
- No new projection framework, permission system, workflow runtime, database,
  or action path.

## Current Status

Completed / ready to close.

## Verification

- `npx vitest run tests/unit/web-app.test.tsx --reporter=basic` - passed.
- `npx vitest run tests/unit/agent-orchestration-layout.test.ts tests/unit/workbench-run-graph-projection.test.ts --reporter=basic` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed.
- `npm run build` - passed.
- `npm run test:workbench` - passed.
- Harness checks recorded in `reviews/review.md`.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: existing old E-drive sandboxes restored as
  projects but did not contain Workbench topics; a fresh E-drive sandbox was
  created for this visual acceptance.
- Screenshots / artifacts / run ids:
  - Workbench URL: `http://127.0.0.1:4363/`.
  - Source: `E:\aho-accept\orchestration-map-ui-v1\src`.
  - Runtime home: `E:\aho-accept\orchestration-map-ui-v1\home`.
  - Screenshots:
    - `E:\aho-accept\orchestration-map-ui-v1\screenshots\01-collapsed-rail.png`
    - `E:\aho-accept\orchestration-map-ui-v1\screenshots\02-agent-orchestration-map.png`
    - `E:\aho-accept\orchestration-map-ui-v1\screenshots\03-expanded-confirmation-pane.png`
  - Run graph route returned 2 nodes and 2 edges:
    `main-agent` (`idle`, demand) and `planning-agent` (`completed`,
    planning).
  - Real planning run for graph evidence:
    `run-20260626-220907-agent-0b1a1b`.
- External source/state safety: the E-drive demo source was initialized as a
  temporary external-local managed project for UI acceptance. No source apply,
  close, scheduler, remote, merge, PR, or Harness evolution action was executed
  by the rail toggle or graph interactions.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable only for close/handoff pointer
  updates; keep current docs compact and leave screenshot/run details
  archive-only.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: update latest product change
  pointers to this archive and keep next work generic.
- Old experience retained / merged / retired / archive-only: not applicable.

