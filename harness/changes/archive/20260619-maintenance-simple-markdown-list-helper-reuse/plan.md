# Plan: maintenance-simple-markdown-list-helper-reuse

## Approach

Make a scoped presentation-only reuse change. Replace local simple string-list markdown mapping in the canonical maintenance renderers with `renderMaintenanceMarkdownList`, while leaving multi-line domain renderers and all artifact/gate behavior untouched.

## Steps

1. Update `src/agent-task/canonical-updates.ts` Target Kinds and Risks sections to call `renderMaintenanceMarkdownList`.
2. Update `src/agent-task/canonical-patch-application.ts` Blocked Reasons section to call `renderMaintenanceMarkdownList(..., { emptyLabel: "none" })`.
3. Update `src/agent-task/canonical-patch-application-report.ts` Guardrails section to call `renderMaintenanceMarkdownList`.
4. Run targeted grep to prove scoped simple maps are gone and multi-line renderers remain present.
5. Run focused and broad validation, update review/handoff, then close only if close-ready.

## Decisions

- Treat this as a structured ECL change because it touches multiple source files in a canonical maintenance chain.
- Do not change `renderMaintenanceMarkdownList` API; existing `emptyLabel` already covers the Blocked Reasons fallback.
- Do not touch Resolutions or operation renderers; they are multi-line domain-specific renderers, not simple string-list formatting.

## Module Boundary Plan

- Owner module: `src/agent-task/maintenance-markdown.ts` owns shared maintenance markdown list presentation.
- New / moved responsibilities: no new responsibility; existing simple-list rendering responsibility is reused by more scoped renderers.
- Facade touch points: none.
- Forbidden write-back locations: Workbench, server, web UI, Scheduler, Goal Loop, manager facades, ledger/event policy, schemas, and source/apply gate modules.
- Compatibility surface: markdown output, artifact JSON, public exports, and Workbench behavior stay compatible.
- Boundary tests: `tests/unit/agent-task-boundaries.test.ts` plus targeted grep for scope control.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `renderMaintenanceMarkdownList` in `src/agent-task/maintenance-markdown.ts`.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: section choice remains in canonical update / canonical patch renderers.
- Shared cross-cutting logic location: simple string-list markdown formatting remains in `maintenance-markdown.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids more feature-local simple list renderers; no state machine, projection system, validation gate, or protocol is introduced.
- Future-cost reduction for similar features: later maintenance renderers can reuse one helper for simple lists and keep only domain-specific multi-line renderers local.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Subagent plan review required explicit structured ECL handling, Blocked Reasons empty fallback preservation, and scope-control grep that proves multi-line renderers remain untouched.
