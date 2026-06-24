# Spec: workbench-real-ui-continuation-next-blocker-scout

## Goal

Validate the current AHO product baseline through a real browser Workbench UI
scout after bounded continuation V1. The scout should prove that an ordinary
manual-gated local Workbench path remains usable and should surface the next
concrete product blocker, if one exists.

## Users

- AHO user driving a local project through Workbench in ordinary language.
- AHO developer/agent using real UI acceptance evidence to decide the next
  product slice.

## Acceptance Criteria

- AC-001: The change uses a fresh external sandbox for managed source and AHO
  runtime home, leaving the AHO development checkout separate.
- AC-002: Workbench is opened in a real browser UI and the scout records visible
  primary gates for the ordinary path from demand through planning,
  decomposition/readiness, `code.run`, validation/audit, result review, apply,
  and close as far as the product path can legally progress.
- AC-003: If a supported current controlled Scheduler gate appears, one visible
  `planning.goal-loop.controlled-continue.run` confirmation is executed from the
  UI and evidence proves duplicate confirmation is suppressed while running and
  the run stops at a real next gate, blocker, or budget.
- AC-004: Real Codex / runtime evidence is used when claiming code execution; no
  fake Codex binary, mocked PATH, fixture result, or hand-written run artifact is
  accepted as pass evidence.
- AC-005: Source apply safety is recorded with before/after sandbox source
  status, and source mutation occurs only after the explicit human apply gate.
- AC-006: Any discovered blocker is classified as product path bug, UI/projection
  gap, action target/revalidation gap, runtime/validation/audit/apply/close bug,
  Codex agent-quality issue, source-safety blocker, or environment/provider
  blocker.
- AC-007: If product code changes are needed, the fix stays in the smallest owned
  boundary and is covered by targeted tests plus required aggregate checks for
  touched Workbench contracts.

## Non-Goals

- Implement full-auto task mode, scheduler loop, parallel executor, whole-wave
  dispatch, slot allocator, child Change auto creation, or automatic apply,
  merge, close, remote, or Harness evolution.
- Use API-only evidence as a substitute for visible browser UI evidence.
- Run acceptance against the AHO development checkout as the managed project.
- Add new evidence families or treat Goal Loop evidence as workflow truth.

## Constraints

- Only one active structured change is allowed.
- `README.md` remains an unrelated untracked file and is not part of this
  change.
- High-impact transitions stay human-gated.
- Real acceptance must preserve source/runtime/development-checkout separation.

## Risks

- Environment/Codex/browser availability may block real UI acceptance; record as
  environment/provider blocker rather than faking success.
- The ordinary path may not naturally produce a supported controlled Scheduler
  gate; in that case record the reachable path and use the existing continuation
  smoke as baseline evidence rather than manufacturing a fake gate.
- Codex may produce a low-quality candidate; use bounded Workbench rework when
  the product path offers it, otherwise classify accurately.
