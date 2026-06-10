# Plan

1. Record starting state and update handoff docs for Phase 8P active.
2. Add guarded Validation repository modules and keep `artifacts.ts` / `manager.ts` compatible.
3. Add guarded Audit repository/acceptance modules and keep `artifacts.ts` / `manager.ts` compatible.
4. Move Validation run orchestration out of `manager.ts` into run/session/context/command/result/status modules.
5. Move Audit run orchestration out of `manager.ts` into run/session/context/codex/result/status/acceptance modules.
6. Extend tests for forged/malformed/cross-Change evidence and module boundaries.
7. Run focused tests, full product verification, Harness verification, and drift checks.

## Key Decisions

- List/projection paths skip invalid Validation/Audit records so Workbench and close/apply gates are resilient to stray files.
- Direct read/show/accept paths fail closed because those paths act on explicit evidence ids.
- Artifact wire shape is unchanged; guards are internal trust boundaries only.
- `README.md` remains unrelated and untracked.
