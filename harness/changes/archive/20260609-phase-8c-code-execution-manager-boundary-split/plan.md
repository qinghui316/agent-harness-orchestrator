# Plan: Phase 8C Code Execution Manager Boundary Split

## Approach

1. Repair handoff drift.
   - Replace Phase 8B active/current wording with Phase 8B archived and Phase 8C active wording.
   - Record Phase 8C as a code execution boundary split with one role metadata fix and no new runtime authority.

2. Extract stable code-domain types and helpers.
   - Move public CodeRun, execution gate, live callback, and status types into a code-owned type module and re-export through `manager.ts`.
   - Extract artifact path/ref helpers, run creation/finish helpers, source status, diff/summary, and live event helpers without changing emitted data.

3. Extract execution gate.
   - Move single-change readiness, TaskQueue graph/proposal/taskRun, and rework gate logic into `execution-gate`.
   - Preserve fail-closed stale/forged behavior and current error messages unless tests require only message-compatible matching.

4. Extract context and runners.
   - Move RoleContextPacket/context.md creation into `context`.
   - Move app-server branch into `codex-app-server-runner`.
   - Move Codex exec/JSONL branch into `codex-exec-runner`.
   - Pass the resolved `roleId` into app-server turns instead of hard-coded coder-agent.

5. Preserve facade and status behavior.
   - Keep `startCodeRun()`, `getCodeStatus()`, `listCodeRuns()`, and `showCodeRun()` in `manager.ts` as facade calls.
   - Move code status/list/show implementation into a `status` module while retaining legacy single-active `getCodeStatus()` behavior.

6. Add tests and verification.
   - Extend module-boundary tests for code modules and facade compatibility.
   - Add focused role metadata coverage for app-server code runs.
   - Run focused and full verification.

## Implementation Notes

- `manager.ts` may still compose the top-level `startCodeRun()` flow, but it must delegate gate, context, runner, artifact, live, and status details to owned modules.
- App-server and exec runners should receive explicit input objects containing all state needed for execution; they must not re-resolve project/change targets.
- `getCodeStatus()` remains compatibility-only and must not become a new scoped API in this phase.

## Planning-Discovered Gaps

- The current app-server branch passes `roleId: "coder-agent"` to `runCodexAppServerTurn()` even when `startCodeRun()` resolved `roleId` as `rework-coder`. This phase repairs that metadata boundary.
- Existing coverage already checks source pollution, no-diff warnings, readiness gate rejection, and CLI flows; add narrower module-boundary and app-server role metadata coverage rather than duplicating all integration scenarios.
