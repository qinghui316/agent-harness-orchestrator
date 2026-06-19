# Spec: maintenance-markdown-evidence-list-renderer-reuse

## Goal

Route the remaining canonical update / canonical patch Evidence artifact reference markdown lists through the existing maintenance markdown list helper owner.

## Users

- AHO maintainers and future agents extending maintenance canonical update / patch renderers.
- Existing readers of canonical update proposal, canonical update decision, canonical patch proposal, canonical patch application gate, and canonical patch application manifest markdown.

## Acceptance Criteria

- AC-001: `src/agent-task/canonical-updates.ts` imports and reuses `renderMaintenanceMarkdownList` for canonical update proposal Evidence `artifactRefs`.
- AC-002: `src/agent-task/canonical-updates.ts` reuses `renderMaintenanceMarkdownList` for canonical update decision Evidence `artifactRefs`.
- AC-003: `src/agent-task/canonical-updates.ts` reuses `renderMaintenanceMarkdownList` for canonical patch proposal Evidence `artifactRefs`.
- AC-004: `src/agent-task/canonical-updates.ts` reuses `renderMaintenanceMarkdownList` for canonical patch application gate Evidence `artifactRefs`.
- AC-005: `src/agent-task/canonical-patch-application.ts` reuses `renderMaintenanceMarkdownList` for canonical patch application manifest Evidence `artifactRefs`.
- AC-006: Existing markdown output remains unchanged for the scoped Evidence sections.
- AC-007: No helper API, parser, schema, artifact JSON shape, ledger event policy, ledger artifact refs, authority flag, human gate, ToolPolicyGate, source mutation, Workbench, Scheduler, Goal Loop, manager facade, reference source, or broad renderer behavior is introduced or changed.

## Non-Goals

- Change non-artifact markdown lists such as target kinds, risks, blocked reasons, resolutions, operations, or sources.
- Change markdown section names, section order, or authority text.
- Change stored artifact refs, JSON schemas, ledger entries, or canonical update / patch authorization behavior.
- Add a new evidence/report/manifest/descriptor product phase.
- Add Workbench, Scheduler, Goal Loop, ToolPolicy, authority, human-gate, source mutation, or reference-project behavior.

## Constraints

- `renderMaintenanceMarkdownList` remains presentation-only and must not become artifact schema, ledger policy, source truth, parser, or authorization logic.
- Direct helper coverage remains owned by `src/agent-task/maintenance-markdown.ts`; callers should not import through `src/agent-task/manager.ts`.
- The scoped call sites are the five remaining canonical update / patch Evidence artifact reference sections identified in planning.

## Risks

- Over-broad cleanup could accidentally change non-artifact lists or section semantics. This phase limits changes to Evidence `artifactRefs` sections only.
- Verification could over-claim by searching all markdown list rendering. Targeted evidence must distinguish scoped artifact evidence lists from intentionally retained domain-specific lists.
