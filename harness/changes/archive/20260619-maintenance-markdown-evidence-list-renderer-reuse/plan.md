# Plan: maintenance-markdown-evidence-list-renderer-reuse

## Approach

Extend the existing maintenance markdown list helper adoption to the remaining canonical update / patch Evidence artifact reference sections. Keep domain-specific section composition in the existing renderers and only replace the repeated bullet-list formatting for `artifactRefs`.

## Steps

1. Import `renderMaintenanceMarkdownList` in `src/agent-task/canonical-updates.ts`.
2. Replace local Evidence `artifactRefs.map((ref) => "- ${ref}")` rendering in canonical update proposal, canonical update decision, canonical patch proposal, and canonical patch application gate markdown renderers.
3. Replace the remaining canonical patch application manifest Evidence `artifactRefs.map((ref) => "- ${ref}")` rendering in `src/agent-task/canonical-patch-application.ts`.
4. Preserve existing direct helper coverage and existing canonical update / patch markdown behavior coverage.
5. Run targeted and broad validation, then independent close-ready review.

## Decisions

- Existing helper owner: `src/agent-task/maintenance-markdown.ts`.
- Helper API: unchanged.
- Call-site scope: exactly five Evidence artifact reference sections; non-artifact lists remain domain-specific in their current renderers.
- ECL lifecycle tightening from plan review: run preflight before change creation, write complete `spec.md`, `plan.md`, `tasks.md`, and `reviews/review.md`, and include `harness-change.ps1 reindex` in verification/close flow.

## Module Boundary Plan

- Owner module: `src/agent-task/maintenance-markdown.ts`.
- New / moved responsibilities: remaining canonical update / patch Evidence artifact reference markdown bullet-list rendering moves to the maintenance markdown owner.
- Facade touch points: none; `src/agent-task/manager.ts` remains untouched.
- Forbidden write-back locations: Workbench, bridge/runtime adapters, frontend, scheduler modules, Goal Loop modules, manager facades, source apply paths, schema/type definitions, ledger policy modules, and reference-project source.
- Compatibility surface: canonical update proposal, canonical update decision, canonical patch proposal, canonical patch application gate, and canonical patch application manifest markdown output remains unchanged; artifact JSON/schema and ledger refs remain unchanged.
- Boundary tests: direct helper coverage plus existing agent-task boundary tests that create and read the scoped markdown artifacts.
- Follow-up split candidates: none for this slice; broader renderer section builders should only be considered if repeated section composition, not just list formatting, becomes a real cost.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `renderMaintenanceMarkdownList` as the maintenance markdown presentation owner.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed; this phase extends the existing owner.
- Domain-specific logic location: canonical update / patch renderers keep section order, authority text, source lines, target kinds, risks, blocked reasons, operations, and rationale formatting.
- Shared cross-cutting logic location: simple Evidence artifact reference bullet-list rendering belongs in `src/agent-task/maintenance-markdown.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids repeated feature-local markdown bullet-list formatting and adds no state machine, projection, validation gate, ledger policy, authority protocol, or artifact protocol.
- Future-cost reduction for similar features: future maintenance renderers can reuse one presentation helper for evidence/reference sections without inventing another local list formatter.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Initial subagent plan review returned FAIL on lifecycle details only. Required corrections are incorporated: explicit `harness-change.ps1 preflight` before creating the change, complete ECL lifecycle artifacts before implementation, and `harness-change.ps1 reindex` in verification/close flow.
