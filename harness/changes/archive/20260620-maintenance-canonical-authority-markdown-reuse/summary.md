# Maintenance Canonical Authority Markdown Reuse

## Purpose

Converge the maintenance canonical update / canonical patch chain around the existing authority owner for repeated `## Authority` markdown rendering.

This is Architecture Growth Control work. It reduces repeated authority markdown blocks while preserving artifact schemas, ids, authority flag values, lineage, target validation, artifact refs, ledger events, ToolPolicyGate, human gates, Workbench actions, source mutation behavior, scheduler, Goal Loop, and runtime behavior.

## Scope

In scope:

- Extend `src/agent-task/canonical-patch-application-authority.ts` with small helper functions that render existing canonical authority markdown lines.
- Reuse those helpers from `src/agent-task/canonical-updates.ts`, `src/agent-task/canonical-patch-application.ts`, and `src/agent-task/canonical-patch-application-report.ts`.
- Keep markdown text semantically identical and keep authority flags owned by the existing authority helper.

Out of scope:

- Schema, artifact id, artifact object field, authority flag value, lineage, target validation, artifact ref, ledger event, ToolPolicyGate, human gate, Workbench action, source mutation, scheduler, Goal Loop, runtime, remote, apply/close, or Harness evolution behavior changes.
- New artifact, report, manifest, descriptor, projection, state machine, gate, ledger policy, or runtime protocol.
- Broad maintenance-chain redesign or unrelated Workbench/scheduler/Goal Loop refactoring.

## Current Status

Ready to close.

Plan passed subagent review `019ee1fa-d86b-7721-9cc1-bb7c27b7e54b`.

Continuation rationale: this active change is the current structured work item and should continue until implementation, verification, review, and close are complete.

## Verification

Passed:

- `npx eslint src/agent-task/canonical-patch-application-authority.ts src/agent-task/canonical-updates.ts src/agent-task/canonical-patch-application.ts src/agent-task/canonical-patch-application-report.ts tests/unit/agent-task-boundaries.test.ts tests/unit/workbench-module-boundaries.test.ts`
- `npx vitest run tests/unit/agent-task-boundaries.test.ts`
- `npx vitest run tests/unit/workbench-module-boundaries.test.ts`
- `npm run typecheck`
- `npm run lint`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

Not run:

- `npm run test`: targeted unit and module-boundary tests cover the moved authority markdown helpers and their consuming renderers; this change does not alter runtime, Workbench action behavior, artifact schema/id, lineage, ledger, store, gate, scheduler, Goal Loop, or source mutation paths.
- `npx vitest run tests/slow/workbench-maintenance-flow.test.ts`: not needed because the refactor only moves static authority markdown section rendering and preserves artifact/store/gate behavior.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
- Plan review: subagent `019ee1fa-d86b-7721-9cc1-bb7c27b7e54b` returned PASS and required the helper to remain authority-markdown-only without artifact write, ledger, gate, runtime, or Workbench action responsibilities.
- Implementation review: subagent close-ready review `019ee204-2257-70b2-a3c0-1bcb0b5e972e` confirmed code/diff checks pass, targeted evidence is sufficient, and `README.md` remains untracked/unincluded. Its only blocking notes were close-ready status text updates, which this final handoff update resolves.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable for active handoff only; no durable rule or roadmap change planned. Current active handoff line counts: `AGENTS.md` 101 lines, `docs/STATUS.md` 108 lines.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
