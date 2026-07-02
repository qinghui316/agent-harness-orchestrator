# Spec: Main-Agent Real A-to-A Flow Audit + Repair V1

## Goal

Make the real AHO Workbench interaction match the intended main-agent / child-agent product model:

`user message -> main-agent real reply/question -> main-agent delegation -> child-agent process/history in Agent workspace -> user refinement -> explicit implementation gate -> main-agent continuation`.

The change must repair real product behavior where current UI/projection/runtime paths still make planning artifacts, system summaries, or child-agent results appear as main-agent prose, hide child-agent history, or blur live app-server streaming with replay/fallback output.

## Users

- AHO users running Harness mode through the Workbench UI.
- Main-agent and child-agent runtime owners who need evidence attribution to stay clear.
- Future multi-agent / ordinary Agent mode work that depends on clean transcript and child-agent workspace boundaries.

## Acceptance Criteria

- AC-001: Reference audit documents the relevant `desktop-cc-gui`, Codex Plan Mode / Goal continuation, and ODWF agent/journal patterns used for this repair.
- AC-002: A real AHO flow trace records the actual ordering of main-agent message, delegation, planning-agent run, planning-agent output, main-agent continuation, Agent workspace state, confirmationQueue state, and live/replay runtime source.
- AC-003: The main transcript no longer displays complete planning drafts, AC/task bundles, internal ids, or child-agent output as ordinary main-agent assistant prose.
- AC-004: Child-agent history is visible in the right Agent workspace from persisted run/thread/artifact projection, not only from the current live turn.
- AC-005: Clarification or questionnaire prompts are visible in the appropriate conversation / Agent workspace surface and can be answered without hiding in Workpad details only.
- AC-006: Normal composer messages always go to the main agent and do not auto-trigger `planning.generate`, `planning.revise`, or `planning.confirm` actions.
- AC-007: `planning.confirm-execution` remains the only implementation handoff for an accepted planning draft and continues to use existing target freshness and cross-change revalidation.
- AC-008: App-server live streaming and `codex exec` replay/fallback are distinguishable in UI/projection and real live acceptance is not credited to replay.
- AC-009: Request-approval and full-access execution boundaries are unchanged; full-access only uses the existing scoped automation allowlist and existing Harness gates.
- AC-010: Real browser acceptance passes for a normal project flow, or the change remains blocked with the concrete runtime/product defect recorded.

## Non-Goals

- No fake Codex responses, mocked binaries, handwritten run artifacts, direct manager truth writes, or acceptance by synthetic replay alone.
- No new workflow truth, controller, action type, Scheduler authority, IntegrationCheck authority, apply/close authority, or automation allowlist expansion.
- No recursive child-agent orchestration; child agents remain bounded leaves and the main agent remains the only coordinator.
- No ordinary Agent mode implementation.

## Constraints

- Preserve Change/ECL, current visible gate, ToolPolicyGate, validation/audit, confirmationQueue, apply/close, Scheduler, IntegrationCheck, remote/PR/merge, and Harness evolution boundaries.
- Use existing owners and projections where possible; new UI/projection code must replace duplication or expose real product state.
- Do not send parent Agent workspace conversation history into worker `RoleContextPacket`, delegate manifests, or scheduler worker context.
- If app-server live streaming is unavailable for normal text demand, the UI must show that as runtime state; it cannot show fake assistant text or mark live acceptance passed.
- Real browser acceptance must use the normal app/project flow and a real project, not an isolated hand-written artifact path.

## Risks

- The current UI may have multiple center surfaces (`parentAgentTranscript`, legacy thread stream, Workpad cards) that can leak the same planning content through different paths.
- Persisted child-agent history may be missing role attribution; adding attribution must stay backward compatible with existing thread items.
- Codex app-server / live delta availability may differ from `codex exec` fallback; acceptance must not blur the two.
- Clarification UI could accidentally become a new gate or action authority if not kept as projection plus existing action submission.
