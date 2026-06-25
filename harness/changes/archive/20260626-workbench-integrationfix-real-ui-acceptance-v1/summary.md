# workbench-integrationfix-real-ui-acceptance-v1

## Purpose

Run a real Workbench UI acceptance pass for the latest Codex-backed
IntegrationFix path. The goal is to prove, in an E-drive external sandbox, that
a low-conflict multi-worktree demand can reach a failed IntegrationCheck,
invoke the real Codex-backed bounded repair in the integration fix checkout,
rerun aggregate validation/audit, and stop at the human integration
apply/discard gate or an accurately classified blocker.

This change is acceptance-driven. Product code changes are allowed only when
the real UI path exposes a concrete blocker in an existing owner.

## Scope

In scope:

- Create and use `E:\aho-accept\integrationfix-real-ui-v1\src` and
  `E:\aho-accept\integrationfix-real-ui-v1\home`.
- Prepare a small real Node/TypeScript external source with installed
  dependencies and a real aggregate validation/audit failure path.
- Drive the Workbench through the browser UI from ordinary demand to scheduler
  workers, IntegrationCheck, Codex-backed IntegrationFix, and final
  integration apply/discard gate or blocker.
- Record real Codex, worker, validation/audit, IntegrationCheck,
  IntegrationFix, repaired patch, and source safety evidence.
- If the acceptance path exposes a product blocker, fix only the existing
  owner path required to continue.

Out of scope:

- New workflow runtime, permission system, projection framework, scheduler
  executor, child Change framework, or evidence family.
- Automatic integration apply/discard, remote merge/push/PR, Harness
  evolution, raw scheduler automation, full parallel executor, or source-root
  mutation before a human gate.
- Marker-only IntegrationFix success as product acceptance.

## Current Status

Completed; ready to close.

Real UI acceptance completed in:

- Source: `E:\aho-accept\integrationfix-real-ui-v1\src`
- Runtime home: `E:\aho-accept\integrationfix-real-ui-v1\home`
- Workbench URL: `http://127.0.0.1:4357/`

The final successful demand was:

`请做一个低冲突两文件改动：把 src/alpha.ts 里的 alphaMode 从 legacy 改成 modern，把 src/beta.ts 里的 betaMode 从 legacy 改成 modern。计划中保持两个明确 source scopes：src/alpha.ts 和 src/beta.ts；两个任务互不重叠、无依赖，计划确认后进入低冲突任务执行路径，两个 worker 各自验证通过后再做组合检查。不要在 worker 阶段新增 src/integration-note.ts，组合验证需要时由 IntegrationFix 处理。`

Key evidence:

- Change id: `src-alpha-ts-alphamode-legacy-modern`.
- Scheduler run: `scheduler-run-20260625164120-d30d54c9`.
- Worker worktrees:
  - `wt-20260626-004211-968996` changed `src/alpha.ts`.
  - `wt-20260626-005311-91f959` changed `src/beta.ts`.
- Worker validation/audit:
  - `scheduler-worker-validation-2127ad6f`,
    `scheduler-worker-audit-97c97f02`.
  - `scheduler-worker-validation-636dbca0`,
    `scheduler-worker-audit-c617123e`.
- Ready candidate: `scheduler-integration-candidate-e140c478`.
- IntegrationCheck: `apply-check-20260625165935-fa41891a`.
- IntegrationFix attempt:
  `fix-apply-check-20260625165935-fa41891a-mqtqz4du`.
- IntegrationFix Codex run:
  `fix-apply-check-20260625165935-fa41891a-mqtqz4du-codex`
  (`runtime = coder-codex`, `executionMode = worktree`, `status = completed`,
  `exitCode = 0`).
- Repaired artifact:
  `workbench/integration-checks/apply-check-20260625165935-fa41891a/repaired.patch`
  with hash `af26694518e45610614cae93c86fe7be30b64445576f95a1438aaed69fc1cd45`.
- Aggregate validation: `passed`.
- Aggregate audit: `approved`.
- Final Workbench primary gate: `integration-apply` with human approval
  actions `apply-check-apply:apply-check-20260625165935-fa41891a` and
  `apply-check-discard:apply-check-20260625165935-fa41891a`.
- External source root remained clean before any integration apply/discard:
  `git -C E:\aho-accept\integrationfix-real-ui-v1\src status --short` returned
  no output.

Blockers found and fixed in this change:

