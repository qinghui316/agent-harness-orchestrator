# workbench-scheduler-integrationcheck-real-acceptance-v1

## Purpose

Validate the scheduler IntegrationCheck handoff through the real Workbench UI in an external E-drive sandbox. The previous accepted slice reached two ready scheduler worker outputs and stopped at the human-confirmed `planning.scheduler.integration-check.run` gate; this change confirms what happens after that gate.

The target result is either a real IntegrationCheck with aggregate validation/audit and a visible existing human apply/discard gate, or a precisely classified blocker. This does not widen scoped automation, raw scheduler actions, source apply, close/archive, merge, remote landing, or Harness evolution authority.

## Scope

In scope:

- Create and use E-drive acceptance sandboxes under `E:\aho-accept\...`.
- Run a real browser Workbench path from ordinary demand to scheduler integration candidate.
- Manually confirm the real `planning.scheduler.integration-check.run` gate.
- Record IntegrationCheck status, aggregate validation/audit, bounded internal fix attempts, final visible gate, and source safety.
- If a product blocker appears, make the smallest owner-scoped fix and verify it.

Out of scope:

- Full parallel executor, slot allocator, whole-wave dispatch, or child Change creation.
- Adding raw `planning.scheduler.*` actions to the `完全访问权限` allowlist.
- Automatic source apply, close/archive, merge, remote landing, or Harness evolution.
- New evidence families or a second scheduler/integration runtime.

## Current Status

Completed. Ready to close.

The change stayed within the existing scheduler/IntegrationCheck owners. Two narrow product fixes were required before the final acceptance:

- `src/automation-runtime/runner.ts`: bounded continuation now finalizes when `maxSteps` is reached instead of hanging while trying to refresh a terminal/unsupported next gate. It preserves the existing `audit.accept -> result.apply` terminal-human-gate stop reason.
- `src/workbench/projections/read-model/confirmation/goal-loop.ts`: `planning.scheduler.integration-check.run` is treated as a manual scheduler gate. It is not wrapped by controlled continuation or `完全访问权限`.

Continuation rationale: this change validates the existing scheduler IntegrationCheck handoff after the previous archived change stopped at the `planning.scheduler.integration-check.run` gate.

## Verification

Verification completed:

- `npx vitest run tests/unit/automation-runtime.test.ts`
- `npx vitest run tests/unit/automation-runtime.test.ts tests/unit/workbench-goal-loop-surface.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: v1g used `$env:AHO_HOME = 'E:\aho-accept\scheduler-integrationcheck-v1g\home'` and `external-local` project memory. No source files were manually edited after the target repo baseline was created.
- Extra prompts or reviewer instructions: the real demand was a low-conflict two-file change for `src/alpha.ts` and `src/beta.ts`; planning was confirmed manually before execution.
- Retries or environment failures:
  - v1f proved the scheduler worker path and IntegrationCheck but initially launched with default AHO home, so integration worktree was under `C:\Users\qinghui\.agent-harness\...`. This was treated as environment setup drift, not a product pass for the E-drive requirement.
  - v1g reran with E-drive `AHO_HOME`; IntegrationCheck worktree path was `E:\aho-accept\scheduler-integrationcheck-v1g\home\worktrees\scheduler-integrationcheck-v1g\checkouts\integration\apply-check-20260624205104-80da3aab`.
  - The real planning/decomposition path produced two ready worker targets plus extra test-file diffs despite the demand asking not to modify tests; the existing scheduler path still produced a valid IntegrationCheck. This is recorded as planning/agent-quality follow-up, not an IntegrationCheck blocker.
- Screenshots / artifacts / run ids:
  - Workbench URL: `http://127.0.0.1:4347/`.
  - Source root: `E:\aho-accept\scheduler-integrationcheck-v1g\src`.
  - AHO home/runtime home: `E:\aho-accept\scheduler-integrationcheck-v1g\home`.
  - Change/topic id: `src-alpha-ts-alphareadylabel-strin`.
  - Scheduler run: `scheduler-run-20260624201437-93545e84`.
  - Scheduler integration candidate: `scheduler-integration-candidate-c71d788b`, status `ready`, ready worktrees `wt-20260625-044626-e299a6`, `wt-20260625-042651-4b4dc1`.
  - Worker validation/audit evidence: `run-20260625-044854-src-alpha-ts-alphareadylabel-strin-b32fdd` / `run-20260625-044909-src-alpha-ts-alphareadylabel-strin-56e342`, and `run-20260625-042824-src-alpha-ts-alphareadylabel-strin-37da6a` / `run-20260625-042836-src-alpha-ts-alphareadylabel-strin-1a0426`.
  - IntegrationCheck handoff: `scheduler-integration-check-handoff-05603c60`, status `completed`.
  - IntegrationCheck/apply check: `apply-check-20260624205104-80da3aab`, status `passed`.
  - Aggregate validation: `aggregate-validation-apply-check-20260624205104-80da3aab`, status `passed`, command `git diff --check`, exit code `0`.
  - Aggregate audit: `aggregate-audit-apply-check-20260624205104-80da3aab`, status `approved`, findings `[]`.
  - Combined patch hash: `7a3faaab70220d405ae31300edb21e1480cbf9302584ac730e40f5a242e57a32`.
  - Final visible primary gate: `integration-apply` with actions `apply-check.apply`, feedback, `apply-check.discard`, and evidence. No automatic source apply/close/merge occurred.
- External source/state safety: `git -C E:\aho-accept\scheduler-integrationcheck-v1g\src status --short` was empty after IntegrationCheck. Source root remained unmodified before any apply gate.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: follow-up should consider planning/decomposition honesty so a two-source-file request does not produce extra test/index work items unless explicitly justified by the accepted plan.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: completed for `AGENTS.md`, `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Experience lifecycle result: not an auto-evolution change.
- Roadmap/current-direction stale language check: current handoff now points to this archive and keeps full parallel executor / automatic apply / merge / close out of the baseline.
- Old experience retained / merged / retired / archive-only: detailed sandbox/run history remains archive-only; current docs retain only the new baseline and next recommended work.
