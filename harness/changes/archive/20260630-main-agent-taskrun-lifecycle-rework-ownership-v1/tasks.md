# Tasks: main-agent-taskrun-lifecycle-rework-ownership-v1

- [x] T-001: Add main-agent TaskRun lifecycle entrypoint with one shared `loopRunId`, finish/observe/rework decision, and at most one retry.
  - Covers: AC-001, AC-002
- [x] T-002: Keep `runMainAgentTaskRunAttempt` single-attempt and update any internal options without adding retry behavior.
  - Covers: AC-001
- [x] T-003: Route `task-run-sequence.ts` and `task-queue-runner.ts` through the new lifecycle while preserving TaskRun and TaskQueue ownership.
  - Covers: AC-002, AC-003
- [x] T-004: Preserve stage-resume behavior and remove direct bounded rework execution from stage resume.
  - Covers: AC-004, AC-005
- [x] T-005: Update architecture and behavior tests for single attempt, lifecycle rework, TaskQueue handoff, stage resume, and boundary imports.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006
- [x] T-006: Run targeted verification, aggregate checks, Harness checks, and update review/summary closeout evidence.
  - Covers: AC-006
