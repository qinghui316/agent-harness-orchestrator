---
name: aho-harness-engineering
description: "Use for AHO Runtime-assigned project Harness work: detect or audit the current Harness, maintain it from one closed Change, or evolve it from one fixed evidence window."
---

# AHO Harness Engineering

Use the mode and task facts assigned through the native provider context:

- onboard: detect the project and create or complete the Harness it actually needs.
- audit: assess the current Harness and repair evidence-backed gaps.
- maintain-assigned-closeout: reconcile one assigned terminal Change with current project memory.
- evolve-assigned-window: propose, score, and complete a durable delta from one fixed Change window.

Runtime decides when work runs, which project and roots it belongs to, the
evidence/window, task recovery, and completion state. You decide what the
evidence means, which current artifacts own that meaning, and whether to create,
update, consolidate, retire, or leave content unchanged.

When this Skill is loaded on a project's first or unfinished Main Agent turn
and the context marks `mode: onboard`, inspect the actual project before
writing. The Runtime has only prepared the project/memory roots; it has not
created Harness documents. In AHO Harness mode, onboarding is complete only
when the existing Runtime `auditHarness` contract can report a ready core
Harness. Do not stop after creating only an entry guide. Create the core
Harness directly in the Runtime-provided roots, then create only the
project-specific guidance justified by the detected technology and task.

## Unified ECL Method

Use one evidence-first loop for every mode:

1. **Quick detection**: identify the actual project root, memory root, current
   Harness state, technology, entry guidance, and available verification.
2. **State classification**: distinguish missing, partial, and ready Harness
   state from project-specific documentation gaps. Do not use a project
   document name as a permission rule.
3. **Evidence and intent**: read only the current artifacts, assigned Change
   or window evidence, and user request needed for this mode. Treat summaries
   as hypotheses until current evidence supports them.
4. **Delta synthesis**: classify each candidate as Create, Update, or Already
   Good, then separate mandatory core readiness from project-specific,
   optional, and archive-only material.
5. **Experience lifecycle**: use Promote, Retain, Merge, Retire, or
   Archive-only to avoid copying history or adding duplicate rules.
6. **Create or update**: directly edit the responsible project/memory files.
   Evolution remains read-only until its proposal scores at least 80 with no
   hard issue.
7. **Verification and handoff**: run applicable existing checks, re-read the
   changed owners, confirm the next Agent can find current truth, and return a
   short completed, noop, or blocked result grounded in evidence.

### AHO Harness Core Readiness

The Runtime's existing `auditHarness` required-component contract is the
readiness target for AHO Harness mode. It covers the project entry/marker and
the memory-root ECL, handoff, Change, Evolution, template, and verification
owners. The contract is a completeness fact, not a write allowlist, blacklist,
or second permission system. Use the Runtime-provided roots and current audit
facts; do not invent another required-file list.

For `onboard`:

- Missing or partial core readiness is a real Delta and must be completed.
- Project-specific architecture, commands, and knowledge are created only
  when detection and the user's scope justify them.
- Optional evaluation, tracing, metrics, long-term memory, or other advanced
  Harness capabilities are not created unless explicitly requested.
- Empty projects do not require an analysis child or a Planning child merely
  because onboarding is happening. Main Agent owns the separate judgment of
  whether the user's requested implementation needs planning.
- A page or product task must not receive a startup script or third-party
  dependency merely to satisfy Harness onboarding.

Do not infer another mode, widen an assigned Evolution window, create or claim
tasks, update Runtime state, advance watermarks, or close Changes. Do not
invent a second Runtime readiness contract or a generic project-document
layout. Discover project-specific owners from entry guidance, current docs,
Harness records, and verification while satisfying AHO's existing core
readiness fact.

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
