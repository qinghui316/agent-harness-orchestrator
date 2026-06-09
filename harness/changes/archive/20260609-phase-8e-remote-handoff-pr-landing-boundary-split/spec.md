# Spec: Phase 8E Remote Handoff PR Landing Boundary Split

## Goal

Make the remote handoff / PR landing chain easier to change by moving mixed manager-file responsibilities into owned modules while preserving public imports and runtime behavior.

## Users

- Future maintainers changing PR review, feedback, remote landing, post-merge sync, or branch cleanup behavior.
- Workbench users relying on existing PR/remote/post-merge confirmation queue behavior.
- CLI and test callers importing existing manager entrypoints.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 8D closed and Phase 8E active, with no stale Phase 8D active/current claim.
- AC-002: `pr-review`, `pr-feedback`, `remote-landing`, and `post-merge` manager files are compatibility facades and no longer hold the main implementation.
- AC-003: Schemas, artifact repository, provider adapter, readiness, handoff/attempt/result, rendering, and side-effect logic have clear module boundaries.
- AC-004: Existing public imports from the four manager files remain compatible.
- AC-005: PR review, feedback refresh/rework/reply, remote merge, post-merge sync/cleanup action payloads, decision/audit scope, and confirmation behavior do not change.
- AC-006: Remote merge still refreshes readiness and fails closed for stale, draft, closed, already merged, failed checks, actionable feedback, or merge-unavailable state.
- AC-007: Post-merge sync/cleanup still require explicit merged evidence and reject dirty source, wrong branch, not-fast-forward, unsafe head, or missing provider capability.
- AC-008: Maintenance closeout/ledger side effects are not expanded beyond existing successful remote merge behavior.
- AC-009: New domain modules do not import manager facades, Workbench, server, web UI, or CLI command modules.
- AC-010: No runtime/action/route/CLI command/scheduler/parallel/multi-Change/ODWF JS runtime/cache replay is introduced.
- AC-011: Product and Harness verification pass, or any pre-existing failure is clearly recorded.

## Constraints

- Treat any behavior change as a bug.
- Preserve artifact paths and serialized shapes.
- Keep existing `manager.ts` files as external compatibility entrypoints.
- Do not include unrelated untracked `README.md`.

## Risks

- The remote chain is high-impact because it can lead to PR submission, merge, local sync, and branch cleanup. Refactor must keep readiness and confirmation gates intact.
- Cross-domain imports are currently coupled. Splitting must avoid circular dependencies and reverse facade imports.
