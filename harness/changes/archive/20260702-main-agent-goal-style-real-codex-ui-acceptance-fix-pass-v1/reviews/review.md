# Review: main-agent-goal-style-real-codex-ui-acceptance-fix-pass-v1

Status: complete.

## Findings

No blocking findings remain.

The real UI pass found three product defects and this change fixed them:

- new demand creation could show a planning confirmation gate before a visible run-backed main-Agent reply;
- ordinary composer input could be treated as a planning action instead of a main-Agent message;
- planning-agent raw Codex output and AHO-derived planning bundle prose could appear as main conversation text.

Final `ui-final-7` acceptance confirms the repaired flow:

```text
user message
-> waiting/running state
-> real main-Agent reply
-> human planning gate
-> explicit confirmation
-> planning-agent lifecycle rows
-> sanitized planning draft
-> planning confirmation gate
```

The final pass did not start coder/code execution in `逐步确认`.

## Verification

Selected verification scope:

- focused planning/transcript/server/module tests for the user-visible defects;
- aggregate fast and Workbench unit gates because this change touches Workbench UI, live SSE, transcript projection, Codex bridge, planning action handling, and scoped automation safety;
- real browser acceptance against a normally started Workbench app and external-local demo project.

Commands run:

- `npx vitest run tests/unit/proposed-plan.test.ts tests/unit/workbench-planning-scheduler-prep.test.ts tests/unit/workbench-server.test.ts tests/unit/workbench-module-boundaries.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm run lint`
- `npm run test:fast`
- `npm run test:workbench`

Real UI acceptance:

- App command: `node dist/index.js workbench serve E:\aho-real-acceptance\goal-loop-demo-20260702-155546 --host 127.0.0.1 --port 4477`.
- Browser URL: `http://127.0.0.1:4477/?project=goal-loop-demo-real`.
- Demo source root: `E:\aho-real-acceptance\goal-loop-demo-20260702-155546`.
- Demo source HEAD: `b1bb401`.
- Final passing demand: `ui-final-7`.
- Main-Agent run: `run-20260702-184932-ui-final-7-b4a4ed`.
- Planning-agent run: `run-20260702-185011-ui-final-7-f36a61`.
- DOM/API forbidden visible strings checked: `<proposed_plan>`, `</proposed_plan>`, `Harness`, `canonical`, `TaskRun`, `WorkflowRun`, `已运行 1 条命令`, `命令需要关注`, `node test.mjs`, `dirty`; none were present in final `ui-final-7` visible planning output.
- The planning gate remained explicit and human-confirmed.
- No fake Codex binary, mocked PATH, fixture result, hand-written run artifact, or direct manager write was used for acceptance.

Full / aggregate suites:

- `npm run test:fast` passed.
- `npm run test:workbench` passed.
- Slow/release Workbench suites were not run because the changed boundary is local Workbench conversation/planning/automation safety and the aggregate fast + Workbench unit gates plus real browser acceptance cover the touched behavior.

## Complexity Deletion Review

- delete: removed deterministic planning bundle prose from visible Agent text and avoided projecting raw planning Codex deltas/tool rows into the main conversation.
- reuse: reused `runCodexChat`, existing live SSE, existing `WorkbenchAssistantEvent` process rows, existing planning bundle persistence, existing confirmation queue, and existing scoped automation runner.
- yagni: avoided a new controller, action type, automation allowlist, fake transcript layer, or separate planning truth.
- shrink: the narrowest fix was to let planning Codex still produce real artifacts while suppressing its raw live stream from the main transcript and appending only sanitized final prose.
- net: Lean for current scope; broader agent conversation redesign remains a future product phase, not part of this fix pass.

## Acceptance Feedback

