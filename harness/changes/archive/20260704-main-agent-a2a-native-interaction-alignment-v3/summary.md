# main-agent-a2a-native-interaction-alignment-v3

## Purpose

Align the main-agent to planning-agent interaction with native Codex app-server
Plan Mode and the cc-gui style conversation flow. The user-facing flow should
feel like a normal parent conversation plus a right-side child-agent chat, not
like a system form or an internal Harness artifact dump.

## Scope

In scope:

- Separate conversation identity from Harness Change identity in role
  delegation checks.
- Thin the planning-agent prompt so Codex native Plan Mode owns the planning
  interaction style.
- Keep planning-agent plan streams and runtime questions scoped to the Agent
  workspace instead of the main transcript.
- Keep the Agent workspace transcript-first and free of internal explanation
  blocks, summary cards, standalone implementation buttons, or global execution
  controls.

Out of scope:

- No new execution authority, controller, action type, automation allowlist, or
  Harness lifecycle.
- No automatic apply, close, remote, PR, merge, Scheduler, IntegrationCheck, or
  Harness evolution expansion.
- No compatibility work for old test conversation snapshots.

## Current Status

Completed.

## Verification

- `npx vitest run tests/unit/workbench-agent-task-domain.test.ts tests/unit/agent-profiles.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/web-app.test.tsx tests/unit/workbench-read-model.test.ts tests/unit/codex.test.ts` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed.
- `npm run build` - passed.
- `npm run test:workbench` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: real browser acceptance remains a separate follow-up if native app-server runtime behavior needs live confirmation.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
