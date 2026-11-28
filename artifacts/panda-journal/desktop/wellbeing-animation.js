(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PandaWellbeingAnimation = api;
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";
  const frameMs = 100;
  const enterCount = 9, loopCount = 9, loops = 3;
  const duration = (enterCount * 2 + loopCount * loops) * frameMs;
  const base = "../public/static/panda/desktop-celebrate/";
  function sourceAt(elapsed, reduced = false) {
    if (elapsed < 0 || elapsed >= duration) return null;
    if (reduced) return `${base}pose.png`;
    const frame = Math.floor(elapsed / frameMs);
    if (frame < enterCount) return `${base}enter-${frame}.png`;
    if (frame < enterCount + loopCount * loops) return `${base}loop-${(frame - enterCount) % loopCount}.png`;
    return `${base}enter-${enterCount - 1 - (frame - enterCount - loopCount * loops)}.png`;
  }
  function draw(context, elapsed, reduced = false) {
    context.clearRect(0, 0, 160, 120);
    if (reduced) return;
    const colors = ["#ffd96b", "#ffa688", "#a4d9b0"];
    // Small staggered pixel bursts, not a flashing screen-sized overlay.
    for (let burst = 0; burst < 3; burst++) {
      const age = elapsed - 1000 - burst * 720;
      if (age < 0 || age > 1600) continue;
      const originX = 32 + burst * 48;
      const originY = burst === 1 ? 22 : 42;
      context.fillStyle = colors[burst];
      if (age < 260) {
        context.fillRect(originX, Math.round(100 - (100 - originY) * age / 260), 2, 4);
      } else {
        const t = (age - 260) / 1340;
        context.globalAlpha = 1 - t;
        for (let ray = 0; ray < 10; ray++) {
          const angle = ray * Math.PI / 5;
          const radius = 5 + t * 20;
          context.fillRect(Math.round(originX + Math.cos(angle) * radius),
            Math.round(originY + Math.sin(angle) * radius + t * t * 12), 2, 2);
        }
        context.globalAlpha = 1;
      }
    }
  }
  return { sourceAt, draw, duration };
});
