# workbench-readonly-runtime-activity-log-v1

## Purpose

Add a read-only Workbench `运行日志` surface that projects existing runtime
evidence into a bounded user-readable timeline. The surface follows the
reference-style runtime-log reading pattern, but it is not a command console,
does not execute actions, and does not become workflow truth.

## Scope

In scope:

- Project/topic-scoped runtime activity timeline API.
- Read-only projection over existing evidence: Codex run metadata/events,
  provider runtime readiness, runtime diagnostics, validation/audit summaries,
  message Skill/attachment metadata, terminal readiness, and sanitized action
  errors.
- Workbench center `运行日志` view and right-rail diagnostics navigation.
- Tests proving the surface is bounded, read-only, and free of fake controls.

Out of scope:

- Running commands, opening/writing Terminal, retry/fix/continue actions.
- New provider, normal Agent mode, Browser, Git write, file editing.
- New persistent runtime-log database or workflow truth.
- Changing confirmation, ToolPolicyGate, Goal Loop, Scheduler, validation,
  audit, apply/close, remote, PR, or Harness evolution.

## Current Status

Ready to close.

## Verification

- `npm run typecheck`
- `npx vitest run tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx tests/unit/codex.test.ts`
- `npx vitest run tests/unit/workbench-read-model.test.ts`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`

Harness checks still pending at this handoff point.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: initial targeted test
  caught raw stdout/stderr artifact refs in the timeline; the projection now
  filters stdout/stderr/prompt/lastMessage/codexEvents from default refs.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
