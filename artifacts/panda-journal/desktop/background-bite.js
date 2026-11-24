/* Transient pixel art, drawn locally from one sampled RGB color. */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PandaBackgroundBite = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const duration = 1650;
  const biteAt = 300;
  const frames = [7, 6, 5, 4, 5, 6, 5, 6, 7, 7];
  const validColor = color => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color);
  const nextAt = (now, random = Math.random, first = false) =>
    now + (first ? 18000 + random() * 14000 : 38000 + random() * 35000);
  const canStart = (state, walking, interacting, reduced) =>
    state.identityStatus === "offline-trial" && state.backgroundBite === true && state.identityReady
    && state.mode === "desktop" && !state.quietMode && !state.restPose && !state.paused
    && walking && !interacting && !reduced;
  function spriteAt(elapsed) {
    return `../public/static/panda/frames/eat-bamboo-${frames[Math.min(frames.length - 1, Math.max(0, Math.floor(elapsed / 125)))]}.png`;
  }
  function tint(color, toward, amount) {
    return "#" + [1, 3, 5].map(offset => Math.round(parseInt(color.slice(offset, offset + 2), 16) * (1 - amount)
      + toward * amount).toString(16).padStart(2, "0")).join("");
  }
  function draw(ctx, { color, left }, elapsed) {
    ctx.clearRect(0, 0, 64, 36);
    if (!validColor(color) || elapsed >= duration) return;
    const dir = left ? -1 : 1;
    const x = 32 + dir * 9;
    const base = 32;
    const shadow = tint(color, 0, .53), rim = tint(color, 255, .4);
    const time = Math.floor(elapsed / 45) * 45;
    function rect(dx, dy, width, height, fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(x + (left ? -dx - width : dx), base + dy, width, height);
    }
    ctx.save();
    if (time < biteAt) {
      ctx.globalAlpha = Math.min(.88, time / 170);
      rect(-4, -3, 9, 4, color); rect(-2, -5, 5, 2, color);
      rect(-2, -5, 3, 1, rim); rect(0, 1, 4, 1, shadow);
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
        rect(Math.round(-6 * p) - 2, Math.round(-3 - 7 * Math.sin(p * Math.PI / 2)), p < .48 ? 4 : 2, p < .48 ? 3 : 2, color);
        rect(Math.round(p * 8) + 2, Math.round(-1 - 10 * p + 6 * p * p), 2, 2, color);
        rect(Math.round(p * -3) + 2, Math.round(-5 - 10 * p), 1, 1, rim);
        rect(Math.round(p * 7) + 4, Math.round(-1 - 5 * p + 7 * p * p), 1, 1, color);
      }
    }
    ctx.restore();
  }
  return { duration, nextAt, canStart, validColor, spriteAt, draw };
});
