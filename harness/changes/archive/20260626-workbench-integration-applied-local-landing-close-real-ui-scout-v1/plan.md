# Plan: workbench-integration-applied-local-landing-close-real-ui-scout-v1

## Approach

Run a real UI acceptance scout before adding product code. Prefer restoring the
latest E-drive IntegrationFix sandbox because it already contains a repaired
artifact and integration apply history. If it cannot represent the intended
gate sequence, create a fresh E-drive sandbox and recreate the same path using
the existing Workbench / scheduler / IntegrationFix flow.

## Steps

1. Run preflight: confirm the AHO checkout has only unrelated `README.md`,
   build the Workbench, and record the preferred sandbox state.
2. Start Workbench with the preferred source/home and inspect the browser UI
   for the selected demand and visible primary gate.
3. If the preferred sandbox is already past integration apply, continue from
   the current local `landing.prepare` / `change.close` gate when the evidence
   still matches the same Change; otherwise create the fresh E-drive sandbox.
4. In the real browser, confirm the legal visible local gates only:
   integration apply if present, scheduler outcome/completion if shown,
   local `landing.prepare`, and local `change.close`.
5. Record source status, gate sequence, IntegrationCheck id/artifact refs,
   landing package/review refs, and close/archive path or blocker.
6. If a product blocker appears, patch only the existing owner path and run
   targeted verification for the touched boundary.
7. Close the change with handoff docs updated, Harness checks green, and a
   settlement commit that excludes unrelated `README.md`.

## Decisions

- PR/remote/merge are explicitly excluded from this local-Agent scout.
- Real UI evidence is required because the previous deterministic change only
  proved the projection to `landing.prepare`.
- No full Goal Loop runtime work belongs in this change.

## Minimality Gate Plan

- Can this be a no-op: yes if the real UI path passes; then record evidence
  and close without product code.
- Reuse: Workbench server/UI, existing IntegrationCheck apply, scheduler
  outcome/completion, landing, close, action revalidation, and external-local
  restore.
- Shared root fix: if blocked, inspect the relevant owner and callers before a
  local guard.
- Avoided: no PR workflow, remote provider setup, new runtime, new evidence
  family, or duplicate projection framework.
- Smallest coherent change: acceptance record plus the narrowest existing-owner
  fix only if the UI exposes a real blocker.

## Module Boundary Plan

- Owner module: not applicable unless product code changes.
- New / moved responsibilities: none planned.
- Facade touch points: none planned.
- Forbidden write-back locations: do not add main logic to Workbench broad
  facades, `App.tsx`, `chat.ts`, or manager facades if a fix is needed.
- Compatibility surface: Workbench action ids, API shapes, and projection JSON
  must remain compatible.
- Boundary tests: targeted owner tests only if product code changes.
- Follow-up split candidates: none.
- If not applicable, reason: acceptance-first change with no planned code.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: IntegrationCheck apply/discard,
  scheduler outcome/completion, local landing, close gate, Workbench
  confirmation queue, current-gate revalidation, and external-local restore.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: existing owner path only if a blocker is
  found.
- Shared cross-cutting logic location: existing action revalidation and
  projection owners.
- Local framework / state machine / projection / validation / gate avoided:
  all avoided.
- Future-cost reduction for similar features: proves the local terminal path
  that future local Goal Loop runtime can stop on.
- If not applicable, reason: not applicable only if no code changes are made.

## Planning-Discovered Gaps

- Landing attribution for repaired IntegrationFix patches must use Git-like
  untracked-file patch rendering. The preferred E-drive sandbox contained an
  already-applied repaired IntegrationFix result with a new untracked file.
  Local landing initially classified all changed files as unattributed because
  repaired patches used filtered Git blob identity while source-diff callers
  rendered untracked files with ad hoc zero hashes and platform line endings.
  The shared fix belongs in source-diff patch rendering, not in landing-only
  exception logic.
- Local terminal close after landing-ready is still not fully product-complete
  for the multi-worktree / IntegrationFix path. Once landing became ready, the
  Workbench routed to PR provider readiness because no Git remote exists. Since
  PR/remote are out of scope for local-Agent completion, the next slice should
  define and verify the local-only terminal close gate after landing-ready.
