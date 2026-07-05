# Review: provider-native-a2a-runtime-alignment-v1

Status: approved.

## Findings

No blocking issues found.

Residual limitation:

- In-app browser automation could not attach because the local browser plugin
  failed during initialization with
  `failed to write kernel assets: 系统找不到指定的路径。 (os error 3)`.
  This blocked visual click/screenshot acceptance. Real Workbench service,
  HTTP, and SSE acceptance was performed against the built app on port 4477.

## Verification

Passed.

- Selected verification scope: provider-native runtime scope, ordinary chat
  no-delegation boundary, Codex plan-event projection, Workbench server/read
  model/UI regressions, and standard fast suite.
- Targeted:
  - `npm run typecheck`
  - `npx vitest run tests/unit/workbench-module-boundaries.test.ts tests/unit/codex.test.ts tests/unit/workbench-server.test.ts tests/unit/workbench-read-model.test.ts`
  - `npx vitest run tests/unit/workbench-module-boundaries.test.ts tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx`
  - `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx`
- Aggregate / standard:
  - `npm run lint`
  - `npm run build`
  - `npm run test:fast`
- Real service/API acceptance:
  - Built app served on `127.0.0.1:4477`.
  - Project `goal-loop-demo-real`.
  - Created ordinary live conversation `conv-mr7cnr1v-53441909`.
  - Real SSE emitted `assistant.delta` events and final `assistant.message`
    for run `chat-conv-mr7cnr1v-53441909-mr7cnr28`.
  - Active Change directory count remained `31 -> 31`; ordinary chat did not
    create a Harness Change.
  - Transcript projection contained only user/main-agent messages; no
    planning-agent run or planning draft appeared from ordinary chat.
- Rationale for selected scope: the change removes an ordinary-chat runtime
  path, changes Codex app-server scope metadata, and changes plan event
  projection. It does not change action execution, apply/close, Scheduler, or
  automation allowlists.
- Aggregate Workbench / slow suite status: `test:fast` passed; no timeout.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: removed Workbench-side ordinary-chat planning-agent auto-delegation
  helpers and the server injection hook that could imply hidden delegation.
- reuse: kept existing explicit `planning.generate` / `planning.revise` /
  `planning.confirm-execution`, Codex app-server bridge, scoped live events,
  and Workbench projections.
- yagni: avoided AHO custom delegate tool, second controller, new action type,
  new provider runtime, and new automation permission.
- shrink: ordinary chat now runs one main-agent turn only; child-agent surfaces
  require provider/Harness ownership instead of text heuristics.
- net: simpler boundary; less hidden behavior.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: partial. Real built Workbench HTTP/SSE path
  was exercised; visual browser automation was blocked by browser plugin
  initialization failure.
- Real Codex acceptance claimed: yes for ordinary main-agent live streaming
  through app-server SSE, not for child planning-agent native plan streaming.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: no fake Codex, mocked PATH, fixture result, hand-written run artifact, or direct manager truth was used. Evidence came from `topics/live` against the built app.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: in-app browser automation failed twice with
  `failed to write kernel assets: 系统找不到指定的路径。 (os error 3)`.
- Screenshots / artifacts / run ids:
  `chat-conv-mr7cnr1v-53441909-mr7cnr28`,
  `conv-mr7cnr1v-53441909`,
  `.tmp/provider-native-live-sse.txt`.
