# Plan: Auto Evolve Harness Phase 8G 8K Boundary Evidence

## Steps

1. Record current state:
   - no active change before this change;
   - pending evolution exists for Phase 8G-8K;
   - unrelated untracked `README.md` remains excluded.
2. Review evidence:
   - read Phase 8G-8K archive summaries;
   - inspect `docs/ECL.md` and the review template for existing coverage;
   - compare repeated patterns against current rules.
3. Independent review:
   - use the user-authorized subagent as read-only reviewer;
   - record recommendation, score, evidence, and limitations.
4. Decision:
   - write `harness/evolution/proposals/20260610-phase8g-8k-boundary-evidence-*.md`;
   - choose `noop` unless evidence shows a concrete Harness rule gap.
5. Mark complete:
   - run `scripts/harness-evolve.ps1 mark-complete` with final status and
     review mode;
   - verify `pending.md` is removed and `results.tsv` / `state.json` updated.
6. Handoff:
   - update `AGENTS.md` and `docs/STATUS.md` for active/final state;
   - run Harness checks, reindex, and close readiness.

## Decision Defaults

- Default recommendation: `noop/subagent_review`, because prior Phase 7M-8K
  work repeatedly strengthened module-boundary, scoped evidence, proposal /
  runtime, and handoff-drift coverage.
- Override condition: choose `modify` only if the subagent or local review
  identifies a specific missing Harness rule that would have prevented a
  repeated Phase 8G-8K issue.

## Follow-Up Candidate

If no Harness rule change is needed, record product follow-up separately:
`Phase 8L: WorkflowRun Domain Boundary Split`, then `change/manager.ts`.
