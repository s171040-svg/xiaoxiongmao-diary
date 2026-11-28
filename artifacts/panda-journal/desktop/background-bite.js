/* Transient pixel art, drawn locally from one sampled RGB color. */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PandaBackgroundBite = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const duration = 1760;
  const crouchedAt = 408, biteAt = 620, riseAt = 1284, step = 68;
  const base = "../public/static/panda";
  const crouch = Array.from({ length: 7 }, (_, i) => ({
    source: `${base}/transitions/pixellab-walk-to-sleep-${i + 1}.png`,
    nativeLeft: i >= 4,
  }));
  const jaws = Array.from({ length: 3 }, (_, i) => ({
    source: `${base}/desktop-bite/jaw-${i + 1}.png`, nativeLeft: true,
  }));
  const spriteSources = [...crouch, ...jaws].map(frame => frame.source);
  const validColor = color => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color);
  const nextAt = (now, random = Math.random, first = false) =>
    now + (first ? 18000 + random() * 14000 : 38000 + random() * 35000);
  const canStart = (state, walking, interacting, reduced, manual = false) =>
    state.identityStatus === "offline-trial" && state.identityReady && state.mode === "desktop"
    && !interacting && !reduced
    && (manual || (state.backgroundBite === true && !state.quietMode && !state.restPose && !state.paused && walking));
  function frameAt(elapsed, stayLow = false) {
    if (elapsed < crouchedAt && !stayLow) return crouch[Math.max(0, Math.floor(elapsed / step))];
    if (elapsed < 500) return crouch[6];
    if (elapsed < 565) return jaws[0]; // Snout reaches forward.
    if (elapsed < biteAt) return jaws[1]; // Mouth opens against the ledge.
    if (elapsed < 710) return jaws[2]; // Bite closes on the first trail of crumbs.
    if (elapsed < 815) return jaws[0];
    if (elapsed < 922) return jaws[2];
    if (elapsed < riseAt || stayLow) return crouch[6];
    return crouch[Math.max(0, 5 - Math.floor((elapsed - riseAt) / step))];
  }
  function tint(color, toward, amount) {
    return "#" + [1, 3, 5].map(offset => Math.round(parseInt(color.slice(offset, offset + 2), 16) * (1 - amount)
      + toward * amount).toString(16).padStart(2, "0")).join("");
  }
  function draw(ctx, { color, left }, elapsed) {
    ctx.clearRect(0, 0, 64, 36);
    if (!validColor(color) || elapsed < crouchedAt || elapsed >= duration) return;
    const dir = left ? -1 : 1;
    const x = 32 + dir * 6;
    const base = 32;
    const shadow = tint(color, 0, .53), rim = tint(color, 255, .4);
    const time = elapsed < biteAt ? elapsed : biteAt + Math.floor((elapsed - biteAt) / 45) * 45;
    function rect(dx, dy, width, height, fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(x + (left ? -dx - width : dx), base + dy, width, height);
    }
    ctx.save();
    if (time < biteAt) {
      // The muzzle comes to the actual ledge first; no floating snack.
      ctx.globalAlpha = Math.min(.85, (time - crouchedAt) / 160);
      rect(-2, -1, 5, 1, rim); rect(-1, 0, 3, 1, color);
    } else {
      const age = time - biteAt;
      ctx.globalAlpha = Math.min(1, (duration - time) / 440);
      // Negative space with a stair-stepped, three-tooth edge.
      for (const [dx, dy, width] of [[-5, -2, 2], [-1, -3, 2], [3, -2, 2],
        [-5, -1, 10], [-4, 0, 8], [-3, 1, 6], [-2, 2, 4]]) {
        rect(dx, dy, width, 1, shadow);
      }
      rect(-3, 1, 1, 1, rim); rect(-2, 2, 4, 1, rim); rect(2, 1, 2, 1, color);
      if (age < 730) {
        const p = age / 730;
        // The large chunk arcs toward the mouth; the crumbs fan outward.
        rect(Math.round(-3 * p) - 2, Math.round(-1 - 4 * Math.sin(p * Math.PI / 2)), p < .48 ? 4 : 2, p < .48 ? 3 : 2, color);
        rect(Math.round(p * 8) + 2, Math.round(-1 - 10 * p + 6 * p * p), 2, 2, color);
        rect(Math.round(p * -3) + 2, Math.round(-5 - 10 * p), 1, 1, rim);
        rect(Math.round(p * 7) + 4, Math.round(-1 - 5 * p + 7 * p * p), 1, 1, color);
      }
    }
    ctx.restore();
  }
  return { duration, biteAt, nextAt, canStart, validColor, frameAt, spriteSources, draw };
});
