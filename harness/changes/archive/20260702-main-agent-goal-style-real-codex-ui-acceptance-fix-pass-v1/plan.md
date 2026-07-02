# Plan: main-agent-goal-style-real-codex-ui-acceptance-fix-pass-v1

## Approach

Run a structured fix-and-acceptance pass. First harden scoped automation source
safety by reusing the existing automation safety capture helpers and runtime
`checkSafety` hook. Then repair the real UI conversation flow exposed by the
acceptance pass: normal external-local demand creation must be live-first,
main-Agent chat must come from the real Codex read-only runtime, ordinary
composer messages must not be auto-converted into planning actions, and
planning-agent lifecycle/prose must be projected from real AgentTask/run events
rather than AHO-authored fake replies. Finally, rerun real Codex + real
Workbench UI acceptance against a new external demo repo.

## Steps

1. Prepare the active change documents and keep `docs/STATUS.md` /
   `docs/CURRENT-DEVELOPMENT-PLAN.md` aligned with the current acceptance phase.
2. Wire per-iteration source/artifact drift checking into
   `runScopedAutomationAction` without changing the scoped automation allowlist
   or action registry.
3. Add targeted tests for the Workbench automation handler safety hook and any
   acceptance-blocking fixes discovered during the real pass.
4. Ensure new Workbench demand creation runs a read-only main Agent turn and
   records a run-backed center transcript message before the planning
   confirmation gate appears.
5. Add a live topic creation endpoint and frontend SSE consumption so topic
   creation shows user message, run start, streamed output, and snapshot in
   order.
6. Remove the composer branch that turns ordinary chat into
   `planning.generate` / `planning.revise`; only explicit gate clicks may run
   planning actions.
7. Add compact lifecycle status rows for planning-agent and role agents from
   real live events, and stop appending deterministic bundle summaries as
   visible planning-agent prose.
8. Create an external demo git repo under `E:\aho-real-acceptance\...` with a
   small file and test/script suitable for a real Codex edit.
9. Start the current AHO app, add/open that demo project through the UI, and run
   the real `逐步确认` acceptance path.
10. Run the real `完全访问权限` acceptance path on the demo project. Record run ids,
   screenshots/API snapshots where available, and before/after source status.
11. Exercise or verify the stop boundaries for raw Scheduler/manual
   IntegrationCheck/integration apply-discard/remote/PR/merge/Harness evolution.
12. Run targeted, aggregate, and Harness verification. Update review/summary,
   close the change, process any pending Harness evolution, then commit.

## Decisions

- Real Codex is required for close acceptance. Fake Codex may only be used for
  supporting unit tests and cannot be cited as the acceptance pass.
- The app may use the current AHO app data because that validates the real
  product path; the managed source project under test must be a fresh external
  repo. `external-local` is the normal product path for such repos, not an
  acceptance downgrade.
- Positive apply/close acceptance must not target this development checkout.

## Minimality Gate Plan

- Can this be a no-op: no; previous closeout recorded no real/manual acceptance
  and Workbench scoped automation does not currently pass a per-iteration
  `checkSafety` hook.
- Reuse: `captureAutomationSourceState`, `captureAcceptedArtifactHashes`,
  `runScopedAutomation` `checkSafety`, existing topic/thread live streams,
  existing `runCodexChat`, and the current transcript process-row projection.
- Shared root fix: harden the Workbench automation handler rather than adding
  one-off drift guards to individual child actions.
- Avoided: no new controller, acceptance runner, evidence family, UI, or
  allowlist.
- Smallest coherent change: add the missing safety hook, a narrow live topic
  creation path, read-only app-server eligibility for external-local chat,
  composer/gate separation, lifecycle process rows, targeted tests, and real
  acceptance evidence.

## Module Boundary Plan

- Owner modules: `src/workbench/actions/handlers/automation.ts` remains the
  Workbench scoped automation bridge; `src/automation-runtime/runner.ts`
  remains the runtime loop owner; `src/server/workbench/topic-messages.ts`
  owns topic/message SSE streams; `src/workbench/chat.ts` owns main-Agent topic
  turns; `src/workbench/actions/handlers/planning.ts` owns planning-agent
  lifecycle/proposal generation; `src/web/src/App.tsx` consumes live streams.
- New / moved responsibilities: topic creation gets a live SSE path that
  delegates to existing topic/chat owners; no new workflow truth or controller.
- Facade touch points: Workbench project route adds a thin `/topics/live`
  dispatch only.
- Forbidden write-back locations: no changes to confirmationQueue, action
  registry, automation allowlists, Scheduler/IntegrationCheck owners, apply/
  close owners, remote/PR/merge, or Harness evolution runtime.
- Compatibility surface: existing scoped automation action payloads and
  approval/workflow gate revalidation stay unchanged.
- Boundary tests: assert the handler supplies drift checking before child action
  execution, external-local read-only chat can use app-server while code-write
  remains restricted, composer chat does not invoke planning actions, lifecycle
  rows are projection-only, and automation allowlists/registry/revalidation do
  not expand.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: scoped automation runtime,
  safety capture helpers, current-gate revalidation, ToolPolicy/high-impact
  audit, Workbench UI, and real Codex runtime.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: Workbench automation handler supplies
  project/change-specific safety checks; runtime remains generic.
- Shared cross-cutting logic location: existing automation runtime safety types
  and repository artifacts.
- Local framework / state machine / projection / validation / gate avoided:
  no new state machine or projection.
- Future-cost reduction for similar features: the real acceptance record
  becomes the baseline for future Goal-style loop changes.

## Planning-Discovered Gaps

- The previous LLM strategy advice closeout had no real/manual acceptance. This
  change must not close without a real Codex UI pass or a documented blocked
  status.
