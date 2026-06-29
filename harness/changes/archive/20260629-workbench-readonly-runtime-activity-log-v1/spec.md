# Spec: workbench-readonly-runtime-activity-log-v1

## Goal

Expose AHO runtime activity as a readable, bounded timeline so users can inspect
what recently happened without digging through raw artifacts, terminal output,
or advanced diagnostics. The log must be a projection over existing evidence,
not a new execution surface.

## Users

- AHO users diagnosing Codex/model/Skill/attachment/runtime state.
- AHO users reviewing recent run, validation, and audit outcomes.
- Future implementers adding Browser, Git write/history, or file editing who
  need a shared place to expose runtime status without inventing local panels.

## Acceptance Criteria

- AC-001: Workbench exposes a project/topic-scoped runtime activity timeline
  through a read-only GET API with bounded item count and stable ordering.
- AC-002: Timeline items are derived from existing evidence/readiness only:
  Codex run metadata/events, provider runtime summary, runtime diagnostics,
  validation/audit summaries, message Skill/attachment metadata, terminal
  readiness, and sanitized action errors.
- AC-003: The center workspace has a `运行日志` view; the right `诊断` rail stays
  a summary and provides a real navigation path to the log.
- AC-004: Timeline summaries do not expose raw stdout/stderr, full prompts,
  attachment contents, Skill contents, stack traces, private paths, config
  paths, or memory roots. Necessary detail remains bounded and folded.
- AC-005: Opening or refreshing the runtime activity log does not trigger
  workflow actions, terminal open/write, scheduler, apply/close, remote, PR,
  merge, or Harness evolution.
- AC-006: UI does not show Run/Stop command controls, automatic fixes, Browser,
  provider selector, ordinary Agent mode, or other unavailable controls.

## Non-Goals

- Do not implement a runtime command console.
- Do not persist a new runtime-log database.
- Do not make runtime activity workflow truth or validation/audit authority.
- Do not change `confirmationQueue.primary`, ToolPolicyGate, Goal Loop,
  Scheduler, validation/audit, apply/close, or Harness evolution.
- Do not vendor-copy `desktop-cc-gui`.

## Constraints

- Reuse existing provider runtime, runtime diagnostics, read-model, run artifact
  preview, validation/audit, message metadata, and terminal readiness owners.
- Prefer one small projection owner over feature-local timeline assembly.
- Keep raw technical details advanced-only and bounded.
- Keep terminal output out of V1 timeline except readiness/error summary.

## Risks

- The feature could become a central log system. Mitigation: no persistence and
  no new evidence authority.
- The feature could copy reference command-console behavior. Mitigation: no
  Run/Stop/preset controls and tests that fake controls are absent.
- The projection could leak raw or private data. Mitigation: sanitize summaries
  and keep only bounded detail refs.
