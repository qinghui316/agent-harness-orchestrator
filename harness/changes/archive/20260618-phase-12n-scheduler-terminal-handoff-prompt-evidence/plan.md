# Plan: Phase 12N Scheduler Terminal Handoff Prompt Evidence

## Approach

Add a narrow terminal handoff evidence path after existing Workpad / Goal Loop visibility checks.

`src/workbench/codex-chat/goal-loop-context.ts` will remain the parity adapter: it will inspect the already projected Workpad summary and attach a compact terminal handoff only when Workpad terminal evidence and visible Goal Loop terminal state agree. `src/goal-loop/main-agent-context.ts` will own the Markdown authority wording for terminal handoff context. `src/workbench/codex-chat/context.ts` will only pass the optional compact field through, and `goal-loop-prompt-evidence.ts` will add a prompt-stack label plus compact `context.prepared` data.

The implementation will not read scheduler-runtime raw artifacts from prompt-context code and will not alter concrete action payloads, controller/preflight artifacts, or scheduler runtime behavior.

## Steps

1. Add typed terminal handoff summary/evidence helpers with false-authority flags.
2. Extend visible Goal Loop main-Agent context to attach terminal completion or blocked-closeout evidence only after Workpad projection parity and terminal-state matching.
3. Render terminal handoff Markdown as main-Agent prompt context only.
4. Add prompt-stack and `context.prepared` compact evidence labels/fields.
5. Extend `tests/unit/workbench.test.ts` for completion, blocked closeout, compactness, stale/hidden omission, and no action mutation.
6. Run targeted and project verification, then update review/handoff evidence.

## Decisions

- Plan-before-ECL subagent self-evaluation: Dewey (`019eda10-783c-7ed0-8fba-8f29944148b9`) returned conditional pass. Required plan corrections were applied before implementation: terminal evidence must match terminal Goal Loop state, and parity belongs in `goal-loop-context.ts` using Workpad projection summaries only.
- Compact prompt evidence will not include `recommendedActionScope`, `worktreeIds`, `readyWorktreeIds`, `resultTargetWorktreeIds`, close approval ids, action payloads, markdown, or full snapshots.
- Terminal handoff evidence is not copied into GoalLoopDecision, iteration, continuation brief, next-step packet, controller policy, or gate-readiness preflight schemas.

## Module Boundary Plan

- Owner module: `src/goal-loop/main-agent-context.ts` owns terminal handoff Markdown/authority wording; `src/workbench/codex-chat/goal-loop-context.ts` owns Workpad-visible parity and terminal-state matching; `src/workbench/codex-chat/goal-loop-prompt-evidence.ts` owns compact prompt evidence labels/fields.
- New / moved responsibilities: attach read-only terminal SchedulerRun handoff evidence to visible main-Agent context after Workpad parity.
- Facade touch points: `src/workbench/codex-chat/context.ts` only forwards optional typed evidence to the existing chat/orchestrator context result.
- Forbidden write-back locations: no new logic in Workbench server/action facades, confirmation queue builders, frontend shell, scheduler-runtime writers, controller policy, gate-readiness preflight, or GoalLoopDecision packet schemas.
- Compatibility surface: existing `chat.ask` / `orchestrator.plan` run artifact shapes gain optional compact prompt evidence; no action ids, payloads, routes, Workbench JSON decisions, or scheduler runtime records change.
- Boundary tests: targeted Workbench unit tests for promptStack/context.prepared compactness and no executable action mutation.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Initial plan was too broad on "visible packet + terminal card"; corrected to require matching terminal Goal Loop state plus Workpad terminal summary.
- Initial plan did not state the precise parity location; corrected to keep parity in `src/workbench/codex-chat/goal-loop-context.ts`.

