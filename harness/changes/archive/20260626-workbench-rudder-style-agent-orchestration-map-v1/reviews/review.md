# Review: workbench-rudder-style-agent-orchestration-map-v1

Status: complete.

## Findings

No blocking findings.

## Verification

- Selected verification scope: run-graph projection, pure DAG layout, Workbench DOM surface, and daily Workbench aggregate contract.
- Targeted: `npx vitest run tests/unit/agent-orchestration-layout.test.ts tests/unit/workbench-run-graph-projection.test.ts tests/unit/web-app.test.tsx`
- Required: `npm run typecheck`, `npm run lint`, `npm run test:fast`, `npm run build`
- Aggregate: `npm run test:workbench`
- Result: all passed.
- Slow/release suites: not run. This change is a read-only projection/UI change and does not alter scheduler runtime, apply/close, validation/audit, or source mutation behavior.

## Complexity Deletion Review

- delete: removed the old inline lane/list graph renderer from `ConversationPanel.tsx`.
- reuse: existing `DemandAgentRunGraph`, lazy run-graph route, node detail/raw-log surface, Workpad summaries, evidence refs, scheduler/IntegrationCheck/landing/close summaries, and lucide icons.
- yagni: avoided ReactFlow, Dagre, ELK, graph database, editable canvas, agent registry, workflow runtime, permission system, and graph-triggered actions.
- shrink: added optional metadata plus one pure layout helper instead of a second graph projection or workflow diagram framework.
- net: Lean already. The extra code is focused in the projection owner and two frontend owner files, while the broad panel lost the old renderer.

## Acceptance Feedback

- Real/manual acceptance performed: partial browser surface acceptance plus deterministic DOM acceptance.
- Real Codex acceptance claimed: no.
- Manual config edits: none.
- Retries or environment failures: the current in-app browser tab at `http://127.0.0.1:4335` was connected to an older Workbench process and still showed `Agent 运行图`. A fresh built process at `http://127.0.0.1:4348` loaded the new bundle but did not restore the selected E-drive sandbox project, so no screenshot with live graph data was available.
- Screenshots / artifacts / run ids: not applicable for this read-only projection change.
- External source/state safety: not applicable; no source mutation path was exercised.
- Remote handoff acceptance: not applicable.

## Documentation Entropy Coverage

- Applicable: yes. `docs/WORKBENCH.md` was updated for the current user-facing graph name and read-only projection boundary.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, `docs/WORKBENCH.md`.
- Line counts: not used as a blocking signal; this change adds only current UI vocabulary and archive pointers.
- Duplicate current-state fields checked: active/latest pointers will be aligned during closeout.
- Archive-ledger handling: historical Rudder/reference details stay in this active summary/review, not in handoff docs.
- Tested with: Harness lint and status checks during closeout.

## Worktree Diff Artifact Coverage

- Applicable: no.
- Reason: change does not affect worktree-backed diff collection or apply artifacts.

## Read Model Projection Coverage

- Applicable: yes.
- Checked scope: selected-demand `DemandAgentRunGraph` remains derived projection with optional visual metadata; dangling edges are filtered; scheduler worker branches and IntegrationCandidate joins are same-graph projection data, not workflow truth.
- Tested with: `tests/unit/workbench-run-graph-projection.test.ts`.

## Workbench User-Surface Honesty Coverage

- Applicable: yes.
- Sampled surface: Workbench center `Agent 编排图` tab and node detail panel.
- Primary UI action boundary: graph nodes are buttons only for selecting evidence/details; they do not render confirmation actions or dispatch workflow actions.
- Authoritative gate alignment: unchanged; right-side `confirmationQueue.primary` remains the only executable primary surface.
- Out-of-scope future capability check: DOM test asserts the graph surface does not show `full-auto`, `parallel executor`, `merge queue`, `automatic remote`, `TaskRun`, or `WorkerLease`.
- Internal term check: node copy uses user-facing stage/role text; raw details remain behind the existing detail/raw-log surface.
- Tested with: `tests/unit/web-app.test.tsx`.

## Scoped Workbench Action Payload Coverage

- Applicable: no.
- Reason: no Workbench live/server action payload was added or changed.

## Transcript Renderer Source-Boundary Coverage

- Applicable: no.
- Reason: default Workbench transcript projection and renderer were not changed.

## Source Apply Safety Coverage

- Applicable: no.
- Reason: change does not affect result review, worktrees, apply/discard, integration checks, or source-root mutation.

## Runtime Bridge Boundary Coverage

- Applicable: no.
- Reason: change does not affect external executors, Codex bridge materialization, SQLite stores, Topic sessions, prompt stacks, or runtime bridge behavior.

## Proposal / Runtime Boundary Coverage

- Applicable: no.
- Reason: change adds visual metadata to a projection; it does not introduce proposal artifacts, readiness manifests, workflow plans, recovery material, or executable runtime behavior.

## Goal Loop Boundary Coverage

- Applicable: yes.
- Checked scope: Goal Loop and controlled continuation nodes are displayed as non-executing visual/evidence context only.
- Recommendation authority: unchanged; Goal Loop evidence does not create executable fallback actions or source mutations.
- ToolPolicy/human gate preservation: graph nodes have no action affordance; high-impact gates remain in existing confirmation surfaces.
- Tested with: run-graph projection and Workbench DOM tests.

## Module Boundary Coverage

- Applicable: yes.
- Owner modules: backend projection remains `src/workbench/projections/read-model/run-graph.ts`; layout is owned by `src/web/src/panels/workbench/agentOrchestrationLayout.ts`; UI rendering is owned by `src/web/src/panels/workbench/AgentOrchestrationMap.tsx`.
- Retained facade responsibilities: `ConversationPanel.tsx` remains the tab shell and node-detail composition point.
- Forbidden write-back locations: no graph authority was added to `App.tsx`, `workbench-server.ts`, `chat.ts`, managers, or action handlers.
- Compatibility result: lazy run-graph shape stays compatible because new fields are optional.
- Tested with: layout, projection, and DOM suites.

## Core Mechanism Reuse Coverage

- Applicable: yes.
- Existing mechanisms reused: `DemandAgentRunGraph`, Workpad summaries, evidence refs, lazy run-graph route, node detail/raw-log routes, and existing scheduler/IntegrationCheck/landing/close summaries.
- New mechanism and owner: one replaceable pure visual layout helper for frontend positioning only.
- Existing mechanisms insufficient because: the previous lane/list renderer could not express branches, joins, or loop/rework edges in a user-readable map.
- Avoided local frameworks: no new workflow runtime, permission system, graph DB, projection framework, action registry, or evidence family.
- Future-cost result: future nodes can add stage/visual/edge metadata and enter the same layout without new per-flow UI.

## Close / Handoff Drift Coverage

- Applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Active-path alignment: active pointers will be updated before Harness lint and archive pointers after close.
- Pending evolution state: none before this change.
- Latest archive alignment: to be updated after `harness-change close`.

## Remote Handoff Acceptance Coverage

- Applicable: no.
- Reason: change does not affect remote handoff, PR, provider detection, remote checks, or remote review evidence.
