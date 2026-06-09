# Spec: Phase 8C Code Execution Manager Boundary Split

## Goal

Make code execution internals maintainable by splitting `src/code/manager.ts` into owned modules while preserving public behavior, artifact formats, and execution authority. Repair the Codex app-server code-run role metadata bug during the split.

## Users

- AHO users running direct `code.run` or TaskQueue-driven code execution.
- CLI users using `aho code run/status/list/show`.
- Future agents evolving code execution, runtime recovery, policy adapters, or parallel scheduling.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 8B closed and Phase 8C active, with no stale Phase 8B active/current claims.
- AC-002: `src/code/manager.ts` becomes a compatibility facade, not the main code execution implementation file.
- AC-003: Execution gate, run session/artifacts, context packet writing, Codex app-server runner, Codex exec runner, live events, and status helpers have owned modules.
- AC-004: Existing public imports from `src/code/manager.ts` remain compatible.
- AC-005: `startCodeRun()` artifact paths, run JSON shape, event names/payloads, warnings, status/failure semantics, and metadata remain compatible.
- AC-006: Code execution gate semantics remain unchanged; stale/forged readiness, proposal, graph, or taskRun targets still fail closed.
- AC-007: Codex app-server code runs use the resolved `roleId`; rework-coder session and active-turn metadata are not recorded as coder-agent.
- AC-008: CLI code status/list/show compatibility behavior remains unchanged, including legacy single-active `getCodeStatus()` semantics.
- AC-009: New `src/code/*` modules do not depend on the `src/code/manager.ts` facade, CLI command modules, Workbench, server, or web UI.
- AC-010: No runtime/action/route/CLI command/scheduler/parallel/multi-Change/ODWF JS runtime/cache replay is introduced.
- AC-011: Full product and Harness verification pass, or any pre-existing failure is clearly recorded.

## Non-Goals

- Do not add scoped code status behavior.
- Do not change Codex read directory policy.
- Do not change `RunMetadata`, run event, CLI output, Workbench projection, or thread storage shapes.
- Do not migrate external imports away from `src/code/manager.ts`.

## Constraints

- Preserve exact run artifact filenames and relative artifact refs.
- Keep live callbacks best-effort; callback failures must not change run lifecycle.
- Preserve the current app-server-first, Codex exec fallback behavior.
- Use UTF-8-safe edits and keep unrelated `README.md` untracked.

## Risks

- Splitting app-server and exec branches can alter event order or warning/status calculation.
- Moving run session setup can accidentally change artifact refs or run metadata.
- Extracting the execution gate can accidentally weaken stale target checks.
