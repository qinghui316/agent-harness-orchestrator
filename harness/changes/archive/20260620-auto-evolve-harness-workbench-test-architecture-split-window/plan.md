# Plan: Auto Evolve Harness Workbench Test Architecture Split Window

## Approach

Treat this as a Harness evolution evaluation, not a product implementation phase. Review the candidate archive summaries, classify repeated lessons, get independent subagent judgment, then either apply the smallest current-doc/Harness delta or record a `keep/noop` result if existing guidance is sufficient.

## Steps

1. Read pending evolution and candidate archive summaries.
2. Draft an evolution proposal with Experience Retention Scan.
3. Request independent subagent evaluation of the proposal and candidate evidence.
4. Apply the smallest approved delta, or record no-change rationale.
5. Run Harness checks, append results, mark evolution complete, then close the change.

## Decisions

- Initial read suggests the main repeated lesson is already represented: use coherent capability-domain test work packages, prefer targeted verification during iteration, and reserve `test:workbench` for aggregate script/close evidence.
- No product runtime or broad ECL/template change is planned unless the independent review identifies a rule gap.

## Module Boundary Plan

- Owner module: not applicable.
- New / moved responsibilities: not applicable.
- Facade touch points: not applicable.
- Forbidden write-back locations: not applicable.
- Compatibility surface: Harness evolution files and possibly current docs only.
- Boundary tests: Harness checks.
- Follow-up split candidates: not applicable.
- If not applicable, reason: Harness evolution evaluation does not add or change product modules.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Harness evolution proposal/review/results flow, Documentation Entropy Coverage, Experience Lifecycle scan.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism proposed.
- Domain-specific logic location: not applicable.
- Shared cross-cutting logic location: existing ECL/Harness evolution process.
- Local framework / state machine / projection / validation / gate avoided: no new process framework.
- Future-cost reduction for similar features: retain only the shortest current rule if needed; otherwise keep archive details archive-only.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.
