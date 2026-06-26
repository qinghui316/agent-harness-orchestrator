# workbench-local-scheduler-terminal-path-real-ui-scout-v1

## Purpose

Run one real Workbench UI acceptance pass that composes the already validated
local scheduler pieces into a single terminal path:

`ordinary demand -> Codex Plan Mode -> human plan confirmation -> scoped
full-access controlled scheduler workers -> manual IntegrationCheck ->
integration apply/discard -> local landing.prepare -> local change.close/archive`.

This is an acceptance and minimal-fix change. It must not add a new workflow
runtime, central workflow database, raw scheduler full-access allowlist, PR /
remote / merge path, or Harness evolution automation.

## Scope

In scope:

- E-drive external sandbox real UI acceptance.
- A low-conflict two-file demand that reaches same-Change scheduler worker
  outputs and an integration candidate through existing controlled scheduler
  paths.
- Manual IntegrationCheck and manual integration apply/discard gate evidence.
- Local landing and close/archive terminal evidence after integration apply.
- Minimal fixes only in existing owners if the composed path exposes a blocker.
- Closeout handoff drift alignment in `docs/STATUS.md` and
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.

Out of scope:

- Central workflow database.
- Full parallel executor, scheduler loop, slot allocator, or child Change.
- Raw `planning.scheduler.*` actions in the full-access allowlist.
- Automatic manual IntegrationCheck, integration apply/discard, PR, remote,
  merge, or Harness evolution.
- C-drive acceptance directories.

## Current Status

Completed.

The composed real UI path reached the local terminal blocker branch. The path
proved scheduler worker progression, manual IntegrationCheck, manual
integration apply, and local landing readiness. Final close/archive did not run
because the selected external-local Change still has `Review status is pending`;
Workbench now surfaces that as the primary local blocker instead of stale
scheduler/audit context or PR provider noise.

## Verification

- `npm run build` passed before launching Workbench and after product fixes.
- `npx vitest run tests/unit/landing-source-diff.test.ts` passed.
- `npx vitest run tests/unit/workbench-read-model.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run test:workbench` passed.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none blocking. Browser tab binding had to be
  refreshed after the in-app browser session changed.
- Screenshots / artifacts / run ids:
  - Workbench URL: `http://127.0.0.1:4335/`.
  - Demand / Change id:
    `src-alpha-ts-src-beta-ts-src-alpha-ts-export-fun`.
  - Planning run:
    `run-20260626-173759-src-alpha-ts-src-beta-ts-src-alpha-ts-export-fun-2ea28e`
    (`codex-readonly`, proposal-only).
  - SchedulerRun: `scheduler-run-20260626094410-4bde0710`.
  - Worker worktrees:
    `wt-20260626-174528-9d481e` and
    `wt-20260626-174917-ce6271`.
  - Worker Codex runs:
    `run-20260626-174528-src-alpha-ts-src-beta-ts-src-alpha-ts-export-fun-33e3a6`
    and
    `run-20260626-174917-src-alpha-ts-src-beta-ts-src-alpha-ts-export-fun-628626`.
  - Worker validation/audit:
    `run-20260626-174835-src-alpha-ts-src-beta-ts-src-alpha-ts-export-fun-3ede00`,
    `run-20260626-174843-src-alpha-ts-src-beta-ts-src-alpha-ts-export-fun-e0cd65`,
    `run-20260626-175054-src-alpha-ts-src-beta-ts-src-alpha-ts-export-fun-d60840`,
    `run-20260626-175106-src-alpha-ts-src-beta-ts-src-alpha-ts-export-fun-ee7bb1`.
  - IntegrationCandidate:
    `scheduler-integration-candidate-4dd1a0d7`.
  - IntegrationCheck / apply gate:
    `apply-check-20260626095254-0d4568bc`; handoff
    `scheduler-integration-check-handoff-2e0c68f1`.
  - Landing package:
    `landing-integration-check-225229192537`, status `ready`, review `ready`.
- External source/state safety: target source
  `E:\aho-accept\local-scheduler-terminal-v1\src`, runtime home
  `E:\aho-accept\local-scheduler-terminal-v1\home`.
  - Before integration apply: source clean.
  - After integration apply: expected dirty source only in `src/alpha.ts` and
    `src/beta.ts`.
  - No PR, remote, merge, push, or Harness evolution action ran.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence:
  - Fixed Workbench projection priority so selected local landing gates and
    local terminal blockers win over stale scheduler/audit context.
  - Fixed landing attribution for applied IntegrationCheck patches by using a
    source-comparable normalized patch hash.
  - Remaining terminal blocker: local close requires review completion
    (`Review status is pending`).

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: closeout only; detailed run ids remain here.
- Experience lifecycle result: archive-only product evidence.
- Roadmap/current-direction stale language check: handoff docs will point to
  this local terminal scout and the remaining local close review blocker.
- Old experience retained / merged / retired / archive-only: detailed real UI
  run ids, E-drive paths, and gate sequence should remain archive-only.
