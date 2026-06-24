# workbench-scheduler-worker-integration-real-acceptance-v1

## Purpose

Continue the real Workbench scheduler acceptance from the latest low-conflict
TaskGraph reachability result. The previous E-drive UI run proved that an
ordinary demand can reach scheduler worker start through `完全访问权限`, Goal Loop
preparation, and the existing controlled scheduler path, but it stopped because
the external source root lacked `node_modules`.

This change prepares a fresh E-drive sandbox with dependencies installed and
then verifies how far the real scheduler worker path can progress through
worker `coder-codex`, validation/audit, integration evidence, and the next real
human/blocker gate.

## Scope

In scope:

- Create a fresh external source at `E:\aho-accept\scheduler-worker-v1\src` and
  external AHO runtime home at `E:\aho-accept\scheduler-worker-v1\home`.
- Prepare source dependencies as acceptance-environment setup only.
- Run real browser Workbench acceptance through the existing action path.
- Record real UI, Codex, worker, validation/audit, integration, and source
  safety evidence.
- If the run exposes a product path bug, fix the smallest owner path and
  verify it.

Out of scope:

- Full parallel executor, whole-wave dispatch, slot allocator, child Change
  creation, automatic apply/close/merge, remote landing, Harness evolution
  auto-apply, new evidence family, or a second scheduler runtime.
- Adding raw `planning.scheduler.*` actions to the `完全访问权限` allowlist.
- Making AHO automatically run `npm install` or `npm ci`.

## Current Status

Completed / ready to close.

## Verification

Passed:

- `npx vitest run tests/unit/scheduler-worker-scope.test.ts`
- `npx vitest run tests/unit/workbench-module-boundaries.test.ts`
- `npx vitest run tests/slow/workbench-scheduler-worker-rework-flow.test.ts`
- `npx vitest run tests/unit/scheduler-worker-scope.test.ts tests/slow/workbench-scheduler-worker-runtime.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`

The real Workbench server for the final run was stopped after evidence capture.

## Acceptance Feedback

- Manual config edits: none inside AHO. The external acceptance source was
  prepared with `npm install` as environment setup only.
- Extra prompts or reviewer instructions: none after the task-scoped worker
  prompt fix.
- Retries or environment failures: the first run at
  `E:\aho-accept\scheduler-worker-v1\src` exposed a product path bug: worker
  audit/rework treated sibling TaskGraph scopes as missing work. The fix keeps
  worker code/audit/rework scoped to the current scheduler reservation source
  scope and rejects sibling-scope rework edits. The formal rerun used
  `E:\aho-accept\scheduler-worker-v1b\src` and
  `E:\aho-accept\scheduler-worker-v1b\home`.
- Browser / UI evidence: Workbench URL `http://127.0.0.1:4336/`; visible gate
  sequence reached planning, decomposition/readiness, scheduler preparation,
  `完全访问权限`, two scheduler workers, worker validation/audit, integration
  candidate, and the final `planning.scheduler.integration-check.run` primary
  gate.
- Real Codex artifacts: worker code runs
  `run-20260625-020328-src-alpha-ts-src-beta-ts-alphalabel-betalab-5e1b4d` and
  `run-20260625-020621-src-alpha-ts-src-beta-ts-alphalabel-betalab-855dce`
  each contain `run.json`, `codex-events.jsonl`, `last-message.md`,
  `diff.patch`, and `diff-stat.txt`.
- Worker validation/audit evidence: validations
  `run-20260625-020515-src-alpha-ts-src-beta-ts-alphalabel-betalab-d3a945` and
  `run-20260625-020815-src-alpha-ts-src-beta-ts-alphalabel-betalab-03025b`
  passed; audits
  `run-20260625-020530-src-alpha-ts-src-beta-ts-alphalabel-betalab-1a1a2a` and
  `run-20260625-020835-src-alpha-ts-src-beta-ts-alphalabel-betalab-6dfd3d`
  were approved.
- Integration evidence: `scheduler-integration-candidate-7fe358fd` is `ready`
  with two ready targets and Workbench now exposes
  `planning.scheduler.integration-check.run` as the next human-confirmed gate.
- External source/state safety: `git status --short` in
  `E:\aho-accept\scheduler-worker-v1b\src` stayed empty before and after the
  automation run. No automatic source apply, close, merge, remote landing, or
  Harness evolution occurred.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: no new framework was
  added. The only product fix was task-scoped scheduler worker prompt/diff
  boundary enforcement in the scheduler-runtime owner.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: completed at close for `AGENTS.md`,
  `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Experience lifecycle result: not applicable unless the acceptance produces a
  Harness evolution trigger.
- Roadmap/current-direction stale language check: current handoff docs now point
  to this archive and keep detailed run history archive-only.
- Old experience retained / merged / retired / archive-only: detailed sandbox
  run history should remain archive-only.
