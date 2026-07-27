# Agent Office Baked Shadow Sources

These are the user-approved Image 2 edit outputs, locally extracted neutral-black
alpha maps, and final original-furniture-over-shadow proofs used by production.
The production preparer consumes only each `shadow-extracted.png`.

## Common Image 2 Edit Prompt

```text
Use case: lighting-weather
Asset type: Agent Office pre-baked static shadow source
Primary request: Add only a soft directional contact and cast shadow to the fixed furniture shown in the input.
Lighting/mood: one global upper-left light with the shadow cast toward the lower right.
Constraints: keep the input canvas, furniture, perspective, size, position, scale, and layer geometry unchanged; do not move, redraw, remove, recolor, resize, or duplicate any furniture; add no background, floor texture, reflection, new object, text, or watermark.
Avoid: oval placeholder shadows, shadows in another direction, duplicated furniture edges, white halos, and baked Agent silhouettes.
```

The treadmill prompt additionally requested a shorter cast because the facility is
lower than a workstation. Candidate selection and extraction thresholds are
recorded in each `extraction-report.json`.

## Production Method

1. Image 2 edited the calibrated furniture composite once.
2. Local before/after luminance difference and the original furniture alpha mask
   produced `shadow-extracted.png`.
3. Original furniture was composited above the shadow at `0.55` proof opacity;
   the selected extraction result is `layered-proof.png`. Production uses `0.42`
   after the user requested a lighter Office presentation.
4. The explicit `import-shadows` authoring command uses
   `scripts/office-assets/imports/baked-shadow-import.mjs` to reverse the proof
   transform, crop with transparent padding, and emit approved 2x neutral-black
   alpha sources. It never asks Image 2 to remove furniture and is not part of
   the production pack path.

The proof `shift` values are immutable canvas-composition evidence. Runtime
placement belongs only to the Office calibration document's ordinary static
component `localPosition`; the import tool does not read or adjust runtime
calibration. Furniture, facility origins, and routes are never moved to fit a
shadow.
