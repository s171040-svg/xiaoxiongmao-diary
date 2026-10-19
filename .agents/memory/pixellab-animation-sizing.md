---
name: PixelLab animation sizing and cost
description: PixelLab animation generation can enlarge sprite canvases, changing the actual credit cost.
---

Use the completed job's reported output size and `charged_generations` as the source of truth. Do not estimate animation cost from the input sprite dimensions alone; `animateImage` can expand a small reference sprite before generating frames. For a batch of variants, inspect one completed job before estimating the remaining budget.

**Why:** A 64px panda reference produced 96px frames and was billed at two generations for an eight-frame animation.

**How to apply:** When generating multiple related panda animations, check the first completed result's size and charge before deciding how many more jobs to start.
