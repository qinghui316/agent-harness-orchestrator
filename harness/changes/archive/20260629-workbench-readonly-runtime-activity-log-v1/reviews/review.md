# Review: workbench-readonly-runtime-activity-log-v1

## Scope Review

Implemented a read-only runtime activity log:

- `src/server/workbench/runtime-activity-log.ts` aggregates existing evidence
  into a bounded project/topic timeline.
- `GET /api/projects/:id/runtime/activity` exposes the projection.
- Workbench center tabs include `运行日志`.
- Right rail `诊断` remains a summary panel and links to the center log.

No write route, workflow action, terminal command path, provider selector,
retry/fix/continue action, or new persistent runtime-log store was added.

## Boundary Review

- Provider capability is read through the existing Codex provider runtime
  summary; the projection does not reimplement provider readiness.
- Timeline refs intentionally omit raw `stdout`, `stderr`, prompt,
  last-message, and Codex event artifact refs.
- Attachments and file refs are shown only as bounded metadata.
- Terminal output is not ingested; only terminal availability/diagnostic
  summaries can appear.
- `confirmationQueue.primary`, Goal Loop, Scheduler, validation/audit,
  apply/close, remote, PR, and Harness evolution were not changed.

## Test Evidence

- `npm run typecheck`
- `npx vitest run tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx tests/unit/codex.test.ts`
- `npx vitest run tests/unit/workbench-read-model.test.ts`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`

## Remaining Risk

Real browser acceptance screenshots were not captured in this turn. The DOM
tests cover the user-visible navigation and no-fake-control boundaries; a later
UI polish pass can capture screenshots if needed.
