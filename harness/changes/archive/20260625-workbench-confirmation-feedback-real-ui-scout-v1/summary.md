# workbench-confirmation-feedback-real-ui-scout-v1

## Purpose

Run a focused real Workbench UI scout for the latest confirmation-point feedback behavior. The previous `workbench-confirmation-feedback-to-rework-v1` change added scoped feedback routing and passed unit / DOM / Workbench aggregate tests, but explicitly did not claim real UI or real Codex acceptance.

This change verifies whether a normal user can enter feedback at the current primary confirmation gate and have AHO route it through the existing revise / bounded rework paths, then return to a fresh real confirmation gate.

## Scope

In scope:

- E-drive external sandbox: `E:\aho-accept\confirmation-feedback-scout-v1\src` and `E:\aho-accept\confirmation-feedback-scout-v1\home`.
- Real browser Workbench UI evidence for planning feedback -> `planning.revise`.
- Real browser Workbench UI evidence for result/apply feedback -> `result.refresh-rework`.
- Source safety evidence that feedback does not write canonical planning artifacts before plan confirmation and does not modify the source root before apply.
- Minimal product fix in the touched owner only if the scout finds a real blocker.

Out of scope:

- New feedback runtime, permission system, projection system, workflow engine, or evidence family.
- Running-turn interrupt / steer redesign.
- PR / remote feedback auto-rework.
- Full parallel executor, scheduler loop, automatic merge, or new automation scope.

## Current Status

Completed. Ready to close.

Real UI scout passed with one minimal product fix:

- Workbench URL: `http://127.0.0.1:4331/`.
- External source: `E:\aho-accept\confirmation-feedback-scout-v1\src`.
- Runtime home: `E:\aho-accept\confirmation-feedback-scout-v1\home`.
- Project id: `confirmation-feedback-scout-v1`.
- Demand / Change id: `src-message-js-greeting-hi`.
- Case A: plan-confirm feedback submitted from the real confirmation card, triggered `planning.revise` (`action-1782394304381-00831c`), and returned to a fresh planning confirmation gate. Before plan confirmation, `spec.md`, `plan.md`, and `tasks.md` remained TBD placeholders; the revised proposal lived in `planning/latest-bundle.md`.
- Case B: result/apply feedback submitted from the real result gate, triggered bounded rework run `run-20260625-213748-src-message-js-greeting-hi-bde346`, validation run `run-20260625-213859-src-message-js-greeting-hi-3e7ba8`, and audit run `run-20260625-213901-src-message-js-greeting-hi-cd3dce`.
- The rework prompt carried the user feedback: keep `greeting`, change the message to `Hey`, and sync the test. The rework candidate stayed in an AHO worktree and source root remained clean before apply.
- Audit correctly blocked the rework because the accepted plan still required `Hi` / `salute`.
- Product blocker found and fixed: the UI originally let an older approved worktree apply gate remain current after the newer rework audit blocked. `decision-inspector` now demotes same-Change worktree-apply approvals to history when a current validation/audit blocker exists.
- Real UI after the fix showed the current primary gate as `审查未通过，需要修改或补证据`, with `要求修改` / `重新审查`, and no stale `result.apply` primary gate.

## Verification

Completed:

- `git status --short`
- `npm run build`
- real UI scout in the E-drive sandbox
- `npx vitest run tests/unit/workbench-read-model.test.ts`
- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx tests/unit/action-revalidation.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`

Pending before archive:

- Harness closeout checks

## Acceptance Feedback

- Manual config edits: none during this change; the E-drive project was already trusted in Codex config by product startup/trust setup.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: the fresh UI tab initially showed the direct restored project as not initialized until `刷新项目` was clicked, while `/api/projects` reported ready external-local memory. Recorded as non-blocking UI hydration polish, not part of this fix.
- Screenshots / artifacts / run ids: DOM evidence recorded in this summary; planning revise `action-1782394304381-00831c`; original coder `run-20260625-213641-src-message-js-greeting-hi-4679f8`; rework `run-20260625-213748-src-message-js-greeting-hi-bde346`; validation `run-20260625-213859-src-message-js-greeting-hi-3e7ba8`; blocked audit `run-20260625-213901-src-message-js-greeting-hi-cd3dce`.
- External source/state safety: `E:\aho-accept\confirmation-feedback-scout-v1\src` stayed clean before apply; no `result.apply` was executed.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: stale old worktree apply primary after blocked rework audit was fixed in the read-model owner.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
