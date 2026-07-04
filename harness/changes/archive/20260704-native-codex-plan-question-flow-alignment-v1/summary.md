# native-codex-plan-question-flow-alignment-v1

## Purpose

Align planning-agent interaction with native Codex Plan Mode and request-user-input behavior. The main conversation remains the parent Agent narrative, while planning-agent plan streaming, questions, user feedback, and revision history stay in the right Agent workspace.

This change does not add permissions, controllers, automation allowlist entries, or execution authority. Harness artifacts and gates remain the execution boundary after the user explicitly asks to implement the plan.

## Scope

In scope:

- Map Codex native plan events to planning-agent transcript content instead of generic status rows.
- Keep planning-agent plan text and runtime questions out of the main conversation prose.
- Thin planning-agent delegation prompts so Codex native Plan Mode owns planning behavior.
- Keep implementation intent in the planning-agent composer while preserving existing confirm-execution revalidation.
- Clean user-visible planning wording that leaks internal artifact or workflow vocabulary.

Out of scope:

- New execution permissions, controllers, action types, or automation allowlist entries.
- Scheduler, IntegrationCheck, apply/close, ToolPolicyGate, or validation/audit authority changes.
- Compatibility with old test conversation snapshots.

## Current Status

Ready to close.

## Verification

Passed:

- `npx vitest run tests/unit/workbench-module-boundaries.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx tests/unit/codex.test.ts --reporter=dot`
- `npx vitest run tests/unit/web-app.test.tsx tests/unit/workbench-read-model.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run lint`
- `npm run test:workbench`
- `npm run test:fast`
- `npm run build`

Real UI acceptance:

- Built the app and restarted the real Workbench server on `127.0.0.1:4477`.
- Used the real browser UI against project `goal-loop-demo-real` and real Codex app-server, without fake Codex, mocked PATH, hand-written run artifacts, or direct manager truth writes.
- Verified a new demand first showed a natural main-Agent reply and parent-level delegation rows, while planning-agent content stayed in the right Agent workspace.
- Verified planning-agent Plan Mode / right workspace flow with a real planning-agent question and follow-up feedback revision. The right workspace preserved the planning-agent history after revision.
- Scanned the visible DOM for forbidden internal terms including `Harness`, `AGENTS.md`, `active change`, `worktree`, `TaskRun`, `WorkflowRun`, `close gate`, `validation`, `audit`, `bundle`, `AC-001`, and `T-001`; no current main/agent surface hits were found in the accepted run.

Known acceptance limitation:

- The observed Codex app-server run did not emit a native `item/tool/requestUserInput` card; it asked the user via a normal planning-agent message. AHO now keeps that real question in the planning-agent workspace and does not generate a fake plan, but native question-card rendering remains dependent on a runtime event that was not observed in this pass.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user required true App/browser/Codex validation and no fake plan/replay acceptance.
- Retries or environment failures: earlier real runs exposed context loss after planning feedback and internal-term leakage; both were fixed before final verification.
- Screenshots / artifacts / run ids: real App URL `http://127.0.0.1:4477/?project=goal-loop-demo-real`; server logs were captured under the local temp acceptance directory during validation.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: no current-state docs were changed in this slice; latest handoff remains archive-driven after close.
- Experience lifecycle result: planning-agent native interaction promoted; AHO fixed-template/proposed-plan path retained as fallback/replay only.
- Roadmap/current-direction stale language check: no roadmap/current-direction docs changed.
- Old experience retained / merged / retired / archive-only: not applicable.
