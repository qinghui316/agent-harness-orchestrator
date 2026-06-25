# Plan: workbench-confirmation-feedback-real-ui-scout-v1

## Approach

Start with real acceptance, not product code. Build and launch Workbench against a fresh E-drive sandbox, drive the browser through two confirmation-feedback scenarios, and record evidence. If the scout exposes a real blocker, patch only the existing owner responsible for the blocker and verify with targeted tests.

## Steps

1. Prepare the external sandbox at `E:\aho-accept\confirmation-feedback-scout-v1\src` and `E:\aho-accept\confirmation-feedback-scout-v1\home`.
2. Run preflight: repo `git status --short`, `npm run build`, and sandbox source status.
3. Launch Workbench with the external source and runtime home.
4. Case A: create a small demand, reach plan confirmation, submit user feedback, and verify `planning.revise` produces a new planning confirmation without writing accepted canonical artifacts.
5. Case B: run a small demand to result/apply gate, submit user feedback, and verify `result.refresh-rework` receives the feedback, runs bounded rework, and returns to result/apply or a classified blocker without source-root mutation.
6. If product code changes are needed, run targeted owner tests plus required gates.
7. Record acceptance evidence, complete review coverage, run Harness checks, close the change, and git-settle all related files except unrelated `README.md`.

## Decisions

- Real UI evidence is required because the previous change explicitly did not claim real browser/Codex acceptance.
- The acceptance source and runtime home are outside the AHO development checkout.
- Existing revise/rework/action/revalidation owners are reused; no new feedback runtime is introduced.

## Minimality Gate Plan

- Can this be a no-op: yes if the scout passes; close with evidence only.
- Reuse: existing `planning.revise`, `result.refresh-rework`, confirmation queue, inline feedback UI, server action path, current target ids, and source safety checks.
- Shared root fix: if failing, inspect the UI payload builder, feedback routing helper, current-gate revalidation, and existing revise/rework handlers before adding any local guard.
- Avoided: feedback runtime, permission system, projection framework, workflow engine, evidence family, and future-only automation branch.
- Smallest coherent change: real acceptance plus only the minimal owner fix required by observed blocker.

## Module Boundary Plan

- Owner module: not applicable unless a blocker is found; likely owners are Workbench UI surface, `src/server/workbench/feedback-routing.ts`, current-gate revalidation, planning handler, or result rework handler.
- New / moved responsibilities: none planned.
- Facade touch points: none planned; any server touch must remain thin dispatch / route glue.
- Forbidden write-back locations: source root, canonical accepted planning artifacts before confirmation, apply/close/remote/Harness evolution.
- Compatibility surface: existing Workbench feedback endpoint and confirmation queue payloads.
- Boundary tests: targeted tests for the touched owner if code changes.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: confirmation queue, inline feedback editor, feedback routing helper, `planning.revise`, `result.refresh-rework`, validation/audit and source safety.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: only the observed owner if a blocker appears.
- Shared cross-cutting logic location: current-gate target revalidation remains the shared guard.
- Local framework / state machine / projection / validation / gate avoided: all avoided unless real evidence proves a gap.
- Future-cost reduction for similar features: real UI evidence distinguishes product blockers from test-only confidence before widening feedback behavior.

## Planning-Discovered Gaps

None yet.
