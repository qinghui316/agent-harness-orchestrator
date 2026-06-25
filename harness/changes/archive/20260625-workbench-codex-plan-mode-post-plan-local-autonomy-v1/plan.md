# Plan: workbench-codex-plan-mode-post-plan-local-autonomy-v1

## Approach

Implement the smallest bridge from Codex Plan Mode into the existing Workbench planning owner, then route the user's selected post-plan mode through the existing planning confirmation and automation owners.

The execution boundary stays unchanged: Plan Mode produces proposal text, AHO writes canonical artifacts only after human confirmation, and local automation consumes only the current authoritative `confirmationQueue.primary` after fresh revalidation.

## Steps

1. Add a minimal proposed-plan parser and tests.
2. Extend Codex app-server and Workbench Codex chat adapters with optional planning mode metadata, using native collaboration mode when supported and prompt-level `<proposed_plan>` fallback otherwise.
3. Extend `PlanningArtifactBundle` / zod / web/read-model types with optional proposal metadata.
4. Update planning bundle construction so Codex proposal text drives `planMd` while AHO still derives spec/tasks/AC and warnings.
5. Update planning confirmation request types and server forwarding with `postPlanAutomationMode`.
6. Update `DecisionPanels` so planning confirmation always shows both modes and full-access submits `planning.confirm-execution` with post-plan mode rather than `planning.automation.scoped-auto.run`.
7. After successful canonical artifact writes, start existing scoped automation internally when post-plan mode is `full-access`.
8. Update targeted tests for parser, planning bundle, app-server mode request, UI payloads, automation boundaries, and stop behavior.
9. Run targeted and required verification; if feasible, perform E-drive real UI acceptance.
10. Close/handoff docs and git settle after successful verification.

## Decisions

- Native Codex Plan Mode is preferred but optional; the fallback is a prompt-level contract with the same `<proposed_plan>` extraction surface.
- `update_plan` is not used because Codex treats it as checklist/progress tooling, not Plan Mode output.
- `planning.confirm-execution` stays outside automation allowlists.
- Post-plan automation is started server-side after confirmation, not by exposing a second UI action.
- The proposed plan parser stays deliberately small and is not a schema validator.

## Minimality Gate Plan

- Can this be a no-op: no; current planning ignores Codex Plan Mode and UI cannot express "confirm plan, then full access".
- Reuse: existing planning handler, `PlanningArtifactBundle`, Workbench action request shape, server forwarding, `automation-runtime`, current-gate revalidation, ToolPolicy/source safety, and DecisionPanels.
- Shared root fix: inspect planning handler, Codex bridge, app-server adapter, workflow action request validation, server forwarding, read-model/DOM tests before adding local guards.
- Avoided: second planner, markdown AST parser, new workflow runtime, new permission system, new projection system, raw scheduler allowlist expansion, and new evidence family.
- Smallest coherent change: optional proposal fields plus one parser/helper, one post-plan mode payload, and reuse of existing internal automation dispatch.

## Module Boundary Plan

- Owner module: `src/workbench/actions/handlers/planning.ts` for planning flow; `src/workbench/planning/*` for bundle parsing/building; `src/workbench/codex-chat/bridge.ts` and `src/codex/app-server.ts` for Codex adapter options; `src/automation-runtime/*` and `src/workbench/actions/handlers/automation.ts` for local automation; `src/web/src/panels/workbench/DecisionPanels.tsx` for UI.
- New / moved responsibilities: minimal proposed-plan extraction helper under Workbench planning owner.
- Facade touch points: handler map and server/web action request DTOs only for wiring new optional fields.
- Forbidden write-back locations: do not add main logic to `src/workbench/chat.ts`, `src/workbench/manager.ts`, `src/workbench/projections/read-model.ts`, `src/server/workbench-server.ts`, or `src/web/src/App.tsx`.
- Compatibility surface: existing planning/action JSON stays compatible; new fields are optional.
- Boundary tests: parser/planning tests, app-server adapter tests, workflow-action request tests, web DOM payload tests, automation runtime tests.
- Follow-up split candidates: none expected.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Codex runtime adapter, planning artifact bundle, Workbench confirmation queue, current-gate revalidation, automation runtime, source safety/apply/close guards, action registry validation.
- Why existing mechanisms are insufficient if a new mechanism is proposed: only a small parser is needed because no existing helper extracts Codex `<proposed_plan>` blocks.
- Domain-specific logic location: parsing and proposal warnings in Workbench planning helpers.
- Shared cross-cutting logic location: current-gate and automation safety remain in existing shared owners.
- Local framework / state machine / projection / validation / gate avoided: no new planner state machine, no local permission framework, no parallel projection, no feature-local gate validator.
- Future-cost reduction for similar features: future planning improvements can swap proposal sources while keeping AHO artifact confirmation and automation boundaries stable.

## Planning-Discovered Gaps

- Current handoff docs say `完全访问权限` is not available for plan confirmation; this change intentionally changes that user-surface wording while keeping plan confirmation human-only.
