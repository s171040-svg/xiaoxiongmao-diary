"use strict";
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PandaDesktopPet = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const motions = new Set(["idle", "walk", "sleep", "grab"]);
  function sprite(character, motion, frame, manifest) {
    if (!["panda", "xiaobai"].includes(character) || !motions.has(motion)) {
      throw new Error("Unknown desktop character or motion");
    }
    if (character === "xiaobai") {
      if (motion === "grab") return "../public/static/xiaobai/grab.png?v=xiaobai-scruff-cute-3";
      const count = motion === "walk" ? 8 : 4;
      return `../public/static/xiaobai/loops/${motion}/${1 + frame % count}.png`;
    }
    if (motion === "grab") return "../public/static/panda/grab.png";
    const count = manifest.frameCountBySprite?.[motion] ?? manifest.frameCount;
    return frame === 0 ? `../public/static/panda/${motion}.png`
      : `../public/static/panda/frames/${motion}-${1 + (frame - 1) % count}.png`;
  }
  function bounds(width, height) {
    return { left: Math.min(42, width / 2), right: Math.max(width / 2, width - 42),
      top: Math.min(86, height / 2), bottom: Math.max(height / 2, height - 18) };
  }
  function constrain(point, width, height) {
    const b = bounds(width, height);
    return { x: clamp(point.x, b.left, b.right), y: clamp(point.y, b.top, b.bottom) };
  }
  function advance(from, to, elapsedSeconds, character) {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const step = Math.min(distance, Math.max(0, Math.min(elapsedSeconds, .05)) * (character === "xiaobai" ? 25.5 : 30));
    return distance < .5 ? { point: { ...to }, arrived: true }
      : { point: { x: from.x + (to.x - from.x) / distance * step,
        y: from.y + (to.y - from.y) / distance * step }, arrived: step === distance };
  }
  function target(from, width, height, random = Math.random) {
    for (let i = 0; i < 35; i++) {
      const direction = random() * Math.PI * 2, distance = 50 + random() * 140;
      const candidate = constrain({ x: from.x + Math.cos(direction) * distance,
        y: from.y + Math.sin(direction) * distance * .5 }, width, height);
      if (Math.hypot(candidate.x - from.x, candidate.y - from.y) >= 20) return candidate;
    }
    return null; // Extremely small areas may have no room for a 20px step.
  }
  function transition(character, from, to) {
    const framesFor = motion => {
      if (character === "xiaobai" && ["sleep", "grab"].includes(motion)) {
        return Array.from({ length: 6 }, (_, i) =>
          `../public/static/xiaobai/transitions/to-${motion}/${i + 1}.png${motion === "grab" ? "?v=xiaobai-scruff-cute-3" : ""}`);
      }
      if (character === "panda" && motion === "sleep") return Array.from({ length: 7 }, (_, i) =>
        `../public/static/panda/transitions/pixellab-walk-to-sleep-${i + 1}.png`);
      return [];
    };
    if (from === to) return [];
    return [...framesFor(from).reverse(), ...framesFor(to)];
  }
  return { sprite, bounds, constrain, advance, target, transition };
});
