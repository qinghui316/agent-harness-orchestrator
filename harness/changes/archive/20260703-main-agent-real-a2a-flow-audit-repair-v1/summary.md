# Main-Agent Real A-to-A Flow Audit + Repair V1

## Purpose

Audit and repair the real AHO main-agent to child-agent interaction flow against the reference product behavior. The target flow is: user message -> real main-agent response or question -> explicit child-agent delegation -> child-agent process and history in the right Agent workspace -> user can refine the child-agent output -> implementation starts only through the existing Harness gate -> main agent receives the result and continues.

This change is a real browser/runtime acceptance pass, not a test-only inference. It may repair UI projection, prompt ownership, live streaming, child-agent history, and planning/clarification surfaces discovered during the audit, while preserving existing Harness authority.

## Scope

In scope:

- Reference audit of `desktop-cc-gui`, Codex Plan Mode / Goal continuation surfaces, and ODWF agent/pipeline/event/journal concepts.
- Real AHO flow trace using the normal app and a real project path, without fake Codex, mocked binaries, handwritten artifacts, or direct manager truth writes.
- Repair of main transcript leakage, planning-agent / child-agent projection, clarification question visibility, and app-server live-vs-replay labeling discovered by the audit.
- Regression tests for transcript separation, Agent workspace history, planning/clarification interaction, confirmationQueue ownership, and automation boundaries.
- Real UI acceptance notes with run ids, event/snapshot observations, and screenshots/API snapshots when available.

Out of scope:

- No new execution permission, controller, workflow truth, action type, confirmationQueue authority, or automation allowlist entry.
- No replacement of `planning.confirm-execution`, target revalidation, ToolPolicyGate, validation/audit, Scheduler, IntegrationCheck, apply/close, remote, PR, merge, or Harness evolution owners.
- No injection of parent Agent workspace chat history into worker `RoleContextPacket`, delegate manifest, or scheduler worker context.
- No ordinary Agent mode or new provider/runtime mode.

## Current Status

Completed.

Reference audit, Codex app-server user-input event plumbing, bounded planning-agent delegation, parent/child transcript ownership repairs, transcript-first child Agent workspace layout, pinned child-agent composer layout, resize-only left project sidebar repair, accurate left/right shell resize grips, planning visible-text cleanup, Agent workspace derived-bundle fallback removal, targeted unit/projection/runtime tests, and normal App real-browser A2A acceptance are in place.

## Verification

Complete; real UI acceptance, targeted tests, standard verification, Workbench verification, and Harness checks passed.

- `npx vitest run tests/unit/codex.test.ts tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx tests/unit/workbench-read-model.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/automation-runtime.test.ts` — passed, 6 files / 247 tests.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npx vitest run tests/unit/web-app.test.tsx tests/unit/workbench-read-model.test.ts tests/unit/workbench-module-boundaries.test.ts` — passed, 3 files / 183 tests.
- `npx vitest run tests/unit/web-app.test.tsx -t "resizes side rails|transcript-first planning-agent"` — passed, 1 file / 2 selected tests.
- `npx vitest run tests/unit/web-app.test.tsx tests/unit/workbench-module-boundaries.test.ts` — passed, 2 files / 138 tests.
- `npm run test:fast` — passed, 81 files / 793 tests.
- `npm run build` — passed, with existing Vite chunk-size warning.
- `npx vitest run tests/unit/codex.test.ts tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx tests/unit/workbench-read-model.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/automation-runtime.test.ts tests/unit/parent-agent-transcript.test.ts` — passed, 7 files / 255 tests.
- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx tests/unit/parent-agent-transcript.test.ts` — passed, 3 files / 145 tests after removing Agent workspace derived-bundle fallback.
- `npm run build` — passed after the final A2A text/projection fixes, with existing Vite chunk-size warning.
- `npm run test:workbench` — passed, 9 files / 145 tests.
- `npm run typecheck` — passed after final projection/text cleanup.
- `npm run lint` — passed after final projection/text cleanup.
- `npm run build` — passed after final projection/text cleanup, with existing Vite chunk-size warning.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` — passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` — passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` — passed; rebuilt `harness/changes/INDEX.json`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` — passed; no pending evolution.
- Real browser AHO layout smoke: in-app browser connected, opened `http://127.0.0.1:4477/?project=goal-loop-demo-real`, expanded the Agent workspace, and measured real DOM layout. Agent content used `decision-pane-content agent-content` with hidden outer overflow; transcript region used `overflow:auto`; composer was pinned at the bottom of the right Agent workspace. After rebuilding and restarting the real `dist/index.js workbench serve` process on `127.0.0.1:4477`, `elementFromPoint()` showed left/right resize grip areas hitting `.shell-resize-grip` with `cursor: ew-resize` through the real grip width, while adjacent non-grip content returned `cursor: auto`. Left rail drag changed grid from `280px 450px 320px` to `340px 390px 320px`; right rail drag changed grid from `340px 390px 320px` to `340px 330px 380px`.
- Real browser full A2A flow: with the normal App and project `goal-loop-demo-real`, created demand `真实 A2A live streaming 验收 12：请把 message.txt 改成包含 hello from verified A2A confirmation text，并先给出可审阅方案。`. The main transcript showed the user message, a real main-agent streamed/natural reply, and parent-level `委派 planning-agent` process text. The right Agent workspace opened for `planning-agent` and showed the planning-agent transcript/plan. User feedback entered through the planning-agent composer (`请保留 message.txt 现有内容，只要确保包含目标文本；验证方式使用 node test.mjs。`) triggered a planning-agent revision; the revised plan contained both `保留...现有内容` and `node test.mjs`. Entering `实施此计划` in the planning-agent composer called the existing `planning.confirm-execution` path, produced the main transcript text `方案已确认并保存。当前不会直接修改文件；下一步会继续走现有执行边界。`, did not execute code, and left execution at the existing Harness gate.
- Final browser projection check after rebuild/restart: main transcript had no old English `Planning confirmed...` text; Agent workspace had no global execution mode, no input/output summary cards, no standalone `实施此计划` button, no `主 Agent` tab, no `Planning draft...` / `Use the smallest focused implementation...` fallback, and the child-agent composer remained visible at the bottom.
- Native `request_user_input` was wired and tested at unit/projection level, but the real A2A acceptance run did not trigger a Codex runtime question card; no fake question card was used to claim that path.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user explicitly requested real reference-flow audit and repair, not another test-only plan.
- Retries or environment failures: none recorded yet.
- Screenshots / artifacts / run ids: browser smoke and full A2A flow used current in-app tab `http://127.0.0.1:4477/?project=goal-loop-demo-real`; accepted demand title `真实 A2A live streaming 验收 12...`; browser DOM snapshots recorded main transcript tail, Agent workspace tail, and shell geometry during the Codex browser session.
- External source/state safety: no production source-root direct truth writes are allowed during acceptance.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: pending.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: required before close for current handoff docs.
- Experience lifecycle result: planning draft confirmation-card behavior is retired from the primary confirmation queue for planning; interactive planning feedback/confirmation now lives in the right Agent workspace while apply/close/scheduler/integration gates remain in confirmation.
- Roadmap/current-direction stale language check: required before close.
- Old experience retained / merged / retired / archive-only: planning confirmation-card behavior must be retired or explicitly retained only for non-planning gates.
