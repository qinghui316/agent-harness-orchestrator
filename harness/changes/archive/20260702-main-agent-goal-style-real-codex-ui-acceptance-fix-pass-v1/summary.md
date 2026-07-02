# main-agent-goal-style-real-codex-ui-acceptance-fix-pass-v1

## Purpose

Run a real Codex + Workbench UI acceptance pass for the Harness-mode main
Agent loop, and fix product defects found during that pass. The current pass
exposed that external-local demand creation could skip the visible live main
Agent turn, present a planning confirmation gate first, and show derived AHO
planning text as if it were an Agent reply. This change repairs that
conversation flow before continuing acceptance.

## Scope

In scope:

- external-local read-only main-Agent / planning-Agent chat through real
  Codex app-server when available.
- live-first topic creation over SSE, including user message, run start,
  streamed assistant output, and final snapshot.
- composer chat semantics that keep ordinary user messages in the main-Agent
  conversation instead of auto-triggering planning actions.
- compact process rows for real planning-agent / role lifecycle events.
- visible planning-agent output that comes from Codex plan text, not AHO's
  deterministic bundle summary.
- scoped automation source/artifact safety checks and real UI acceptance on an
  external demo repository.

Out of scope:

- No new workflow authority, controller, action type, automation allowlist,
  Scheduler executor, IntegrationCheck apply/discard automation, remote/PR/
  merge automation, or Harness evolution automation.
- No fake Codex, mocked runtime, hand-written run artifact, or synthetic
  assistant prose as acceptance evidence.
- No replacement of Change/ECL, confirmationQueue, ToolPolicyGate, validation/
  audit, apply/close, or Scheduler/IntegrationCheck owners.

## Current Status

Completed.

The acceptance-discovered conversation-flow defects were fixed and verified:
new external-local demands now show a live-first user message and run-backed
main-Agent turn before any planning gate is consumed; ordinary chat no longer
auto-hands off to planning actions; planning-agent execution is visible as
compact lifecycle rows; raw Codex planning stream/tool noise is not projected
into the main conversation; visible planning prose is sanitized for user-facing
conversation while the run artifact remains available as evidence.

## Verification

- `npx vitest run tests/unit/proposed-plan.test.ts tests/unit/workbench-planning-scheduler-prep.test.ts tests/unit/workbench-server.test.ts tests/unit/workbench-module-boundaries.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm run lint`
- `npm run test:fast`
- `npm run test:workbench`

Real UI acceptance:

- App started normally with `node dist/index.js workbench serve E:\aho-real-acceptance\goal-loop-demo-20260702-155546 --host 127.0.0.1 --port 4477`.
- Browser URL: `http://127.0.0.1:4477/?project=goal-loop-demo-real`.
- Demo source root: `E:\aho-real-acceptance\goal-loop-demo-20260702-155546`, HEAD `b1bb401`.
- Final passing demand: `ui-final-7`, title `真实 UI 验收 final 7：请先自然回复你理解的目标和下一步，当前不要修改文件。`.
- Observed sequence: user message immediately visible -> waiting/running state -> run-backed main-Agent reply -> human planning gate -> explicit confirmation -> planning-agent lifecycle rows -> sanitized planning draft -> next gate `planning.confirm-execution`.
- Forbidden visible strings checked in final pass: `<proposed_plan>`, `</proposed_plan>`, `Harness`, `canonical`, `TaskRun`, `WorkflowRun`, `已运行 1 条命令`, `命令需要关注`, `node test.mjs`, `dirty`; none were present in the final user-visible planning pass.
- Stepwise path did not start coder/code execution; no raw Scheduler, IntegrationCheck apply/discard, remote, PR, merge, or Harness evolution action ran.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none.
- Extra prompts or reviewer instructions: one final retry (`ui-final-7`) was used after tightening the planning prompt/sanitizer; no fake Codex, mocked PATH, hand-written run artifact, or direct manager write was used.
- Retries or environment failures: earlier `ui-final-5` exposed raw planning stream leakage; `ui-final-6` fixed raw stream leakage but still surfaced repository-scan wording; `ui-final-7` passed the visible-surface checks.
- Screenshots / artifacts / run ids: `run-20260702-184932-ui-final-7-b4a4ed` for the main-Agent initial turn and `run-20260702-185011-ui-final-7-f36a61` for the planning-agent run.
- External source/state safety: source root `E:\aho-real-acceptance\goal-loop-demo-20260702-155546`; before/after source mutation was out of scope for the final pass. `git status --short` showed only existing untracked AHO setup files (`.agent-harness/`, `AGENTS.md`) and no intentional source mutation.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: the first real UI pass
  found a product-flow defect: topic creation surfaced a planning confirmation
  before a visible run-backed main-Agent turn, and the composer could turn
  ordinary chat into planning actions. The final pass confirmed these are
  repaired for the stepwise planning path.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable because active handoff files are
  updated to close this acceptance/fix pass.
- Experience lifecycle result: retained as product acceptance evidence; no new
  Harness evolution rule is required.
- Roadmap/current-direction stale language check: update `docs/STATUS.md` and
  `AGENTS.md` after close so the latest archive points to this change and the
  next track no longer claims the UI acceptance pass is pending.
- Old experience retained / merged / retired / archive-only: archive-only for
  the failed `ui-final-5`/`ui-final-6` attempts; current behavior is represented
  by final `ui-final-7` acceptance plus unit/Workbench tests.

