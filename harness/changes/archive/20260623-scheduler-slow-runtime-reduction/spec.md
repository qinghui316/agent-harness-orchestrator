# Spec: scheduler-slow-runtime-reduction

## Goal

Make the scheduler slow verification gate practical and trustworthy by reducing
repeated end-to-end setup work and eliminating hang-prone test topology. The
suite must still prove scheduler runtime, worktree, validation/audit,
integration, completion, controlled-gate, and source-safety behavior.

## Users

- AHO maintainers using `npm run test:workbench` or
  `npm run test:workbench:slow:scheduler` before product changes.
- Future agents deciding whether a Workbench scheduler failure is product
  regression or verification topology debt.

## Acceptance Criteria

- AC-001: Each scheduler slow suite member has recorded diagnostic evidence:
  elapsed time, pass/fail/timeout, and whether Vitest/Node/Git child processes
  are left behind.
- AC-002: `test:workbench:slow:scheduler` remains an explicit gate covering the
  four scheduler domains: two-worker integration, discard completion, worker
  rework, and worker runtime.
- AC-003: Later-stage scheduler tests use controlled canonical intermediate
  fixtures where safe, rather than replaying the full worker chain for every
  scenario.
- AC-004: One two-worker scheduler end-to-end golden flow remains intact and
  continues to cover real Workbench action execution through worker start,
  result, validation, audit, integration candidate, IntegrationCheck handoff,
  integration outcome, and scheduler completion.
- AC-005: No scheduler/runtime/source-safety assertion is removed without an
  equivalent targeted assertion in another suite.
- AC-006: If diagnostics reveal a real product cleanup or runtime leak, the
  minimal product fix is implemented behind the existing owner boundary and is
  covered by a targeted test.
- AC-007: Handoff docs and active change review clearly state whether runtime
  cost is resolved or which file/stage remains the bottleneck.

## Non-Goals

- Implementing full-auto task mode.
- Implementing a scheduler loop, whole-wave dispatch, slot allocator, automatic
  child Change creation, or parallel executor.
- Changing Workbench action payload schema or runtime artifact schema.
- Replacing real scheduler coverage with pure unit mocks.

## Constraints

- Change/ECL, accepted artifacts, run artifacts, validation, audit, worktree
  state, apply/close decisions, and Harness evolution records remain workflow
  truth.
- Scheduler and Goal Loop evidence remain non-executing; this change must not
  promote them to workflow authority.
- Test fixtures may seed canonical artifacts only when they preserve the same
  target ids, stale-revalidation inputs, event files, and source-safety
  invariants that the production path consumes.
- Existing untracked `README.md` remains unrelated and must not be included.

## Risks

- Over-seeding could hide a real scheduler integration bug; keep one golden
  end-to-end flow and assert seeded artifacts through production projections
  and Workbench actions.
- Slow behavior may come from a real resource leak rather than test topology;
  diagnostics must check leftover child processes before fixture refactoring is
  treated as sufficient.
- Package script changes can silently reduce coverage; review must map each
  scheduler domain to a suite member.
