---
name: aho-harness-engineering
description: Use for AHO Runtime-assigned project Harness onboarding, full migration, audit, or isolated Evolution candidate work that requires evidence-backed semantic analysis and supported atomic publication.
---

# AHO Harness Engineering

Use the exact mode, project identity, writable root, and tool supplied by AHO Runtime. Runtime owns
path safety, schemas, fingerprints, writer locks, review binding, state transfer, and atomic
publication. You own semantic analysis of the current source and project evidence.

## Modes

- `onboard`: create a complete semantic bundle for a project that has no Harness.
- `migrate`: create a complete semantic bundle for an existing Harness that needs a full refresh.
- `audit`: inspect the current project Harness and report evidence-backed findings without writing.
- `evolve-candidate`: update only the assigned isolated candidate for one owned Evolution window.

Do not infer a different mode or invent another lifecycle command.

## Onboard And Migrate

1. Inspect the actual project source, manifests, configuration, tests, accepted interfaces, and
   relevant user facts. Treat repository prose as a lead, not automatic project truth.
2. Write exactly the complete bundle requested by Runtime into the assigned bundle root:
   `project-profile.json`, `architecture.json`, `audit.json`, and `creation-delta.json`, plus only
   artifact files referenced by `creation-delta.json`.
3. Keep source evidence project-relative and secret-safe. Distinguish implemented current facts,
   accepted targets, decisions, guides, and unknowns instead of presenting future work as current.
4. Re-read all four bundle files, resolve contradictions, and call the single Runtime-provided
   prepare or migrate tool. Do not choose a destination path or publication target.
5. Runtime creates the candidate, obtains a separate candidate-bound review, runs readiness checks,
   and publishes or rolls back. Report the resulting status without claiming success before the
   tool returns it.

The Main author cannot review its own bundle. Never write the review report, candidate, physical
project Skill, discovery links, Runtime sidecar state, or business source. Do not call plan
acceptance, Workflow execution, Integration, or Evolution tools during onboarding.

## Audit

Read the current project Skill and source evidence. Report identity, discovery, doctor/audit,
knowledge drift, ownership, and lifecycle findings. Audit is read-only and cannot repair or publish.

## Evolution Candidate

Work only after Runtime assigns an E1 window and isolated candidate. Use focused-by-default updates;
perform a full knowledge refresh only when current L1/L2/L3, Architecture, reference maps,
commands/environment, or other stable project knowledge actually changed. Bind the proposal and
candidate to the supplied source snapshot. Request the distinct independent Evolution Judge, then
call the supported publish tool only after a live score of at least 80 with no hard issue. Never edit
the canonical project Skill directly.

## Shared Boundaries

- One project has one physical project Harness Skill and one manifest project id.
- All durable Skill references are portable and relative; machine paths stay in Runtime inputs or
  sidecar operational state.
- Ordinary Change close does not dispatch Harness maintenance. Stable knowledge changes only through
  an explicit Structured Change, full migration, or accepted Evolution path.
- Skills guide Agent judgment but do not authorize state transitions. Existing Workflow, Scheduler,
  apply, Integration, remote landing, and human gates remain authoritative.
- AHO must operate from its bundled Creator Skill and TypeScript Runtime without depending on an
  external ECL installation.

## References

Read only what the assigned mode needs:

- Detection and ownership: [project-and-harness-detection.md](references/project-and-harness-detection.md)
- Bundle delta method: [ecl-delta-analysis.md](references/ecl-delta-analysis.md)
- Evolution window: [evolution-window.md](references/evolution-window.md)
- Current-doc quality: [documentation-entropy.md](references/documentation-entropy.md)
- Experience decisions: [experience-lifecycle.md](references/experience-lifecycle.md)
- Verification and handoff: [verification-and-handoff.md](references/verification-and-handoff.md)
- Failure and recovery: [failure-and-recovery.md](references/failure-and-recovery.md)
- Worked examples: [worked-examples.md](references/worked-examples.md)
