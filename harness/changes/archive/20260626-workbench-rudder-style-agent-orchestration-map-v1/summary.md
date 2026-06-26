# workbench-rudder-style-agent-orchestration-map-v1

## Purpose

Replace the Workbench selected-demand `Agent 运行图` list/lane surface with a
Rudder-style read-only orchestration map. The map should show the local AHO
flow as an understandable DAG: main demand, planning, execution, validation,
review, scheduler worker branches, IntegrationCheck joins, landing, terminal
gates, plus loop/rework edges.

This is a visualization/projection change only. It must not create or execute
workflow actions, alter permissions, introduce a workflow runtime, or make the
graph a source of truth.

## Scope

In scope:

- Extend the existing `DemandAgentRunGraph` projection with minimal visual
  metadata for stage, visual kind, edge style, and edge role.
- Add a pure extensible DAG layout helper driven by stage and graph edges, not
  hard-coded agent coordinates.
- Replace the current run-graph list UI with an SVG-edge + HTML-card canvas,
  avatar cards, status dots, pan/zoom/fit controls, and node detail reuse.
- Represent loop, rework/retry, scheduler worker branch/join, IntegrationCheck,
  landing, and terminal states in readable user-facing language.
- Verify projection/layout and DOM behavior with targeted tests.

Out of scope:

- No workflow runtime, permission system, central database, editable workflow
  builder, or agent registry.
- No action execution from graph nodes; right-side `confirmationQueue.primary`
  remains the only executable primary surface.
- No raw scheduler full-access, automatic IntegrationCheck, integration
  apply/discard, PR, remote, merge, or Harness evolution.
- No Rudder code vendoring; Rudder is a visual/layout reference only.
- No durable avatar memory; avatars are deterministic frontend presentation.

## Current Status

Completed. Ready to close.

## Verification

Passed:

- `npx vitest run tests/unit/agent-orchestration-layout.test.ts tests/unit/workbench-run-graph-projection.test.ts tests/unit/web-app.test.tsx`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`

Visual surface evidence:

- The in-app browser connector was able to inspect Workbench on
  `http://127.0.0.1:4335`, but that tab was connected to an older running
  Workbench process and still showed the old `Agent 运行图` label.
- A fresh built Workbench process was started on `http://127.0.0.1:4348`; the
  new bundle loaded, but the selected E-drive sandbox did not restore a project
  in that process, so no graph-bearing demand was available for screenshot
  acceptance.
- Deterministic React DOM coverage verifies the visible product surface:
  `Agent 编排图`, canvas, SVG edges, avatar cards, status dots, zoom/fit
  controls, node detail click, and forbidden future/internal terms.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: browser connector evidence above; no
  source/workflow run artifact because this change is projection/UI-only.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
