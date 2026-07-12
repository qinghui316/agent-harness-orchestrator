# Worked Examples

## Closeout No-op

Runtime assigns `maintain-assigned-closeout` for a terminal Change that fixes one typo. Read the assigned Change and current memory, find no durable delta, leave canonical Markdown unchanged, run the assigned check if required, and return `noop` with the evidence references.

## Edit A Stale Handoff

Terminal evidence proves a status document's next step is complete. Open that canonical Markdown file, remove the stale statement, add the current next step only when evidence supports it, re-read the document, run the assigned documentation check, and return `ready`.

## Create And Rename On Onboarding

Runtime assigns `onboard` with a writable documentation namespace. Existing evidence has no development guide, while a generic `NOTES.md` contains verified commands. Create `docs/DEVELOPMENT.md`, move the durable command guidance into it, rename or delete `NOTES.md` only when all retained content has a proper owner, fix links, and verify the final Markdown tree.

## Split An Overloaded Guide

An assigned evolution window repeatedly shows that one large guide mixes lifecycle rules with architecture ownership. Propose the split, obtain a native scorer result of at least 80, then create the missing owner document, move the evidence-backed ownership guidance there, update links, and remove duplicated text.

## Merge Duplicate Guidance

Two current Markdown files state overlapping source-safety rules and assigned evidence confirms one canonical owner. Merge the strongest current rule into that owner, update references, and delete the redundant file only if no unique content remains. Keep incident IDs and chronology in archives.

## Block An Out-of-Scope Request

Evidence suggests changing a TypeScript policy file outside the assignment. Do not touch the file or invoke a lifecycle action. Return `blocked` with the relevant evidence and request Runtime routing.
