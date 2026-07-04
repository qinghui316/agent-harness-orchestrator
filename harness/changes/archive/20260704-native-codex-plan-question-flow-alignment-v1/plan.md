# Plan: native-codex-plan-question-flow-alignment-v1

## Approach

Use the existing Codex app-server adapter and Agent workspace transcript path, but change the ownership of native planning events. Plan deltas and completed plan text become planning-agent transcript content; request-user-input stays scoped to the planning-agent runtime; Harness planning bundle derivation remains a background adapter for confirm-execution.

## Steps

1. Update Codex chat bridge live-event mapping so native plan events are emitted as planning-agent transcript content instead of generic plan-update status rows.
2. Stop appending full planning-agent plan text into the main conversation path while keeping it available in the planning-agent workspace and run artifacts.
3. Thin planning-agent delegation text to natural bounded context and rely on Codex collaboration mode for planning behavior.
4. Keep request-user-input cards scoped to the right Agent workspace and ensure completed/stale requests do not remain pending.
5. Clean primary user-facing planning labels and summaries to use "计划 / 修改计划 / 实施计划" without internal artifact terms.
6. Update targeted tests for projection, prompt shape, event scoping, boundaries, and UI rendering.
7. Run real UI acceptance against the normal App if the real Codex app-server is available; otherwise record blocked.

## Decisions

- Do not add a new transcript renderer; extend/reuse existing parent/agent transcript cells.
- Do not add a new action type for implementation intent; keep using planning.confirm-execution.
- Do not remove fallback `<proposed_plan>` parsing, but mark it as fallback/replay and keep it out of native acceptance.

## Minimality Gate Plan

- Can this be a no-op: no; current plan events are still rendered as status rows and some user-facing wording leaks old planning artifact terms.
- Reuse: existing owner/helper/mechanism considered: app-server collaboration mode, live transcript, Agent workspace, CodexUserInputRequest card, planning.confirm-execution.
- Shared root fix: event mapping and projection ownership are fixed at the bridge/workspace layer instead of per-screen local filters.
- Avoided: no new controller, permission model, plan-card UI, or automation path.
- Smallest coherent change: adjust native event mapping, workspace projection, prompt text, and visible labels.

## Module Boundary Plan

- Owner module: Codex app-server bridge owns runtime event mapping; Agent workspace projection owns child-agent display.
- New / moved responsibilities: native plan events move from generic assistant status rows into planning-agent transcript content.
- Facade touch points: Workbench live events and frontend AgentWorkspacePanel.
- Forbidden write-back locations: confirmationQueue, automation allowlists, ToolPolicyGate, Scheduler, IntegrationCheck, apply/close owners.
- Compatibility surface: existing planning.confirm-execution payload and revalidation remain unchanged.
- Boundary tests: prove no new automation permissions and no worker RoleContextPacket contamination.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: app-server collaboration mode, live transcript cells, Agent workspace, user-input request response path, planning bundle adapter.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no broad new mechanism is proposed; only event classification may be extended.
- Domain-specific logic location: planning handler remains responsible for generating and confirming planning bundles.
- Shared cross-cutting logic location: Codex event normalization stays in the Codex bridge/app-server adapter.
- Local framework / state machine / projection / validation / gate avoided: avoided new planning gate, workflow truth, or separate question engine.
- Future-cost reduction for similar features: native Codex event ownership becomes reusable for later coder/validator child-agent views.

## Planning-Discovered Gaps

None yet.