- Product path blocker / planning decomposition: Codex proposed plans with two
  explicit scoped tasks were not reliably converted into scheduler-ready
  DecompositionPlan task scopes, and negated files could be treated as accepted
  scopes. Fixed in the existing Workbench planning builder owner.
- Product path blocker / Goal Loop assisted gate: controller refresh and
  gate-readiness actions could omit current scheduler target ids such as
  `schedulerClaimReservationId`. Fixed in the existing Workbench Goal Loop
  confirmation projection owner by merging current gate scope into assisted
  actions.
- Product boundary blocker / controlled continuation: after the ready
  integration candidate, bounded controlled continuation auto-consumed
  `planning.scheduler.integration-check.run`. Fixed in the existing visible
  Goal Loop current-gate owner so IntegrationCheck is a manual scheduler
  barrier and runtime continuation stops before dispatch.

## Verification

- `npx vitest run tests/unit/visible-goal-loop-current-gate.test.ts tests/unit/workbench-goal-loop-surface.test.ts tests/unit/goal-loop-runtime.test.ts` passed.
- `npx vitest run tests/unit/integration-aggregate-validation.test.ts tests/unit/integration-fix-attempts.test.ts tests/unit/workbench-planning-scheduler-prep.test.ts` passed.
- `npx vitest run tests/unit/workbench-scheduler-runtime-surface.test.ts tests/unit/automation-runtime.test.ts tests/unit/controlled-scheduler-advance-candidate.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run test:workbench` passed.
- `npm run build` passed.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: the final demand explicitly stated
  two source scopes and asked worker phases not to add `src/integration-note.ts`
  so that aggregate validation would exercise IntegrationFix.
- Retries or environment failures:
  - Initial sandbox was accidentally initialized repo-local; it was discarded
    and rebuilt as external-local.
  - External-local source marker files were committed into the fixture so the
    source root started clean.
  - Browser UI initially required a project refresh before showing harness
    ready state.
- Product-fixable retries:
  - First acceptance attempt fell into ordinary single-worktree execution;
    fixed by preserving Codex proposed-plan scoped tasks in planning.
  - Assisted Goal Loop actions initially failed stale target revalidation;
    fixed by carrying current scheduler target ids.
  - Controlled continuation initially over-consumed IntegrationCheck; fixed by
    treating `planning.scheduler.integration-check.run` as a manual scheduler
    barrier.
- Browser / DOM evidence:
  - Workbench snapshot returned HTTP 200 at `http://127.0.0.1:4357/`.
  - Final selected topic `src-alpha-ts-alphamode-legacy-modern` showed primary
    kind `integration-apply`, status `passed`, and human actions
    `apply-check-apply:*`, `apply-check-feedback:*`, `apply-check-discard:*`,
    and evidence link. No integration apply/discard action was auto-executed.
- Artifacts / run ids:
  - Planning run:
    `run-20260626-001018-src-alpha-ts-alphamode-legacy-modern-2fa3b6`
    (`codex-readonly`, completed).
  - Worker Codex runs:
    `run-20260626-004210-src-alpha-ts-alphamode-legacy-modern-bbcb1f`
    and `run-20260626-005311-src-alpha-ts-alphamode-legacy-modern-34fd89`.
  - Worker validation runs:
    `run-20260626-005211-src-alpha-ts-alphamode-legacy-modern-4ad060`
    and `run-20260626-005825-src-alpha-ts-alphamode-legacy-modern-400e05`.
  - Worker audit runs:
    `run-20260626-005222-src-alpha-ts-alphamode-legacy-modern-cb9875`
    and `run-20260626-005841-src-alpha-ts-alphamode-legacy-modern-1bb975`.
  - IntegrationFix Codex run:
    `fix-apply-check-20260625165935-fa41891a-mqtqz4du-codex`, with
    `run.json`, `codex-events.jsonl`, `last-message.md`, `diff.patch`,
    `diff-stat.txt`, and `implementation.md`.
- External source/state safety:
  - External source root remained clean before integration apply/discard; no
    integration apply/discard, remote, merge, PR, or Harness evolution action
    was executed.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence:
  - None blocking. The next product slice can choose a wider scheduler or
    Goal-driven loop capability, but IntegrationCheck / IntegrationFix
    apply-discard remains manually gated.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: active handoff pointer will be checked before close.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: AGENTS.md, docs/STATUS.md,
  and docs/CURRENT-DEVELOPMENT-PLAN.md updated for archive handoff.
- Old experience retained / merged / retired / archive-only: not applicable.
