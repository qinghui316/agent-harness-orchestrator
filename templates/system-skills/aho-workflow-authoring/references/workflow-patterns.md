# Workflow Patterns

Design the dependency graph from task facts before writing node prompts. These
patterns are a palette, not a checklist or a template to transplant.

| Task shape | Choose |
| --- | --- |
| One coherent result | One-node `sequential-v1` |
| A later result consumes an earlier result | Multi-node `sequential-v1` |
| Writable source scopes overlap | `sequential-v1` |
| Multiple useful results are independently verifiable and scopes do not overlap | `ready-set-v1` |
| Concurrency safety is uncertain | `sequential-v1` |

## Sequential V1

Use sequential mode for one-node work, dependent changes, shared-state changes,
or overlapping scopes. Root nodes use `dependsOn: []`; later nodes list their
real prerequisites. Prefer one coherent node over artificial fragmentation.

## Ready-Set V1

Use ready-set only when multiple useful business outcomes can be completed and
verified independently. Root nodes use `dependsOn: []`; downstream nodes list
all prerequisites. Writable independent nodes must have non-overlapping scopes.

Ready-set exposes readiness. It does not authorize whole-wave dispatch: Runtime
still revalidates and exposes one current concrete action at a time.

## Common Mistakes

- Splitting nodes because files differ while behavior remains coupled.
- Creating separate business nodes for tests, validation, audit, or rework by default.
- Adding dependencies only to force a preferred order.
- Using broad scopes to make an unsupported parallel plan appear safe.
- Copying the worked example's node count, names, or scopes into another domain.
- Writing generic prompts that require the leaf to rediscover the accepted task.
