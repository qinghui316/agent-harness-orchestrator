# Plan: Auto-Evolve Harness Controlled Scheduler Continuation Window Noop

## Approach

Use the lightweight Harness evolution path. Review the five controlled Scheduler archive summaries and current ECL/review-template coverage. Because the evidence repeats covered boundaries rather than exposing a durable rule gap, record a no-op proposal with independent review and Experience Retention Scan.

Do not edit product runtime or add new Harness rules. Let `scripts/harness-evolve.ps1 mark-complete` append the single results row and remove the pending file.

## Steps

1. Read pending evolution, candidate summaries, current ECL/review-template coverage, and prior no-op proposal shape.
2. Get independent subagent plan/review evidence.
3. Write an evolution proposal with recommendation and Experience Retention Scan.
4. Run Harness validation and mark the pending evolution complete through the script.
5. Update current handoff docs after close so active/pending/latest archive pointers are correct.

## Decisions

- Recommendation: `noop / independent_review`.
- Reason: candidate lessons are already covered by existing ECL and review-template sections.
- Cross-change preflight P1 from the latest product close-ready review does not require a new Harness rule because existing scoped action, proposal/runtime, and Goal Loop fail-closed rules already cover stale/forged/cross-change targets; the product fix added targeted tests.
- Review-template defaults should not be changed broadly to `yes`; candidate evidence shows agents marked relevant sections applicable when needed, and defaulting more sections on would add noise.
- `results.tsv` is updated only through `harness-evolve.ps1 mark-complete`.

## Module Boundary Plan

- Owner module: not applicable for product modules.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: product runtime, Workbench, Scheduler, Goal Loop, ToolPolicy, source apply, close, merge, IntegrationCheck, remote, and broad facades remain untouched.
- Compatibility surface: current ECL, review template, scripts, and product APIs remain compatible.
- Boundary tests: Harness lint/status/evolve checks.
- Follow-up split candidates: none.
- If not applicable, reason: this is a Harness evolution evaluation and no product code changes are proposed.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `harness/evolution/pending.md`, archive summaries, proposal files, independent review, Experience Retention Scan, `results.tsv`, and `harness-evolve.ps1 mark-complete`.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: controlled Scheduler product details remain archive-only.
- Shared cross-cutting logic location: existing ECL/review-template sections continue to own scoped action, proposal/runtime, Goal Loop, module-boundary, core-reuse, Workbench honesty, documentation entropy, and experience lifecycle rules.
- Local framework / state machine / projection / validation / gate avoided: no local Harness evolution workflow or manual results logging is added.
- Future-cost reduction for similar features: future agents can cite this no-op proposal as evidence that covered controlled Scheduler lessons should stay archive-only unless a new repeated failure appears.

## Plan Review Evidence

- Subagent `019ee6b0-4b99-71b0-8779-87c1b512c49c`: PASS. It confirmed the no-op / independent-review direction, said no new rule is warranted for the latest cross-change preflight P1, warned not to broaden review-template defaults, and reminded that `mark-complete` should append the single results row.

## Planning-Discovered Gaps

- Final handoff repair is required after mark-complete because `docs/STATUS.md` still pointed to the just-closed product active change before the auto-evolve change was opened.
