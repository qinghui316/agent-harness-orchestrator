# Spec: main-agent-goal-style-real-codex-ui-acceptance-fix-pass-v1

## Goal

Prove the Harness-mode main-agent loop works through a real Codex + real
Workbench UI acceptance pass, and fix any issues found in that pass without
expanding execution authority.

The acceptance must use the current AHO app and a new external demo project
folder. It must not use fake Codex, mocked PATH entries, hand-written run
artifacts, or direct manager writes as acceptance evidence.

## Users

Users who choose `逐步确认` or `完全访问权限` in Workbench need the main Agent to
continue through legal Harness gates, stop at human-only gates, and keep source
mutation bounded to the selected Change.

## Acceptance Criteria

- AC-001: A real Codex + Workbench UI `逐步确认` pass on an external demo repo
  confirms the plan and then waits on the real primary gate without starting
  scoped automation or writing automation authorization/run artifacts.
- AC-002: A real Codex + Workbench UI `完全访问权限` pass on an external demo repo
  confirms the plan and advances only through existing scoped automation gates
  until local completion/close or a legal stop point.
- AC-003: Scoped automation rechecks source state and accepted artifact hashes
  before each child action; source/artifact drift stops automation and records a
  resumable stop instead of continuing.
- AC-004: The real acceptance records external source safety evidence: demo
  project path, before/after `git status --short`, HEAD/diff notes, run ids or
  screenshots/API snapshots used, and any Codex environment limitation.
- AC-005: Raw Scheduler, manual IntegrationCheck, integration apply/discard,
  remote, PR, merge, and Harness evolution remain non-automatic and cannot be
  authorized by this acceptance pass.
- AC-006: Regression tests and Harness checks pass for strategy advice,
  strategy/resume consumption, automation runtime, Goal Loop runtime, workflow
  actions, action revalidation, and module boundaries.
- AC-007: Creating a new Workbench demand through the real project path runs a
  read-only main Agent turn before the planning confirmation gate becomes the
  next boundary. The center transcript must show a run-backed assistant message
  with run/artifact lineage, not a static AHO-authored fake reply.
- AC-008: Normal external-local demand creation uses the live stream path: the
  UI immediately shows the user message, run-start / waiting state, streamed
  main-Agent output, and then the refreshed snapshot. The synchronous JSON
  topic route remains compatibility-only for older callers.
- AC-009: The main composer treats ordinary chat as a main-Agent message even
  when the current Workpad next action is `planning.generate` or
  `planning.revise`; only clicking the visible confirmation gate executes a
  planning action.
- AC-010: planning-agent lifecycle is visible as compact process rows derived
  from real AgentTask/run/live events, and visible planning draft prose is
  Codex-produced plan text. AHO deterministic bundle summaries may feed
  Workpad/details but must not masquerade as assistant prose.

## Non-Goals

- No new controller, runner, action type, UI surface, automation allowlist entry,
  Scheduler executor, IntegrationCheck apply/discard automation, remote/PR/merge
  automation, or Harness evolution automation.
- No fake-Codex acceptance substitute. Unit fixtures may support regression
  tests, but close acceptance requires real Codex through the app.
- No synthetic workflow evidence card or fake assistant prose in the center
  transcript. The initial main Agent reply must come from the Codex/main-agent
  runtime path; right confirmation and evidence details remain separate.
- No hidden fallback that closes acceptance when real Codex app-server is
  unavailable for normal external-local text demand. That environment blocks
  real UI acceptance until the runtime path is fixed.

## Constraints

- The current AHO development repository must not be the managed project used
  for positive apply/close acceptance.
- Fixes discovered during acceptance must stay with the responsible owner:
  UI fixes in UI/read-model code, runtime fixes in runtime owners,
  gate/revalidation fixes in action/revalidation owners, and documentation drift
  in handoff docs.
- Worker agents remain bounded leaf agents; strategy advice and resume context
  must not become worker instructions or action payloads.

## Risks

- Real Codex may fail for auth, model, rate-limit, or network reasons. Such
  failures block close unless recorded as environment-only limitations with a
  separate successful real pass.
- Real UI acceptance may expose unrelated product issues. They are in scope only
  when they block the acceptance path or violate Harness boundaries.
