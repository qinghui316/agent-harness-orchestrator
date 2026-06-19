# Spec: Workbench AgentTask Residual Test Domain Split

## Goal

Eliminate the final residual Workbench unit monolith by moving its remaining AgentTask/delegation/boundary coverage into an explicitly named capability-domain suite and updating current docs so future agents no longer plan around `tests/unit/workbench.test.ts`.

## Users

- Future agents and maintainers running targeted Workbench verification.
- Reviewers checking that Workbench AgentTask/delegation behavior remains protected after the residual monolith is deleted.

## Acceptance Criteria

- AC-001: The four current AgentTask/delegation/boundary residual tests live in `tests/unit/workbench-agent-task-domain.test.ts`.
- AC-002: `tests/unit/workbench.test.ts` is deleted and no active package script references it.
- AC-003: `package.json` excludes the new suite from `test:fast`, includes it exactly once in `test:workbench` at the old residual position, has no empty command segment, and every `vitest run tests/...` target in `test:workbench` exists.
- AC-004: `docs/DEVELOPMENT.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, and `AGENTS.md` no longer describe residual `tests/unit/workbench.test.ts` splitting as current work.
- AC-005: Targeted suite, package contract, deleted-file check, docs drift grep, touched-file lint, typecheck, repo lint, `test:fast`, and Harness checks pass.

## Non-Goals

- Product runtime, Workbench server/API/UI behavior, AgentTask domain logic, ToolPolicy rules, scheduler, Goal Loop, source apply, remote, maintenance, or human-gate behavior changes.
- New fixture framework, local projection system, local state machine, or local validation gate.
- Full Workbench aggregate or full `npm run test` unless contract checks or review reveal broader runtime drift.

## Constraints

- Follow Architecture Growth Control / Core Mechanism Reuse: test ownership improves targeting but does not create new cross-cutting mechanisms.
- Preserve public APIs and Workbench behavior exactly; this is a test relocation, package-script, and current-doc handoff cleanup change.
- Keep `README.md` unrelated and untracked.
- Update current docs because deleting the residual file makes prior current-plan wording stale.

## Risks

- Package scripts could retain a dead `tests/unit/workbench.test.ts` target or omit the new suite.
- Current docs could keep directing future agents to split a deleted residual file.
- The new suite name could be confused with core AgentTask domain tests; plan/review must clarify that this is Workbench projection/delegation surface coverage, while `agent-task-boundaries.test.ts` remains core AgentTask/maintenance boundary coverage.
