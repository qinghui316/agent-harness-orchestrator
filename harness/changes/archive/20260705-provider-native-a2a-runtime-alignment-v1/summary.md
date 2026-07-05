# provider-native-a2a-runtime-alignment-v1

## Purpose

Align AHO's main-agent / child-agent interaction with provider-native runtime
events instead of Workbench text heuristics. Ordinary project chat must remain
conversation-scoped; child agent / plan surfaces are shown only when a provider
runtime event, Harness action, or explicit scoped interaction owns them.

Codex remains the first implemented provider path. Native Plan Mode, plan
updates, and requestUserInput are preserved as owned runtime events for the
Agent workspace instead of being flattened into main transcript prose. Future
Claude Code / OpenCode support should attach through the same runtime event
shape, not through Codex-specific planning hacks.

## Scope

In scope:

- Remove ordinary-chat heuristic planning-agent auto-delegation.
- Keep Codex plan / request-user-input events owned and scoped to child-agent
  surfaces instead of the main transcript.
- Separate ordinary conversation runtime scope from Harness Change scope in
  Codex app-server turn bookkeeping.
- Keep planning-agent Plan Mode as the explicit Harness planning action path,
  not as a hidden side effect of any chat message.
- Update tests and docs for provider-native A2A boundaries.

Out of scope:

- No new provider runtime, Claude Code implementation, dynamic tool bridge, or
  raw subagent executor.
- No expansion of automation allowlists, confirmationQueue authority,
  ToolPolicyGate, Scheduler, IntegrationCheck, apply, or close.
- No compatibility migration for old test conversation snapshots.

## Current Status

Completed.

## Verification

Passed:

- `npm run typecheck`
- `npx vitest run tests/unit/workbench-module-boundaries.test.ts tests/unit/codex.test.ts tests/unit/workbench-server.test.ts tests/unit/workbench-read-model.test.ts`
- `npx vitest run tests/unit/workbench-module-boundaries.test.ts tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx`
- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx`
- `npm run lint`
- `npm run build`
- `npm run test:fast`

Real service/API acceptance:

- Started built Workbench on `127.0.0.1:4477`.
- Project: `goal-loop-demo-real`.
- Created ordinary live conversation
  `conv-mr7cnr1v-53441909`
  (`provider-native-a2a-runtime-alignment-real-ui-check`).
- SSE showed real app-server streaming via `assistant.delta` events and final
  `assistant.message` from run
  `chat-conv-mr7cnr1v-53441909-mr7cnr28`.
- Harness active Change directory count for `goal-loop-demo-real` stayed
  `31 -> 31`; ordinary chat did not create a Change.
- Transcript projection contained only the user message and main-agent reply;
  no planning-agent run or planning draft was created by ordinary chat.
- Rebuilt and restarted 4477 after the final Workpad wording fix; the ordinary
  conversation Workpad now says user-facing text only:
  `这是普通主 Agent 对话。主 Agent 会按项目说明和已记录的项目进度判断下一步。`

Blocked / limited:

- In-app browser automation could not attach because the local browser plugin
  failed during initialization with
  `failed to write kernel assets: 系统找不到指定的路径。 (os error 3)`.
  Therefore visual click/screenshot acceptance was not claimed. The real
  Workbench HTTP/SSE path was verified instead.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: in-app browser automation failed twice with
  `failed to write kernel assets: 系统找不到指定的路径。 (os error 3)`.
- Screenshots / artifacts / run ids:
  `chat-conv-mr7cnr1v-53441909-mr7cnr28`,
  `.tmp/provider-native-live-sse.txt` (local verification scratch).
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none for AHO runtime.
  Browser automation failure is outside the AHO Workbench service path.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: updated `docs/WORKBENCH.md`, `docs/RUNTIME.md`,
  `docs/BOUNDARIES.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md` to record
  provider-owned runtime events, runtime scope versus Change scope, and no
  text-parsed child-agent delegation.
- Experience lifecycle result: retired ordinary-chat guessed planning-agent
  auto-delegation; retained explicit Harness planning actions and native Codex
  Plan Mode event projection.
- Roadmap/current-direction stale language check: current development plan now
  points at this active slice.
- Old experience retained / merged / retired / archive-only: old
  `<proposed_plan>` path remains replay/fallback only; ordinary text-triggered
  planning-agent launch is removed.

