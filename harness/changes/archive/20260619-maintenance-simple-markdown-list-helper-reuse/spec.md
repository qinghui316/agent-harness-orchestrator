# Spec: maintenance-simple-markdown-list-helper-reuse

## Goal

Reduce repeated presentation-only simple markdown list rendering in the canonical maintenance chain by reusing the existing `renderMaintenanceMarkdownList` helper.

## Users

- Future AHO maintainers extending maintenance / canonical patch evidence renderers.
- Agents following Architecture Growth Control / Core Mechanism Reuse rules.

## Acceptance Criteria

- AC-001: Target Kinds, Risks, Blocked Reasons, and Guardrails simple string-list markdown sections in the scoped files reuse `renderMaintenanceMarkdownList`.
- AC-002: Blocked Reasons preserves its current empty fallback exactly as `- none`; Target Kinds, Risks, and Guardrails preserve their current empty-list behavior.
- AC-003: Multi-line renderers for Resolutions, Proposed Operations, Operations, Applied Operations, and Observed Operations are not changed in structure or ownership.
- AC-004: No schema, artifact JSON, ledger, authority, gate, source, Workbench, Scheduler, Goal Loop, or manager facade behavior changes.
- AC-005: Targeted tests and project validation pass.

## Non-Goals

- No new product capability, runtime action, maintenance record type, parser, schema, artifact shape, ledger policy, source mutation, or canonical rewrite behavior.
- No broad markdown renderer abstraction or section reordering.
- No changes to reference projects.

## Constraints

- Follow Architecture Growth Control / Core Mechanism Reuse: strengthen an existing owner rather than adding feature-local helpers.
- Keep the change narrow and behavior-preserving.
- Preserve public API and Workbench behavior.
- Keep `README.md` unrelated and untracked.

## Risks

- Accidentally changing empty-list markdown semantics, especially Blocked Reasons.
- Overreaching into multi-line operation/resolution renderers that are domain-specific rather than simple string lists.
- Treating presentation helper reuse as permission to modify artifact or gate behavior.
