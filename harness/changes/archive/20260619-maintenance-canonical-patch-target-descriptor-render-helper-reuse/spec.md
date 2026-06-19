# Spec: maintenance-canonical-patch-target-descriptor-render-helper-reuse

## Goal

Move repeated canonical patch target descriptor markdown-summary formatting into the existing canonical patch target-boundary owner.

## Users

- AHO maintainers and future agents extending maintenance canonical patch target handling.
- Existing callers that read generated canonical patch proposal and application manifest markdown.

## Acceptance Criteria

- AC-001: `src/agent-task/canonical-patch-target-boundary.ts` exposes a display-only helper for target descriptor summaries.
- AC-002: The helper returns exactly `missing` for `null` or `undefined` descriptors.
- AC-003: The helper returns exactly `${patchKind} ${targetPath} sha256=${expectedContentHash}` for concrete descriptors.
- AC-004: `canonical-updates.ts` and `canonical-patch-application.ts` reuse the helper instead of keeping duplicate local formatter functions.
- AC-005: Existing canonical patch proposal and application manifest markdown descriptor lines remain unchanged.
- AC-006: No parser, wire format, schema field, artifact JSON shape, ledger event policy, authority signal, human gate, ToolPolicyGate, source mutation, Workbench, Scheduler, Goal Loop, manager facade, reference source, or broader renderer behavior is introduced.

## Non-Goals

- Parser or validator changes.
- Artifact JSON/schema changes.
- New maintenance evidence/report/manifest/descriptor phase.
- Human-gate, ToolPolicyGate, authority, source mutation, Workbench, Scheduler, Goal Loop, manager facade, or reference project changes.
- Broader markdown renderer refactor.

## Constraints

- The helper is display-only and must not become a source of truth, parser, schema protocol, or authorization signal.
- `canonical-patch-target-boundary.ts` owns the helper because descriptor display is shared target-boundary behavior; feature modules remain consumers.
- Reference projects are evidence only; no reference runtime copying.

## Risks

- A formatter helper could be mistaken for a wire protocol if named too broadly. The implementation and review must state that it is display-only markdown summary formatting.
