# Workflow Patterns

Design the dependency graph before writing node prompts. These patterns define
proposal topology only; they do not start or authorize execution.

## Sequential V1

Use `sequential-v1` for one-node work, overlapping source scopes, dependent
changes, shared-state migrations, or any case where concurrency safety is not
proved.

- Give the first node `dependsOn: []`.
- Make each later node depend on the preceding node when strict order is
  required.
- Prefer one coherent node over artificial fragmentation.

## Ready-Set V1

Use `ready-set-v1` only when the accepted work has multiple useful nodes and
the graph can expose independent readiness safely.

- Root nodes use `dependsOn: []`.
- Downstream nodes list every prerequisite node id.
- Independent writable nodes must have non-overlapping `sourceScopes`.
- Shared integration or verification work depends on all nodes whose results it
  consumes.
- Readiness is graph structure, not permission and not whole-wave dispatch.
  Runtime revalidation and current execution gates still select one concrete
  action at a time.

## Node Design

Each node should map a coherent task slice to its acceptance evidence:

- `title`: short user-readable outcome.
- `taskIds` and `acIds`: complete traceability, without invented ids.
- `prompt`: objective, bounded context, constraints, expected return, and
  verification. Exclude orchestration internals and gate decisions.
- `sourceScopes`: the smallest credible ownership boundary. Split nodes only
  when scopes and dependencies make the split real.

Do not model pipelines, barriers, loops, nested workflows, worker pools, slot
allocation, or automatic wave execution. If the demand requires those
semantics, add a warning and keep the proposal within the two supported modes.
