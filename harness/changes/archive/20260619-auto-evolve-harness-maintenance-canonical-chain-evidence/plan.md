# Plan: Auto Evolve Harness Maintenance Canonical Chain Evidence

## Approach

Produce a `keep` evolution proposal. The evidence shows the existing Harness rules are already doing the intended job: after several product maintenance evidence phases, follow-up source convergence changes reused common owners for target-boundary, lineage, and ledger idempotency instead of adding more local mini-frameworks.

No durable ECL/template/lint/docs delta is planned. The evolution result will explicitly retain current rules as sufficient and keep detailed phase narratives archive-only.

## Steps

1. Fill active ECL files and align `AGENTS.md` / `docs/STATUS.md` with the active auto-evolve change.
2. Write `harness/evolution/proposals/20260619-maintenance-canonical-chain-evidence-keep.md`.
3. Record independent subagent review evidence.
4. Run Harness validation.
5. Run `scripts/harness-evolve.ps1 mark-complete -Status keep -EvalMode independent_review` with a concise note.
6. Update close-ready ECL review/handoff, close, and final git commit.

## Decisions

- Plan self-evaluation: subagent PASS. Corrections applied: fill active ECL placeholders, fix handoff drift, include ledger-idempotency archive as observed evidence, mark Documentation Entropy / Experience Lifecycle / Module Boundary / Core Mechanism Reuse applicable, and document `keep` as retaining existing current rules as sufficient.
- Evolution result semantics: use `keep`, not `noop`, because the proposal explicitly keeps existing current rules and current development direction as sufficient durable memory.
- Reference evidence: AgentScope Java and Symphony continue to support append-only evidence plus curated/current memory separation; no reference code is copied.

## Module Boundary Plan

- Owner module: not applicable for source changes; reviewed evidence concerns existing owners `src/agent-task/canonical-patch-target-boundary.ts`, `src/agent-task/canonical-patch-lineage.ts`, and `src/agent-task/ledger.ts`.
- New / moved responsibilities: none in this auto-evolve change.
- Facade touch points: none.
- Forbidden write-back locations: source modules, Workbench, server, frontend, manager facades, reference projects, ECL templates, and lint rules unless review finds a concrete gap.
- Compatibility surface: no product runtime behavior or public API change.
- Boundary tests: Harness validation and proposal review.
- Follow-up split candidates: none.
- If not applicable, reason: no source implementation in this auto-evolve change.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: retain current Architecture Growth Control / Core Mechanism Reuse, Module Boundary, Documentation Entropy, Experience Lifecycle, ToolPolicy/human-gate, and workflow-truth rules.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no insufficiency found; no new mechanism proposed.
- Domain-specific logic location: remains in product source owners from archived changes.
- Shared cross-cutting logic location: existing owner modules from archived changes remain the reusable pattern.
- Local framework / state machine / projection / validation / gate avoided: avoid adding a duplicate Harness rule or template field that restates the current broader rule.
- Future-cost reduction for similar features: future agents should continue selecting narrow source convergence slices from `docs/CURRENT-DEVELOPMENT-PLAN.md` before new evidence-only phases.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None.
