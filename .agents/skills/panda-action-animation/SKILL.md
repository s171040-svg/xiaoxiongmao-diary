---
name: panda-action-animation
description: Adds or revises a 小熊猫 pose, action, or animation in this project. Use when a request introduces a new panda movement, expression, state, or PixelLab animation and needs it connected to the room and its developer action detector.
---

# 小熊猫动作与动画流程

Use this workflow when changing a panda action, pose, or state. Treat art generation and code integration as separate steps: a generated animation is not complete until the requested app surface can play and test it.

## 1. Scope the requested change

- Identify whether the request is for a repeating movement, a one-shot action, a held pose, or a special event. Preserve that distinction in both code and the action detector.
- Follow the surface named by the user. The web room and Electron desktop pet use separate renderers; do not change both unless asked.
- Read the current action types, asset manifest, renderer, and relevant project memory before editing. Do not infer asset names or animation states from an old conversation.
- Keep the established red-brown panda identity, silhouette, pixel scale, facing, and ground alignment. A reference may change the requested pose, not silently replace the character or shrink it.
- Preserve unrelated movement, chat, drag, bath, and desktop behavior. Do not re-enable disabled actions (currently including random rolling) unless the user asks.

## 2. Plan the art before generating

- Prefer the current confirmed panda sprite or the user's attached reference as the source. For a pose edit, change only the requested pose details; retain transparent background and the same canvas and display scale where possible.
- Describe motion, not a new environment. Keep the panda's body proportions, outline, palette, shadow/ground contact, and facing consistent with existing frames.
- Use the connected PixelLab workspace tools following `.local/mcp_skills/pixellab_workspace/SKILL.md`. Prefer an economical supported mode for a first attempt. If a Pro operation requires a cost confirmation, report the quoted cost and wait for explicit approval before submitting it. Prior approval for another action is not blanket approval for unlimited generation.
- If the user asks to see a preview or approve the image first, present the preview and stop before replacing project assets. Otherwise continue through integration and verification.

## 3. Make state transitions visibly continuous

- Every new state transition must have at least five distinct, genuine in-between pixel frames, not five copies of an endpoint and not only a CSS scale/fade.
- Generate or construct entering and exiting transitions as needed. The first and last frames must align with the actual source and destination poses; keep canvas dimensions, character scale, facing, and foot/ground baseline stable.
- For PixelLab animation tools that support start and end frames, use both to constrain the transition. Request enough frames to leave at least five usable intermediate poses after accounting for any retained reference frame. Verify the actual returned frame count; do not assume the requested count equals the number of generated frames.
- If the selected tool cannot produce a reliable transition between the specific poses, do not fake compliance with duplicate frames. Use another supported path or explain the limitation and ask before substituting a different visual approach.
- Avoid combining actions the user has separated, such as rolling and lying belly-up. A static pose should remain static; an action loop should not be registered as a pose.

## 4. Integrate the action end to end

For the web room, check and update only the parts needed for this action:

- `artifacts/panda-journal/public/static/panda/` — image assets or frame sequences.
- `artifacts/panda-journal/src/lib/panda-animation-manifest.json` — frame counts, timing, and sprite mappings where used.
- `artifacts/panda-journal/src/lib/companion-types.ts` — action, pose, or event type when a new identifier is needed.
- `artifacts/panda-journal/src/components/PetStage.tsx` and `PetStage.css` — rendering, state selection, transitions, and visual presentation.
- `artifacts/panda-journal/src/hooks/use-companion.ts` — action execution, timing, and return to the normal roaming state.
- `artifacts/panda-journal/src/components/CompanionChat.tsx` — add the matching developer detector option in the correct dynamic-action, static-pose, or special-event section.

Do not update every file by default. Trace the existing route for the nearest similar action and follow its conventions.

The developer detector is a required part of every newly added web-room action or pose. Its option must trigger the real new state, use a clear label, respect the existing countdown and busy-state rules, and return to the normal state when its duration ends. Do not add a detector entry that only changes a label or displays an unrelated sprite.

If the user explicitly requests the Electron desktop pet too, inspect its separate renderer and packaging path (including `desktop/pet-renderer.js`, its asset/manifest loading, and `desktop/package-win.cjs`). Ensure the new sprite assets and manifest are included in the packaged app; a web-room change alone does not update the desktop pet.

## 5. Verify before reporting completion

- Inspect the full animation sequence at its intended pixelated display size. Check identity, consistent scale, clean transparency, no clipped tail/ears/feet, stable ground baseline, and smooth entry/exit.
- Confirm the action detector lists the new item in the correct section and that its handler reaches the new state, then automatically restores the intended normal state.
- Check that existing chat, movement, orientation, and unrelated actions were not changed as collateral.
- Run the relevant project typecheck and targeted tests; inspect the web preview for web changes. If Electron is in scope, also verify its renderer and packaged resource list separately.
- Report the visible behavior, changed files in plain language, and any unverified surface. Do not claim a desktop build or Windows install was verified when only the web room was checked.
