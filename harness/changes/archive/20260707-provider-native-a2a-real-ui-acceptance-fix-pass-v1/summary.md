# provider-native-a2a-real-ui-acceptance-fix-pass-v1

## Purpose

Run a real App / real browser / real Codex app-server acceptance pass for the
provider-native A2A flow, then fix any product issues found in the same change.
The target flow is: user message -> main Agent live reply or native question ->
provider-native planning / child-agent plan output -> right-side plan or
child-agent workspace with plan stream, question card, and history -> user
feedback -> planning revision. Execution entry must be Agent-led through
project rules/tools and Harness evidence; Workbench no longer provides a
product planning bundle or `planning.confirm-execution` shortcut.

This change is an acceptance/fix pass. It must not use fake Codex output,
mocked binaries, handwritten artifacts, or direct manager truth writes to claim
success.

## Scope

In scope:

- Real Workbench build/restart and browser acceptance on
  `goal-loop-demo-real`.
- Codex app-server event inspection for assistant deltas, native plan events,
  runtime user-input requests, and any provider-native child-agent events.
- Fixes to event projection, transcript scoping, plan-session / real
  planning-agent workspace ownership, or Codex bridge behavior when real
  acceptance shows a mismatch with the provider-native reference flow.
- Documentation of real run ids, screenshots/API snapshots, event order, and
  any blocked runtime capability.

Out of scope:

- New execution permissions, new action types, new automation allowlist entries,
  or new workflow truth.
- Fake fallback plans, static assistant replies, mock Codex, or hand-written run
  artifacts.
- Claude Code / OpenCode implementation. This pass may keep provider-neutral
  seams intact, but only validates the current Codex path.
- Changes to Scheduler, IntegrationCheck, ToolPolicyGate, apply/close,
  confirmationQueue authority, or remote/PR/merge behavior.
- Reintroducing Workbench-generated planning bundles, fake planning-agent
  sessions, or planning action buttons.

## Current Status

Completed for the current closeout scope: native Codex Plan Mode projection,
old Workbench planning-chain deletion, and visible UI negative acceptance are
passing after the planning identity repair.

The real browser/App path was exercised after fresh build/restart cycles. The
main Agent live turn works, and project-scoped parent chat now filters
runtime-planning claims out of the visible parent transcript. Real Codex
app-server run `chat-conv-mr8t1vqs-d840d00f-mr8wsw6u` emitted
`turn/plan/updated`; AHO now stores that native plan update as a
`plan-session` scoped transcript message titled `计划会话`. The right Agent
workspace can show the native plan session without inventing a
`planning-agent`.

The latest fix also prevents native Plan Mode output from being duplicated into
the main parent transcript through `result.lastMessage` fallback. Parent chat
may summarize what it is doing, but the plan body belongs to the plan session.

Complete child-agent A2A acceptance is not ready: the accepted real run did not emit
provider-native child-agent spawn or runtime user-input events. No
`spawn_agent`, `send_input`, `wait_agent`, `collabToolCall`,
`collabAgentToolCall`, or `item/tool/requestUserInput` event was observed in
this pass. Treat the current result as native Plan Mode plan-session
acceptance, not full native child-agent spawn acceptance.

The desktop-cc-gui reference check is recorded as a boundary for follow-up
work: execution should move through an explicit Plan handoff / Exit Plan Mode
style card or runtime continuation, not through composer text parsing. This
closeout removes the old text-parsed Workbench planning actions and keeps Plan
feedback in the provider Plan Mode path; it does not add a new reference-style
handoff card.

The old Workbench-engineered planning chain has been removed from the product
path. Ordinary chat and Plan sessions no longer expose `planning.generate`,
`planning.revise`, `planning.confirm-execution`, `latest-bundle`, or fake
planning-agent bundle rows. Decomposition, TaskQueue, Scheduler,
IntegrationCheck, apply, close, validation, and audit boundaries remain
available only from their real Harness gates.

The cleanup also removed the old planning bundle fixture path from unit and
slow test setup. Scheduler/decomposition tests now start from accepted
spec/plan/tasks evidence instead of a Workbench-authored `latest-bundle`.

## Verification

