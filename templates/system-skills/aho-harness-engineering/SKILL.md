---
name: aho-harness-engineering
description: "Use for AHO Runtime-assigned project Harness work: detect or audit the current Harness, maintain it from one closed Change, or evolve it from one fixed evidence window."
---

# AHO Harness Engineering

Use only the mode and task facts assigned by AHO Runtime:

- onboard: detect the project and create or complete the Harness it actually needs.
- audit: assess the current Harness and repair evidence-backed gaps.
- maintain-assigned-closeout: reconcile one assigned terminal Change with current project memory.
- evolve-assigned-window: propose, score, and complete a durable delta from one fixed Change window.

Runtime decides when work runs, which project and roots it belongs to, the
evidence/window, task recovery, and completion state. You decide what the
evidence means, which current artifacts own that meaning, and whether to create,
update, consolidate, retire, or leave content unchanged.

## Unified Method

1. Read the task packet and identify the actual project and memory roots.
2. Detect the project's current Harness shape and document responsibilities.
3. Read only the current artifacts and assigned evidence needed for this mode.
4. Compute the real delta as Create, Update, or Already Good.
5. Classify durable experience as Promote, Retain, Merge, Retire, or Archive-only.
6. Check documentation entropy before adding content.
7. Directly complete justified edits, except that Evolution remains read-only until its proposal scores at least 80 with no hard issue.
8. Run the project's applicable verification and re-read the resulting handoff.
9. Return a short completed, noop, or blocked result grounded in evidence.

Do not infer another mode, widen an assigned Evolution window, create or claim
tasks, update Runtime state, advance watermarks, or close Changes. Do not invent
a generic Harness path layout. Discover the current project's owners from its
entry guidance, current docs, Harness records, and verification surface.

## References

Read only what the current mode needs:

- Detection and onboarding: [project-and-harness-detection.md](references/project-and-harness-detection.md)
- Shared delta method: [ecl-delta-analysis.md](references/ecl-delta-analysis.md)
- One closeout: [incremental-closeout.md](references/incremental-closeout.md)
- Five-Change evolution: [evolution-window.md](references/evolution-window.md)
- Current-doc quality: [documentation-entropy.md](references/documentation-entropy.md)
- Experience decisions: [experience-lifecycle.md](references/experience-lifecycle.md)
- Checks and handoff: [verification-and-handoff.md](references/verification-and-handoff.md)
- Interrupted or ambiguous work: [failure-and-recovery.md](references/failure-and-recovery.md)
- Cross-layout examples: [worked-examples.md](references/worked-examples.md)
