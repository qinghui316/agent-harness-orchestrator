# Plan: workbench-local-landing-ready-terminal-close-v1

## Approach

Patch the existing Workbench confirmation projection where ready landing
packages are converted into PR draft/provider items. Keep real PR flow behavior
intact, but intercept the provider-unavailable status for the selected local
Change and replace it with a local terminal item.

## Steps

1. Confirm current no-active baseline and create the structured change.
2. Inspect landing, PR draft, close-gate, and confirmation queue owners.
3. Add a small landing confirmation helper for local terminal blockers.
4. In `buildConfirmationQueue`, when the latest ready landing package belongs
   to the selected Change:
   - keep existing close-gate promotion if a close action exists;
   - if PR draft projection returns provider-unavailable, demote it to
     background and enqueue a local close blocker when close is not ready;
   - keep existing PR draft / remote / post-merge behavior when real PR
     evidence exists.
5. Add read-model tests for no-provider local terminal behavior, ready close
   promotion, and real PR behavior preservation.
6. Run targeted and required verification, then close and git settle.

## Minimality Gate Plan

- Can this be a no-op: no; latest real UI scout recorded a real local terminal
  blocker.
- Reuse: existing landing package projection, PR draft projection, close gate
  projection, confirmation queue promotion, and Workbench read-model tests.
- Shared root fix: adjust the single ready-landing projection decision instead
  of adding a landing-only runtime branch or PR fake state.
- Avoided: no new permission system, local terminal framework, workflow
  runtime, evidence family, PR provider setup, or remote path.
- Smallest coherent change: one helper plus the queue routing condition.

## Module Boundary Plan

- Owner module: Workbench read-model confirmation projection.
- Domain-specific logic: ready local landing terminal copy belongs with landing
  confirmation item builders.
- Compatibility surface: Workbench action ids and payload shapes unchanged.
- Forbidden write-back locations: no main logic in broad Workbench facades or
  frontend components.
- Boundary tests: `workbench-read-model.test.ts` plus touched helper coverage.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: close gate, landing package
  review, PR draft projection, confirmation queue primary selection, decision
  inspector alignment.
- Why existing mechanisms were insufficient: ready landing always flowed into
  PR draft/provider projection, even when the local flow explicitly excluded
  PR/remote.
- Future-cost reduction: gives local Goal Loop a real terminal surface after
  integration landing-ready without introducing a new loop runtime.

## Planning-Discovered Gaps

None yet.
