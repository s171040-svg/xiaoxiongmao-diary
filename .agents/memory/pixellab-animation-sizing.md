---
name: PixelLab animation sizing and cost
description: PixelLab animation generation can enlarge sprite canvases, changing the actual credit cost.
---

Use the completed job's reported output size and `charged_generations` as the source of truth. Do not estimate animation cost from the input sprite dimensions alone; `animateImage` can expand a small reference sprite before generating frames. For a batch of variants, inspect one completed job before estimating the remaining budget.

Keep submitted generation jobs below the live concurrency limit; the workspace has returned `8/8 jobs` and rejected further submissions. A rejected request without a job id is not a queued job.

**Why:** Submitting an entire animation batch at once can leave later poses ungenerated while earlier ones succeed.

**How to apply:** Track successful job ids and generation receipts, wait for capacity before retrying only rejected items, and keep the user's batch budget separate from older design experiments.

**Why:** A 64px panda reference produced 96px frames and was billed at two generations for an eight-frame animation.

**How to apply:** When generating multiple related panda animations, check the first completed result's size and charge before deciding how many more jobs to start.

For limb-focused animations, start with a pose in which each intended moving limb is individually readable and separated from the torso. If a curled source hides the paws, correct the static pose before spending more on motion prompts.

**Why:** A curled back-facing panda source produced almost only tail movement despite explicit four-limb instructions; a source with separated paws produced visible arm and leg articulation.

**How to apply:** Inspect the source silhouette and the complete generated frame sequence, not just the prompt or first returned preview. Keep unsuccessful generations out of the application.

For complex rolls, constrain an intermediate back-facing or belly-up body pose and generate the two pose transitions separately. Keep lateral travel separate from the pose generation.

**Why:** A wide-canvas start/end request produced walking followed by a head tilt instead of a torso-led roll. A constrained belly-up middle pose made the torso visibly turn before the head followed.

**How to apply:** Review every intermediate pose for a connected neck and actual trunk rotation; stage translation can move the character horizontally but must not substitute for redrawn rolling poses.
