# Evolution Window

Use exactly the E1 window, source snapshot, candidate root, and proposal identity supplied by Runtime.
Default to focused changes in Agent-owned rules, workflows, templates, checks, helpers, routes, or
entry guidance. Use a full refresh only when stable project knowledge actually changed.

Write the proposal and candidate in isolation. The separate `evolution-candidate-judge` binds the
candidate content fingerprint and source snapshot digest, applies the fixed weighted rubric, and may
keep only a live score of at least 80 with no hard issue. A full-bundle review is not an Evolution
Judge and cannot be reused as one.

After a passing Judge, call the Runtime publish tool. Runtime revalidates ownership, fingerprints,
source snapshot, dynamic state, and writer lock before atomically publishing or rolling back. Never
edit the canonical project Skill before that commit point.
