# Spec: Workbench Verification Runtime Convergence

## Goal

Make Workbench verification usable as a daily signal by separating ordinary
aggregate coverage from the remaining full-chain release/deep scheduler golden
path.

## Users

- AHO maintainers running `npm run test:workbench` during product work.
- Future agents deciding whether a Workbench failure is product breakage or
  verification topology debt.

## Acceptance Criteria

- AC-001: `npm run test:workbench` remains the daily Workbench aggregate gate
  and completes in the ordinary tool window.
- AC-002: The full scheduler two-worker integration golden path remains
  runnable through an explicit release/deep script.
- AC-003: Daily scheduler slow coverage still includes worker/runtime,
  discard/completion, rework, integration handoff/outcome, completion,
  source-safety, and Goal Loop boundary coverage through capability-domain
  suites.
- AC-004: Current known repo-scoped leftover Node/Vitest process behavior is
  diagnosed and either fixed or recorded as a bounded external/tooling debt.
- AC-005: Handoff docs no longer duplicate the same next-step bullet or point
  at stale latest Harness evolution.
- AC-006: Required product and Harness checks pass, or any remaining timeout is
  explicitly classified with split-suite evidence.

## Non-Goals

- No product workflow behavior change.
- No full-auto, Scheduler loop, slot allocator, child Change creation,
  automatic source apply, or remote merge behavior.
- No weakening or deletion of scheduler/runtime/source-safety assertions.

## Constraints

- Keep one full scheduler two-worker golden path; moving it to release/deep
  gate is allowed, deleting it is not.
- Preserve explicit package scripts for Workbench unit, slow, scheduler slow,
  daily aggregate, and release/deep coverage.
- `README.md` remains unrelated and untracked.

## Risks

- Moving the full golden out of the daily gate could hide regressions unless
  daily seeded suites still cover the same capability domains.
- Slow suites may still exceed the tool window if another hidden monolith
  remains.
- Process cleanup may depend on Vitest/tinypool behavior that cannot be fully
  controlled from package scripts.
