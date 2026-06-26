# Plan: workbench-mode-aware-local-goal-loop-real-ui-acceptance-v1

## Approach

This is an acceptance-first change. Build the current AHO product, create a
fresh E-drive sandbox, run Workbench against that sandbox, and use the real
in-app browser to verify both execution modes. Change product code only if the
browser path reveals a real blocker.

## Steps

1. Run preflight evidence: main repo status, build, browser connector readiness.
2. Prepare `E:\aho-accept\mode-aware-loop-real-ui-v1\src` as a small Git
   Node/TypeScript project and use
   `E:\aho-accept\mode-aware-loop-real-ui-v1\home` as `AHO_HOME`.
3. Start Workbench with the external source and runtime home.
4. Case A: create a small demand, generate a plan, confirm with `请求批准`,
   and verify the next action remains a single real primary gate.
5. Case B: create a separate small demand, generate a plan, confirm with
   `完全访问权限`, and verify local allowed gates auto-progress to
   close/archive, completed/no gate, or a clear blocker.
6. Record real UI evidence, run artifacts, source status, final state, and
   whether any product fix was needed.
7. If no product code changes are needed, close with acceptance evidence and
   Harness checks. If code changes are needed, repair the existing owner path,
   run targeted/product verification, then repeat the relevant UI path.

## Decisions

- Do not use C-drive acceptance directories.
- Do not use the AHO development checkout as the managed source.
- Treat browser UI evidence as the acceptance source; server/API evidence may
  supplement but not replace it.
- Keep PR/remote/merge/IntegrationCheck apply-discard/Harness evolution out of
  the automated scope.

## Minimality Gate Plan

- Can this be a no-op: yes if real UI acceptance passes; close with evidence.
- Reuse: existing Workbench serve path, confirmation queue, local Goal Loop
  coordinator, scoped automation, Codex runtime, validation/audit/apply/close
  owners.
- Shared root fix: if a blocker appears, inspect the shared owner
  (`goal-loop-runtime`, `automation-runtime`, action revalidation, Workbench
  read-model, or DecisionPanels) before adding local guards.
- Avoided: new workflow runtime, permission system, projection framework,
  evidence family, fake UI button, PR/remote path.
- Smallest coherent change: acceptance record plus minimal owner fix only if
  the UI proves a defect.

## Module Boundary Plan

- Owner module: not applicable unless a blocker is found.
- New / moved responsibilities: none planned.
- Facade touch points: none planned.
- Forbidden write-back locations: broad facades, new local runtime frameworks,
  reference project source, and AHO development checkout as managed source.
- Compatibility surface: Workbench UI/API/action payloads should remain
  unchanged unless a blocker requires a minimal fix.
- Boundary tests: only needed if product code changes.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Workbench confirmation queue,
  current-gate revalidation, scoped automation, local Goal Loop coordinator,
  Codex run artifacts, validation/audit, source safety, apply/landing/close.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: existing touched owner only if needed.
- Shared cross-cutting logic location: existing action revalidation or
  projection owner if needed.
- Local framework / state machine / projection / validation / gate avoided:
  yes.
- Future-cost reduction for similar features: real UI evidence establishes
  whether the latest local loop can be trusted before widening product scope.

## Planning-Discovered Gaps

- The previous product closeout did not claim browser UI acceptance because
  the local browser connector failed before navigation. This change verifies
  that path now that the connector is available.