- External source/state safety: not applicable. If real/self acceptance uses a managed source project, record source root, runtime home, whether same-root evidence is negative-only, and before/after `git status --short`.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: no AHO runtime workaround
  used. Browser automation failure remains outside this product path.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `docs/WORKBENCH.md`,
  `docs/RUNTIME.md`, `docs/BOUNDARIES.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, before/after line counts: not applicable.
- If applicable, duplicate current-state fields checked: not applicable.
- If applicable, roadmap/current-direction stale language checked: not applicable.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: not applicable.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: not applicable.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: no.
- If applicable, promote decisions: not applicable.
- If applicable, retain decisions: not applicable.
- If applicable, merge decisions: not applicable.
- If applicable, retire decisions: not applicable.
- If applicable, archive-only decisions: not applicable.
- If applicable, noop / no-change rationale after old-experience scan: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change is not an auto-evolve, Harness rule/template, docs, or handoff change.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect worktree-backed diff behavior.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: no.
- If applicable, checked scope: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect derived read models, approval inboxes, thread/run projections, role summaries, or Harness gap reports.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Product-visible Workbench controls are applicable unless the review records why they cannot affect user decisions; do not mark this section not applicable only because the control does not change the authoritative primary decision surface.
- If applicable, sampled surface: ordinary conversation snapshot and
  transcript projection for `conv-mr7cnr1v-53441909`.
- If applicable, visible primary UI backed by implemented workflow paths:
  ordinary chat had no workflow primary action; main-agent live turn used
  existing Codex app-server path.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: confirmation queue was empty for ordinary conversation; no planning gate was fabricated.
- If applicable, stale-history override and running/archived selected-demand suppression checked: not applicable to ordinary conversation acceptance.
- If applicable, out-of-scope future capability check: ordinary chat did not launch planning-agent, create Change, or show plan/apply/close controls.
- If applicable, forbidden visible internal terms/actions checked: source
  Workpad copy was changed from `Harness gate / Change lifecycle` to
  user-facing text; post-rebuild API confirmed the new text.
- If applicable, duplicate primary action / in-flight suppression check: not applicable.
- If applicable, high-impact action path result: not applicable.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: browser automation blocked; built app API/SSE verified.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: `workbench-read-model.test.ts`, `web-app.test.tsx`, and live snapshot API.
- If applicable, tested with: listed in Verification.
- If not applicable, reason: not applicable.

## Reference-Driven UI / Product Source Evidence Coverage

- Reference-driven UI/product coverage applicable: no.
- If applicable, reference map section inspected: not applicable.
- If applicable, reference source files or inspected commit used: not applicable.
- If applicable, controls copied / adapted / intentionally omitted: not applicable.
- If applicable, fake-control check: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not claim alignment with a reference project for product or UI behavior.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: no.
- If applicable, checked target ids: not applicable.
- If applicable, tested action path: not applicable.
- If applicable, duplicate action/evidence affordance and in-flight duplicate submission check: not applicable.
- If not applicable, reason: change does not add or change Workbench live/server UI actions that depend on explicit target ids.

## Transcript Renderer Source-Boundary Coverage

- Transcript renderer source-boundary coverage applicable: no.
- If applicable, canonical transcript projection checked: not applicable.
- If applicable, assistant markdown source checked: not applicable.
- If applicable, process/tool row compactness checked: not applicable.
- If applicable, derived workflow summary exclusion checked: not applicable.
- If applicable, worker/role transcript scoping checked: not applicable.
- If applicable, private chain-of-thought exclusion checked: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect the default Workbench main conversation transcript or parent-agent transcript projection.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: no.
- If applicable, checked source project / fixture: not applicable.
- If applicable, checked runtime home / external managed-project isolation: not applicable.
- If applicable, checked worktree ids / result ids / integration check ids: not applicable.
- If applicable, source-root mutation gate checked: not applicable.
- If applicable, out-of-scope source mutation check: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect result review, worktrees, apply/discard flows, source refresh rework, integration checks, multi-demand confirmation, or source-root apply handoff.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: yes.
- If applicable, checked boundary: ordinary conversation uses
  `runtimeScopeId`; Harness workflow actions may still pass `changeId` when
  scoped. Native plan events are projected as scoped events, not main-agent
  assistant deltas.
- If applicable, tested with: `codex.test.ts`,
  `workbench-module-boundaries.test.ts`, real `topics/live` SSE.
- If not applicable, reason: not applicable.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: no.
- If applicable, artifact type and authority classification: not applicable.
- If applicable, boundary matrix checked: not applicable.
- If applicable, out-of-scope execution paths checked: not applicable.
- If applicable, stale/forged target behavior checked: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not introduce or change planning proposals, decomposition plans, readiness manifests, workflow plans, recovery material, scheduler-readiness artifacts, or similar proposal/runtime boundary artifacts.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: no.
- If applicable, persistent Goal/Change scope checked: not applicable.
- If applicable, recommendation authority checked: not applicable.
- If applicable, fallback priority checked: not applicable.
- If applicable, packet / main-Agent context freshness checked: not applicable.
- If applicable, stale or superseded packet suppression checked: not applicable.
- If applicable, feedback selected Change / packet lineage / visible gate scope checked: not applicable.
- If applicable, feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: not applicable.
- If applicable, feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: not applicable.
- If applicable, hidden execution / source mutation check: not applicable.
- If applicable, ToolPolicyGate / human gate preservation checked: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not add or change GoalLoopDecision policy, goal-loop confirmation surfaces, autonomous loop behavior, or conflict-aware continuation behavior.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: not applicable.
- If applicable, module owners checked: `src/workbench/chat.ts`,
  `src/server/workbench/*`, `src/codex/app-server.ts`,
  `src/workbench/codex-chat/bridge.ts`, read-model workpad projection.
- If applicable, moved responsibilities: removed obsolete server-level initial
  planning delegation hook instead of keeping a no-op compatibility surface.
- If applicable, retained facade responsibilities: explicit planning actions,
  Workbench action dispatch, and existing confirmation/revalidation remain
  unchanged.
- If applicable, forbidden write-back locations: no action registry,
  automation allowlist, Scheduler, IntegrationCheck, apply, or close changes.
- If applicable, compatibility surface: ordinary chat API still streams topic
  creation and main-agent turns.
- If applicable, behavior path tested: not applicable.
- If applicable, follow-up split candidates: not applicable.
- If applicable, boundary tests or lint checks: not applicable.
- If applicable, compatibility result: not applicable.
- If applicable, tested with: listed in Verification.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: no.
- If applicable, existing mechanisms reused or strengthened: not applicable.
- If applicable, new cross-cutting mechanism and owner: not applicable.
- If applicable, why existing mechanisms were insufficient: not applicable.
- If applicable, domain-specific logic location: not applicable.
- If applicable, shared cross-cutting logic location: not applicable.
- If applicable, local framework / state machine / projection / validation / gate avoided: not applicable.
- If applicable, public API / facade / Workbench compatibility result: not applicable.
- If applicable, future-cost reduction result: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not add or change a product feature path, artifact family, state transition, projection, validation/safety gate, ledger event, maintenance record, or cross-module protocol.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: no. Change to `yes` when this change alters active phase, product baseline, Harness rules/templates, active/pending state, latest archive, or next recommended work.
- If applicable, handoff files checked: not applicable.
- If applicable, stale active-path / phase grep: not applicable.
- If applicable, latest archive / active path alignment: not applicable.
- If applicable, pending evolution state checked: not applicable.
- If not applicable, reason: change does not alter active phase, product baseline, Harness rules/templates, active/pending state, latest archive, or next recommended track.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

