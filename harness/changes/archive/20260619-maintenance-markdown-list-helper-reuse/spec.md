# Spec: maintenance-markdown-list-helper-reuse

## Goal

Move repeated maintenance artifact markdown list rendering into a dedicated presentation-only helper owner.

## Users

- AHO maintainers and future agents extending maintenance artifact markdown renderers.
- Existing readers of canonical patch application result and observation report markdown.

## Acceptance Criteria

- AC-001: `src/agent-task/maintenance-markdown.ts` exposes `renderMaintenanceMarkdownList`.
- AC-002: The helper returns bullet lines in the exact form `- ${item}` for non-empty input.
- AC-003: The helper returns `[]` for empty input when no empty fallback label is supplied.
- AC-004: The helper returns `["- none"]` for empty input when called with empty fallback label `none`.
- AC-005: Canonical patch application result/report markdown renderers reuse the helper for `policyAuditRefs` and `artifactRefs`.
- AC-006: Existing result/report markdown output remains unchanged for policy audit and evidence sections.
- AC-007: No parser, schema, artifact JSON shape, ledger event policy, ledger artifact refs, authority flag, human gate, ToolPolicyGate, source mutation, Workbench, Scheduler, Goal Loop, manager facade, reference source, or broad renderer behavior is introduced.

## Non-Goals

- Replace every maintenance renderer list in this phase.
- Change markdown section names or text.
- Change artifact refs stored in JSON or ledger entries.
- Add a new evidence/report/manifest/descriptor phase.
- Add Workbench, Scheduler, Goal Loop, ToolPolicy, authority, human-gate, or source mutation behavior.

## Constraints

- The helper is presentation-only and must not become artifact schema, ledger policy, source truth, parser, or authorization logic.
- Direct tests import the helper from `src/agent-task/maintenance-markdown.ts`, not through `src/agent-task/manager.ts`.
- The four-call-site limit is intentional; other `artifactRefs.map(...)` occurrences remain out of scope unless a later change expands the shared renderer.

## Risks

- A generic markdown helper could become a dumping ground. This phase limits it to simple maintenance markdown list lines and records the owner responsibility precisely.
