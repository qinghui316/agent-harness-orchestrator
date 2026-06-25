# workbench-planning-decomposition-scope-honesty-v1

## Purpose

Strengthen Workbench planning / decomposition / readiness honesty for low-conflict scheduler demands. When a user constrains work to explicit source scopes, AHO must preserve those scopes through accepted planning artifacts and must not silently expand into tests, indexes, docs, or other files before exposing scheduler-ready continuation.

Reference source check: Open Dynamic Workflows makes the work list explicit before `pipeline()` / `parallel()`, and Symphony reconciles / revalidates before dispatch. AHO should mirror that principle by proving source scope before scheduler readiness rather than treating scheduler evidence as a full executor.

## Scope

In scope:

- Preserve explicit source scopes in planning bundle metadata and DecompositionPlan units.
- Mark plan/decomposition scope expansion when inferred work goes beyond user constrained scopes.
- Block `ready-for-scheduler-contract` when a parallel candidate has missing, overlapping, dependent, or unaccepted expanded scopes.
- Keep Workbench projection honest: no bounded scheduler continuation while scope expansion is unresolved.
- Add targeted planning/readiness/read-model/DOM coverage.

Out of scope:

- Full parallel executor, scheduler loop, slot allocator, child Change creation.
- Automatic apply, close, merge, remote landing, or Harness evolution.
- New workflow runtime, evidence family, permission system, or projection framework.

## Current Status

Completed / Ready to close.

## Verification

- `npx vitest run tests/unit/workbench-planning-scheduler-prep.test.ts tests/unit/automation-runtime.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run build` passed.
- `npm run test:workbench` passed.
- Real UI acceptance used `E:\aho-accept\scope-honesty-v1b\src` and `E:\aho-accept\scope-honesty-v1b\home`.
- Real UI positive path: Workbench showed external-local/Harness ready, generated planning draft, displayed `范围：保持在 src/alpha.ts、src/beta.ts`, human-confirmed planning and decomposition, assessed readiness as `ready-for-scheduler-contract`, and exposed only the current primary gate `准备低冲突任务执行路径`.
- Expansion blocking is covered by targeted Workbench projection test: a plan that silently adds `tests/module-a.test.ts` outside accepted scopes is `blocked-parallel-guardrails` and does not expose scheduler prepare/contract actions.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: first Workbench start used a malformed PowerShell env assignment and default registry; second direct path start hit a direct-restore conflict; registered project id `src` with explicit `AHO_HOME` was used for the accepted UI run.
- Screenshots / artifacts / run ids: browser DOM evidence recorded in this change work log; external run ids `run-20260625-123312-src-alpha-ts-src-beta-ts-alphareadylabel-be-68a32d` and readiness `readiness-1782362166862-49102b`.
- External source/state safety: source root was not modified by execution; no apply/code.run was performed. Sandbox `git status --short` shows only initialization files `?? .agent-harness/` and `?? AGENTS.md`.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.

