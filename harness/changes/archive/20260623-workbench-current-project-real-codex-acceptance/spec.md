# Spec: workbench-current-project-real-codex-acceptance

## Goal

Prove or accurately block the current AHO Workbench manual-gated product loop
using real Codex execution. The initial same-root attempt on the current AHO
repository is retained as source-safety evidence; formal apply/close acceptance
must use an external sandbox managed project so product development state and
acceptance target state do not share one source root.

## Users

- The AHO developer validating whether the product is usable on its own codebase.
- Future agents relying on archived acceptance evidence to distinguish real
  product capability from fixture-only test coverage.

## Acceptance Criteria

- AC-001: The initial same-root Workbench managed project attempt is recorded
  as negative source-safety evidence, then the formal rerun opens an external
  sandbox copy as the Workbench managed project.
- AC-002: Workbench primary confirmation queue evidence is captured for each
  stage, with exactly one real primary next gate at a time.
- AC-003: Planning confirmation writes canonical `spec.md`, `plan.md`,
  `tasks.md`, and `ac-map.json` without starting code execution.
- AC-004: Decomposition/readiness evidence reaches a latest readiness manifest
  whose `nextAllowedAction` is `code.run` before any `code.run` action is
  executed.
- AC-005: `code.run` produces a real `coder-codex` run with
  `executionMode = "worktree"` and artifacts including `run.json`,
  `codex-events.jsonl`, `last-message.md`, `diff.patch`, and `diff-stat.txt`.
- AC-006: Validation/audit/result review evidence is captured for the same
  worktree and diff hash, or the blocker is classified without fake pass
  evidence.
- AC-007: Source apply is attempted only through the Workbench human-gated
  apply action when result review is ready; before/after `git status --short`
  is recorded.
- AC-008: If apply succeeds, close/archive is attempted through the Workbench
  human-gated close action and the archive path is recorded. If any stage fails,
  the failure is classified as environment/auth/provider, Codex agent-quality,
  product path bug, source safety blocker, or validation/audit failure.
- AC-009: Worktree validation can resolve the source project's local Node
  dependencies without treating the worktree as a dependency or security
  sandbox, without auto-running install commands, and without including the
  dependency bridge in worktree diff, validation diff hash, or apply evidence.
- AC-010: Real Workbench UI evidence is captured through a browser session for
  the current demand/topic, including the main conversation, visible primary
  confirmation queue, Agent run graph/result-review state, and any eligible
  apply/close gate; server API evidence may supplement but not replace this UI
  evidence.
- AC-011: Repo-root Workbench runtime state is removed from the development
  repository after preserving necessary evidence, and future real acceptance
  uses an external AHO home plus external sandbox source root.
- AC-012: Workbench detects whether the managed project is trusted by Codex and
  exposes only an explicit human-confirmed trust action; startup must not
  silently mutate the user's global Codex config.
- AC-013: When a managed project uses external-local AHO memory, real Codex
  planning/chat and `code.run` must use a runtime path that can read the
  external memory root; Codex app-server must not be selected if it cannot carry
  that memory root into the sandbox.
- AC-014: External-local Harness initialization must not overwrite an existing
  project `AGENTS.md`; current-project acceptance must start from a clean,
  complete sandbox source root whose git worktree contains the files required by
  the project's own validation suite.

## Non-Goals

- Implement full-auto task mode or unattended continuation.
- Implement scheduler loops, parallel executors, slot allocators, child Change
  auto creation, remote push/merge, or PR landing.
- Treat planning fallback output, fake Codex output, fixture output, or hand-made
  artifacts as acceptance success.
- Include unrelated untracked `README.md` in this change.

## Constraints

- Codex may mutate only an AHO-owned worktree during `code.run`; source root
  mutation requires explicit Workbench apply confirmation.
- `planning.generate` is not sufficient real Codex evidence because it has a
  deterministic fallback path.
- Workbench action payloads must carry scoped target ids and pass stale target
  revalidation.
- The current repo's pre-existing untracked `README.md` must be preserved.
- Repo-root `.agent-harness/` runtime state must not remain in the AHO
  development repository after same-root evidence is preserved externally.
- Worktree dependency setup may bridge to source-root dependencies for
  validation, but it must not promise dependency isolation and must not mutate
  the source root.
- Missing source-root dependencies must fail closed with an explicit dependency
  setup blocker rather than running `npm install` or `npm ci`.
- Codex project trust is a user-level security boundary. AHO may detect and
  offer a scoped, confirmed trust write, but it must not self-trust projects at
  server startup.
- External-local memory is part of AHO workflow truth. Runtime adapters must not
  let Codex plan or code from only the source checkout/worktree when accepted
  Change artifacts live under an external AHO home.
- Existing project source files remain user-owned during Harness initialization.
  AHO may create its marker and external memory, but it must not replace a
  non-generated `AGENTS.md` with a generic external-memory map.

## Risks

- Codex CLI, auth, provider, or app-server capability may be unavailable.
- The existing `README.md` untracked file may cause source apply to fail closed
  in same-root attempts; formal rerun must avoid same-root source pollution by
  using an external sandbox.
- Codex may produce a low-quality change that fails validation or audit.
- A real product path defect may appear in Workbench action routing,
  confirmation projection, validation/audit, result review, apply, or close.
- A dependency bridge could be mistaken for source diff or sandboxing unless the
  implementation and review explicitly keep it out of diff/apply semantics.
- A transient aggregate-only DOM flake may be mistaken for a product blocker
  unless the current source, candidate worktree, and Workbench validation path
  are rechecked and attributed.
- A trust helper could weaken Codex's boundary if it edits
  `C:\Users\qinghui\.codex\config.toml` without visible user confirmation or
  without scoping the write to the selected managed project path.
- Codex app-server currently has no proven AHO bridge for external read roots;
  selecting it for external-local memory can produce incomplete planning
  evidence even though the provider itself is running.
- A malformed sandbox clone or initialization side effect can make validation
  fail for environment/setup reasons rather than for the Codex candidate change.
