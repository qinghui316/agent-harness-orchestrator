# Project And Harness Detection

Start from the project's own entry guidance, manifests, source shape, current
handoff, change records, and existing checks. Use the Runtime-provided audit
state as the AHO Harness core fact, then classify the project's semantic
documentation shape separately:

- Missing: the Runtime reports no usable core Harness or the project has no reliable entry.
- Partial: the Runtime reports missing core owners or project guidance has material ownership/navigation/check gaps.
- Ready: the Runtime reports the core Harness ready and the next Agent can locate current truth, execute the lifecycle, and verify work.

Also identify where project memory actually lives. The source root and memory
root may be the same or different. The Runtime's core readiness contract is a
completeness target, not a write permission list. For onboarding, complete any
missing core owners first, then derive project-specific guidance from the
technology, existing conventions, and requested scope. Do not create optional
advanced Harness areas or duplicate conventional documents without evidence.
For audit, repair only gaps that change how an Agent acts.
