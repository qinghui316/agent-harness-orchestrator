# Worked Examples

## Incremental Noop

An assigned Change fixes a one-off typo and adds no durable project fact. Return the assignment identity, one `archive-only` decision, no patches, and `status: "noop"`.

## Closeout Drift Patch

Terminal evidence proves the current STATUS next step is complete. Return one `retire` decision and one patch against the Runtime-provided STATUS target ID and before hash. Do not edit the file.

## Evolution Merge

Three assigned archives repeat the same source-safety lesson already covered by two overlapping rules. Return a `merge` decision and one replacement operation that consolidates those rules. Keep run IDs and incident chronology archive-only.
