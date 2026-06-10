# Plan: Phase 8U Runtime Continuity Contract Foundation

## Approach

Add a small Runtime Continuity owner module and integrate it only with code-run worker branches. Keep all new evidence additive and run-local, preserving existing artifacts and product behavior.

## Steps

1. Repair docs drift from Phase 8T to Phase 8U.
2. Add `src/runtime-continuity/` schemas/types, paths, repository, guards, and event-envelope helpers.
3. Extend code-run session paths with additive runtime continuity artifact paths.
4. Create scoped continuity evidence before Codex app-server and codex exec worker start.
5. Append normalized agent event envelopes from app-server notifications and codex exec parser events.
6. Add boundary and behavior tests.
7. Run focused and full verification.

## Decisions

- Runtime continuity artifacts live in the existing code run artifact directory.
- `WorkerSession` is AHO-owned and distinct from Codex `agent-session.json`.
- RuntimeWorkspace v1 is local worktree only.
- Validation/Audit are not integrated in this phase.
- Workbench UI remains unchanged.

## Module Boundary Plan

- Owner module: `src/runtime-continuity/`.
- New / moved responsibilities: runtime continuity schemas/types, artifact paths, repository read/write, scope guards, event-source lifecycle, AgentEventEnvelope append.
- Facade touch points: code-run branches call the owner module directly; no broad facade is introduced.
- Forbidden write-back locations: `src/code/manager.ts`, `src/run/manager.ts`, Workbench modules, server routes, web UI, CLI command modules.
- Compatibility surface: existing code-run public APIs and run artifacts remain compatible; new artifacts are additive.
- Boundary tests: module dependency checks, app-server/exec evidence tests, forged-scope append/read tests, no SchedulerContract execution test.
- Follow-up split candidates: later validation/audit integration or Workbench display of worker session evidence, if a product need appears.

## Planning-Discovered Gaps

- Existing `agent-session.json` is Codex app-server adapter state, not an AHO worker-session contract.
- Existing raw app-server/codex event logs have no shared event-source envelope across adapters.
