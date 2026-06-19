# Spec: Workbench Feedback Conversation Test Domain Split

## Goal

Make Workbench unit verification easier to target by moving proposal-feedback and conversation-lifecycle regression coverage into focused domain suites, leaving residual `tests/unit/workbench.test.ts` focused on AgentTask/delegation/boundary coverage.

## Users

- Future agents and maintainers running targeted Workbench verification.
- Reviewers checking whether Workbench behavior is protected without running the whole slow Workbench aggregate.

## Acceptance Criteria

- AC-001: Proposal-feedback coverage lives in `tests/unit/workbench-feedback-surface.test.ts` and no longer lives in residual `tests/unit/workbench.test.ts`.
- AC-002: Conversation-lifecycle coverage lives in `tests/unit/workbench-conversation-lifecycle.test.ts` and no longer lives in residual `tests/unit/workbench.test.ts`.
- AC-003: Residual `tests/unit/workbench.test.ts` retains only AgentTask/delegation/boundary residual coverage and has no unused imports or local helpers left from the moved domains.
- AC-004: `package.json` excludes both new suites from `test:fast` and includes both in `test:workbench` before residual `tests/unit/workbench.test.ts`.
- AC-005: Targeted verification passes for the new suites, residual suite, touched-file lint, typecheck, lint, `test:fast`, and Harness checks.

## Non-Goals

- Change Workbench runtime behavior, user-facing behavior, manager/server APIs, ToolPolicy, scheduler, Goal Loop, source apply, remote handoff, maintenance, or human gates.
- Introduce a new fixture framework, local projection system, local state machine, or local validation gate.
- Move AgentTask/delegation/boundary residual tests in this phase.
- Run full `npm run test` without evidence of broader drift beyond test topology.

## Constraints

- Follow Architecture Growth Control / Core Mechanism Reuse: reuse existing test fixtures and owned suites; do not create a feature-local mini-framework.
- Preserve public APIs and Workbench behavior exactly; this is a test relocation and package-script membership change.
- Keep `README.md` unrelated and untracked.
- Use targeted verification proportionate to test-topology risk.

## Risks

- Package scripts could omit a moved suite or accidentally include it in `test:fast`.
- Residual `tests/unit/workbench.test.ts` could keep unused imports/helpers or retain moved-domain coverage.
- Moving tests could accidentally duplicate setup patterns instead of reusing existing Workbench fixtures.
