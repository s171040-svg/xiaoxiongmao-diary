---
name: PixelLab animation sizing and cost
description: PixelLab animation generation can enlarge sprite canvases, changing the actual credit cost.
---

Use the completed job's reported output size and `charged_generations` as the source of truth. Do not estimate animation cost from the input sprite dimensions alone; `animateImage` can expand a small reference sprite before generating frames. For a batch of variants, inspect one completed job before estimating the remaining budget.

**Why:** A 64px panda reference produced 96px frames and was billed at two generations for an eight-frame animation.

**How to apply:** When generating multiple related panda animations, check the first completed result's size and charge before deciding how many more jobs to start.

For limb-focused animations, start with a pose in which each intended moving limb is individually readable and separated from the torso. If a curled source hides the paws, correct the static pose before spending more on motion prompts.

**Why:** A curled back-facing panda source produced almost only tail movement despite explicit four-limb instructions; a source with separated paws produced visible arm and leg articulation.

**How to apply:** Inspect the source silhouette and the complete generated frame sequence, not just the prompt or first returned preview. Keep unsuccessful generations out of the application.