- PASS: `npm run build`
- PASS: `npm run typecheck`
- PASS: `npm run lint`
- PASS: `npm run test:fast`
- PASS: `npm run test:workbench`
- PASS: `npx vitest run tests/unit/parent-agent-transcript.test.ts tests/unit/workbench-read-model.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/workbench-server.test.ts`
- PASS: `npx vitest run tests/unit/codex.test.ts tests/unit/workbench-server.test.ts tests/unit/parent-agent-transcript.test.ts tests/unit/web-app.test.tsx`
- PASS: `npx vitest run tests/unit/parent-agent-transcript.test.ts tests/unit/workbench-live-actions.test.ts tests/unit/workbench-action-service.test.ts tests/unit/action-revalidation.test.ts tests/unit/web-app.test.tsx`
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
- PASS/PARTIAL: real browser run `conv-mr8t1vqs-d840d00f` showed natural main
  Agent reply and projected a real Codex `turn/plan/updated` plan-session into
  the right Agent workspace without labeling it as `planning-agent`.
- PASS/PARTIAL: refreshed real App browser at
  `http://127.0.0.1:4477/?project=goal-loop-demo-real`; visible UI loaded the
  registered project and did not show `latest-bundle`,
  `planning.confirm-execution`, `planning.generate`, `planning.revise`,
  `planning-agent produced`, or `planning-agent 任务`. Remaining
  `planning-agent` text was from historical user-authored conversation titles,
  not newly generated fake planning UI.
- PASS/LIMITED: final closeout browser refresh at
  `http://127.0.0.1:4477/?project=goal-loop-demo-real` loaded the Workbench
  shell in the current browser profile and found no visible `latest-bundle`,
  `planning.confirm-execution`, `planning.generate`, `planning.revise`,
  `planning-agent produced`, or `planning-agent 任务` text. The profile did not
  have the registered `goal-loop-demo-real` project selected, so this is a
  negative UI smoke check rather than a new full project conversation run.
- NOT COVERED: no real `item/tool/requestUserInput`, `spawn_agent`,
  `send_input`, `wait_agent`, `collabToolCall`, or `collabAgentToolCall` event
  was observed in the accepted run.
- REMOVED: `planning.confirm-execution`, `planning.generate`,
  `planning.revise`, and `latest-bundle` are no longer product-path acceptance
  targets. Execution must proceed through Agent-authored Harness files and the
  remaining concrete Harness gates.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids:
  - First failing run: `conv-mr8suqdo-ae96d95e`,
    `chat-conv-mr8suqdo-ae96d95e-mr8suqe4`.
  - Fixed rerun: `conv-mr8t1vqs-d840d00f`,
    `chat-conv-mr8t1vqs-d840d00f-mr8t1vr6`.
  - Native Plan Mode projection rerun: `conv-mr8t1vqs-d840d00f`,
    `chat-conv-mr8t1vqs-d840d00f-mr8vc5sa`.
  - Plan/session identity repair rerun: `conv-mr8t1vqs-d840d00f`,
    `chat-conv-mr8t1vqs-d840d00f-mr8wsw6u`.
  - Event artifact:
    `C:\Users\qinghui\.agent-harness\projects\goal-loop-demo-real\workbench\conversations\conv-mr8t1vqs-d840d00f\runs\chat-conv-mr8t1vqs-d840d00f-mr8t1vr6\app-server-events.jsonl`.
  - Native Plan Mode event artifact:
    `C:\Users\qinghui\.agent-harness\projects\goal-loop-demo-real\workbench\conversations\conv-mr8t1vqs-d840d00f\runs\chat-conv-mr8t1vqs-d840d00f-mr8vc5sa\app-server-events.jsonl`.
  - Plan/session identity repair artifact:
    `C:\Users\qinghui\.agent-harness\projects\goal-loop-demo-real\workbench\conversations\conv-mr8t1vqs-d840d00f\runs\chat-conv-mr8t1vqs-d840d00f-mr8wsw6u\app-server-events.jsonl`.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: native Plan Mode
  plan-session projection is now accepted. Still need a separate real run that
  emits provider-native child-agent spawn or runtime question events before
  claiming full child-agent A2A acceptance. Do not reintroduce Workbench text
  parsing, fake planning-agent sessions, fake planning output, or Workbench
  planning bundles.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
