# Spec: Auto Evolve Harness Phase 8W 9B Scheduler Pre Executor Evidence

## Goal

Evaluate the pending Harness evolution window after five archived changes and decide whether Phase 8W-9B exposed a new repository rule, template, lint, or documentation gap.

## Users

- Future AHO implementers planning parallel scheduler work.
- Agents using ECL/Harness rules to avoid turning evidence contracts into execution authority.
- Reviewers checking that product changes remain modular and human-gated.

## Acceptance Criteria

- AC-001: The pending evolution window for Phase 8W, 8Y, 8Z, 9A, and 9B is evaluated and recorded.
- AC-002: An evolution proposal records the decision and rationale.
- AC-003: Independent subagent review is recorded with scope, recommendation, score, and limitations.
- AC-004: `harness-evolve.ps1 mark-complete` removes `harness/evolution/pending.md` and appends a results row.
- AC-005: `AGENTS.md` and `docs/STATUS.md` end with active change none, pending evolution none, and latest evolution pointing at this archived change.
- AC-006: No product code, runtime behavior, Workbench action, route, CLI command, UI, scheduler executor, permission engine, or workflow-truth authority changes.
- AC-007: Harness verification passes, or any pre-existing failure is explicitly recorded.

## Non-Goals

- Do not implement a parallel executor.
- Do not add a scheduler runtime, slot allocator, WorkerLease allocation, WorkerSession creation, worktree creation, run creation, or child Change creation.
- Do not change product artifacts, action payloads, projections, SSE, thread storage, ToolPolicyGate behavior, or workflow truth.

## Constraints

- Current `README.md` is unrelated and remains untracked.
- If subagent review is used, it must be evidence-only and must not edit files.
- If no concrete rule gap is found, the correct result is `noop/subagent_review`.
- Future executor work must continue to consume scheduler evidence, Runtime Continuity, ToolPolicyGate, and human gates rather than treating launch preflight as authorization.

## Risks

- Over-promoting a rule could add process friction without preventing a real defect.
- Under-promoting a rule could let a future executor bypass SchedulerContract, dry-run, worker-plan, claim/reconcile, launch preflight, Runtime Continuity, ToolPolicyGate, or human gate requirements.
- Documentation drift could leave future agents believing pending evolution is still open.
