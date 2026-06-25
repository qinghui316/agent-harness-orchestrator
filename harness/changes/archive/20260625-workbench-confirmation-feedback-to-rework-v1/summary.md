# workbench-confirmation-feedback-to-rework-v1

## Purpose

补齐 Workbench 确认点反馈闭环。用户在当前真实 primary gate 上输入修改意见时，AHO 必须把反馈绑定到当前 Change / gate / target ids，并路由到已有 revise 或 rework 路径，而不是只记录 `requested-changes` 后停住。

V1 只覆盖两条真实产品闭环：计划确认点反馈触发 `planning.revise` 并回到计划确认；result/apply 确认点反馈触发 bounded `result.refresh-rework`，再回到 validation/audit/result review。反馈是 scoped evidence，不是 approval。

## Scope

In scope:

- 计划确认点 feedback -> `planning.revise`。
- result/apply 确认点 feedback -> `result.refresh-rework`。
- feedback target revalidation against current `confirmationQueue.primary`.
- UI/DOM evidence that inline feedback is visible for plan and result/apply gates and does not leave the stale old gate as primary after routing.
- Tests and review evidence for Workbench user-surface honesty, scoped payloads, source safety, module boundaries, and core reuse.

Out of scope:

- New feedback runtime, state machine, permission system, projection system, workflow engine, or evidence family.
- Running-turn interrupt/steer redesign.
- Goal Loop feedback behavior changes.
- PR/remote feedback auto-rework.
- Automatic apply/close/merge/remote/Harness evolution.
- Full parallel executor, scheduler loop, child Change creation, or cross-Change merge.

## Current Status

Ready to close.

Implementation completed:

- Added a scoped feedback routing helper in `src/server/workbench/feedback-routing.ts`.
- Planning confirmation feedback now routes to existing `planning.revise` and does not write canonical `spec.md` / `plan.md` / `tasks.md`.
- Result/apply feedback now routes to existing `result.refresh-rework` and does not modify source root.
- Feedback routing revalidates against the current `confirmationQueue.primary` action and target ids before routing.
- Unsupported / legacy approval feedback remains record-only.
- UI feedback payloads now include the current action id/kind, planning bundle id, worktree id, run id, and artifact context.

## Verification

- `npx vitest run tests/unit/workbench-feedback-surface.test.ts`
- `npx vitest run tests/unit/workbench-feedback-surface.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx tests/unit/action-revalidation.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`

Real UI acceptance was not claimed for this change. The changed behavior is a scoped routing/projection path covered by pure route tests, DOM tests, read-model tests, and the Workbench aggregate unit gate. A later explicit UI scout can exercise the full Codex revise/rework path if needed.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none.
- Extra prompts or reviewer instructions: user requested the confirmation-point feedback loop and explicitly excluded running-turn interrupt/steer redesign.
- Retries or environment failures: none.
- Screenshots / artifacts / run ids: no real UI/Codex run claimed.
- External source/state safety: covered by route behavior; feedback routes to planning revise or bounded rework and does not apply source root.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: active change docs plus compact handoff pointer updates in `AGENTS.md`, `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: updated from "next product slice" to current active feedback slice.
- Old experience retained / merged / retired / archive-only: not applicable.
