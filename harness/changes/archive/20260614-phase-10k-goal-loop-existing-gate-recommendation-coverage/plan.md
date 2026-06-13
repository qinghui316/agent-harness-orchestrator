# Plan: Phase 10K Goal Loop Existing Gate Recommendation Coverage

## Approach

Keep the phase narrow: expand existing `GoalLoopDecision` evidence snapshot and recommendation policy rather than adding a new controller surface. The policy will re-read scheduler-owned projection-safe evidence, derive the next legal existing action, validate its required targets, and let the existing iteration / brief / packet pipeline carry that recommendation to the main Agent.

Subagent review found no blocker, but flagged the same boundary: recommendations must remain non-executing and must not duplicate Workbench confirmation authority. This phase therefore does not introduce new actions or invoke action handlers.

## Steps

1. Fill ECL artifacts and update handoff docs for Phase 10K.
2. Extend Goal Loop snapshot reads for scheduler worker path artifacts.
3. Add conservative recommendation ordering that mirrors the existing Workbench current-worker confirmation chain.
4. Add focused tests for current-worker and rework recommendation states.
5. Run focused and full verification.
6. Close the ECL change and commit, excluding unrelated `README.md`.

## Decisions

- Use existing `GoalLoopDecision` / `GoalLoopIteration` / continuation brief / next-step packet artifacts instead of adding `GoalLoopControllerStep` in this phase. Reason: the current product need is policy coverage, not a new public or internal action surface.
- Keep fallback `planning.goal-loop.evaluate` behavior unchanged; concrete Workbench confirmations remain primary whenever they exist.
- Prefer waiting/blocked over recommendation when evidence lineage is partial or ambiguous.

## Module Boundary Plan

- Owner module: `src/goal-loop/`.
- New / moved responsibilities: read additional scheduler-owned evidence and map it to existing-gate recommendations.
- Facade touch points: `src/goal-loop/manager.ts` remains compatibility export only; no new public Workbench action.
- Forbidden write-back locations: `src/workbench/chat.ts`, Workbench action handlers, server routes, frontend shell, scheduler-runtime owner modules, CLI command modules.
- Compatibility surface: existing `planning.goal-loop.evaluate` result shape remains additive-compatible; no action request shape change.
- Boundary tests: focused Goal Loop tests plus existing module-boundary tests.
- Follow-up split candidates: if a future phase needs a true controller step artifact, create it separately after proving it does not duplicate confirmation queue authority.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Current `GoalLoopDecision` stops at generic waiting after the first worker starts. It needs coverage for the already-implemented worker result / validation / audit / rework / integration gates.
- The fallback confirmation copy still mentions only decision / iteration / brief, while the action also writes next-step packet evidence.