- Real/manual acceptance performed: yes.
- Real Codex acceptance claimed: yes.
- Fake Codex / mocked PATH / fixture / hand-written artifact exclusion: acceptance used the normally started app on port 4477, real browser UI, and recorded Codex run ids. No mocked binary or manual artifact write was used.
- Manual config edits: none.
- Extra prompts or reviewer instructions: final pass used a simple user demand asking for a natural first reply and no file changes.
- Retries/environment failures: `ui-final-5` exposed raw planning stream leakage; `ui-final-6` fixed raw stream leakage but still surfaced repository-scan wording; `ui-final-7` passed after prompt/sanitizer tightening.
- Screenshots/API snapshots/run artifacts: API snapshot for `ui-final-7` and DOM state checks recorded in this review summary; run artifacts are under the demo project's AHO memory root.
- External source/state safety: source root `E:\aho-real-acceptance\goal-loop-demo-20260702-155546`; `git status --short` showed existing untracked `.agent-harness/` and `AGENTS.md`. The final pass intentionally did not mutate demo source.
- Product-fixable follow-up: a future UX pass can make process rows persist more prominently after the transcript scrolls; current projection did show them during run and preserved a clean final transcript.

## Documentation Entropy Coverage

- Applicable: yes, this closeout updates active change docs and current handoff docs.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`, active `summary.md`, active `tasks.md`, this review.
- Current-state alignment required after close: `AGENTS.md` and `docs/STATUS.md` must point to the archived summary and no longer name this active path.
- Archive-ledger content: final `ui-final-7` acceptance is retained in the archived summary/review; failed intermediate attempts remain archive-only evidence.

## Experience Lifecycle Coverage

- Applicable: yes.
- Promote: no new Harness rule required; existing ECL real-acceptance and user-surface honesty rules already cover the failure mode.
- Retain: real UI acceptance must distinguish real Agent output from derived Harness summaries.
- Merge: covered by existing transcript source-boundary and user-surface honesty coverage.
- Retire: none.
- Archive-only: intermediate `ui-final-5` and `ui-final-6` failure details.

## Worktree Diff Artifact Coverage

- Applicable: no.
- Reason: the change does not affect worktree diff collection, validation diff hashes, audit diff review, or apply preview/apply gates.

## Read Model Projection Coverage

- Applicable: yes.
- Scope checked: Workbench thread/snapshot projection for `ui-final-7`, confirmation queue next action, and transcript process/prose rendering.
- Tested with: `workbench-server`, `web-app`, `workbench-read-model` through `test:workbench`, and real browser DOM/API checks.

## Workbench User-Surface Honesty Coverage

- Applicable: yes.
- Sampled surface: Workbench main conversation, composer, confirmation rail, and planning draft transcript.
- Visible primary UI backed by implemented workflow path: `生成方案草案` remained a real confirmation queue workflow action and required explicit user confirmation.
- Authoritative surface alignment: after final planning draft, the next primary gate was `planning.confirm-execution`; it did not start execution.
- Stale/history suppression: selected `ui-final-7` gate and transcript were checked via scoped snapshot query.
- Out-of-scope future capability check: no raw scheduler, IntegrationCheck apply/discard, remote, PR, merge, Harness evolution, or coder path auto-ran.
- Forbidden visible internal terms/actions checked: see Verification.
- Duplicate primary action/in-flight suppression: during run, the page showed the action as running and did not start coder.
- Real UI result: passed for `ui-final-7`.

## Reference-Driven UI / Product Source Evidence Coverage

- Applicable: yes.
- Reference map used: existing `desktop-cc-gui` / cc-gui style interaction direction in current project docs.
- Source files were not reopened in this closeout because the repair implements already-recorded reference behavior: chat-first main Agent reply, visible process rows, explicit gates, and no fake derived assistant prose.
- Fake-control check: no new control was added; existing confirmation and composer controls stayed backed by implemented paths.

## Scoped Workbench Action Payload Coverage

- Applicable: yes.
- Checked target ids: final `ui-final-7` planning gate carried `changeId=ui-final-7` and produced next `planning.confirm-execution` for the same change.
- Tested action path: right confirmation rail `planning.generate`.
- Duplicate action/evidence affordance: no extra planning action was generated from ordinary composer input.

## Transcript Renderer Source-Boundary Coverage

- Applicable: yes.
- Canonical transcript projection checked: `ui-final-7` thread contained user message, run-backed assistant turn, sanitized planning draft, and action result row.
- Assistant markdown source checked: visible planning text came from Codex proposed plan after conversation sanitization, not from AHO deterministic bundle summary.
- Process/tool row compactness checked: planning lifecycle rows were visible during the run; raw tool rows and command summaries were not projected into the main transcript.
- Derived workflow summary exclusion checked: deterministic bundle summaries are retained in Workpad/details, not used as Agent prose.
- Worker/role transcript scoping checked: planning-agent process rows appear as lifecycle status; coder/validator/auditor did not start in the stepwise path.
- Private chain-of-thought exclusion: no private reasoning was displayed.

## Source Apply Safety Coverage

- Applicable: yes for real external project acceptance; no source apply path changed.
- Source project: `E:\aho-real-acceptance\goal-loop-demo-20260702-155546`.
- Source mutation gate checked: final pass did not run code execution or apply.
- Source state: HEAD `b1bb401`; `git status --short` showed existing untracked `.agent-harness/` and `AGENTS.md`.
- Out-of-scope mutation: no raw scheduler, apply, close, remote, PR, merge, or Harness evolution ran.

## Runtime Bridge Boundary Coverage

- Applicable: yes.
- Boundary checked: external-local read-only main-Agent/planning-Agent chat may use real Codex app-server/exec prompt context, but Harness files remain workflow truth and run artifacts remain evidence.
- Tested with: real UI `ui-final-7`, `codex.test.ts`, `workbench-server.test.ts`, `run-schema.test.ts`, `test:fast`.

## Proposal / Runtime Boundary Coverage

- Applicable: yes.
- Artifact type: planning draft proposal; non-executable until confirmed.
- Authority classification: proposal/evidence, not runtime authority.
- Boundary matrix: `planning.generate` creates a reviewable draft only; `planning.confirm-execution` is the later explicit gate; neither starts coder directly.
- Stale/forged target behavior: covered by `workbench-planning-scheduler-prep` and `workbench-server` targeted tests.

## Goal Loop Boundary Coverage

- Applicable: yes for scoped automation safety.
- Persistent scope: selected Change only.
- Evidence before continuation: scoped automation now rechecks source state and accepted artifact hashes per iteration.
- Human gates retained: plan confirmation, raw scheduler, manual IntegrationCheck, integration apply/discard, remote, PR, merge, Harness evolution remain outside this change's automation.
- Tested with: `automation-runtime`, `goal-loop-runtime`, `test:fast`.

## Module Boundary Coverage

- Applicable: yes.
- Owners checked:
  - `src/workbench/chat.ts` owns initial main-Agent prompt.
  - `src/server/workbench/topic-messages.ts` owns live topic creation SSE.
  - `src/web/src/App.tsx` owns live-first pending topic UI and composer behavior.
  - `src/workbench/actions/handlers/planning.ts` owns planning action execution and lifecycle projection.
  - `src/workbench/planning/proposed-plan.ts` owns proposed plan extraction/sanitization.
  - `src/workbench/actions/handlers/automation.ts` owns scoped automation per-iteration safety.
- Compatibility result: public action ids, confirmation queue, revalidation, ToolPolicyGate, Scheduler/IntegrationCheck/apply/close owners unchanged.
- Boundary tests: `workbench-module-boundaries.test.ts` plus aggregate suites.

## Core Mechanism Reuse Coverage

- Applicable: yes.
- Existing mechanisms reused: Codex run artifacts, Topic thread entries, live SSE, WorkbenchAssistantEvent lifecycle rows, planning bundle persistence, confirmation queue, current-gate revalidation, scoped automation runner.
- New cross-cutting mechanism: none.
- Local frameworks avoided: no new transcript truth, no new controller, no new action system, no new automation allowlist.
- Future-cost result: raw Codex stream handling and visible planning prose are now protected by focused tests.

## Close / Handoff Drift Coverage

- Applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`, active change docs.
- Stale active-path / phase grep: must be rechecked after `harness-change close`.
- Latest archive / active path alignment: update `AGENTS.md` and `docs/STATUS.md` after close.
- Harness evolution state checked: run `harness-evolve check`.

## Remote Handoff Acceptance Coverage

- Applicable: no.
- Reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
