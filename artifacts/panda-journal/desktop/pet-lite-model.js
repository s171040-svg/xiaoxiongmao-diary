"use strict";
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PandaDesktopPet = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const motions = new Set(["idle", "walk", "sleep", "grab", "lying", "stare"]);
  const quietMotions = ["lying", "stare", "sleep"];
  const shakeFrameCount = 17, shakeFrameIntervalMs = 85;
  const firstShakeDelayMinMs = 45000, firstShakeDelayRangeMs = 45000;
  function punchFrame(elapsed, manifest, reduced = false) {
    const config = manifest.punch;
    if (!config || elapsed < 0 || elapsed >= (reduced ? config.reducedDurationMs : config.frameCount * config.frameIntervalMs)) return null;
    return reduced ? config.impactFrame : Math.min(config.frameCount - 1, Math.floor(elapsed / config.frameIntervalMs));
  }
  function quietRest(previous, now, random = Math.random) {
    const choices = quietMotions.filter(value => value !== previous);
    return { motion: choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))],
      until: now + 300000 + Math.floor(random() * 300000) };
  }
  function dirtyReturn(now, random = Math.random) {
    return { remainingShakes: 3,
      nextShakeAt: now + firstShakeDelayMinMs + Math.floor(random() * firstShakeDelayRangeMs) };
  }
  function shakeFrame(elapsed, reduced = false) {
    if (reduced) return null;
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= shakeFrameCount * shakeFrameIntervalMs) return null;
    return Math.floor(elapsed / shakeFrameIntervalMs);
  }
  function finishShake(state, now, random = Math.random) {
    if (!state || state.remainingShakes <= 1) return { remainingShakes: 0, nextShakeAt: 0 };
    return { remainingShakes: state.remainingShakes - 1,
      nextShakeAt: now + firstShakeDelayMinMs + Math.floor(random() * firstShakeDelayRangeMs) };
  }
  function lostWorldFall(startY, landedY, minimumDrop = 220) {
    return Number.isFinite(startY) && Number.isFinite(landedY) && landedY - startY >= minimumDrop;
  }
  function spriteTop(source) {
    // The existing prone art has transparent space below its feet. Preserve its
    // scale but align each actual pose (including transitions) to the platform.
    // The older sleep loop is 80px, not 96px; its feet end at row 64.
    if (/\/panda\/(?:sleep\.png|frames\/sleep-\d+\.png)/.test(source)) return (80 - 64) * 40 / 80;
    const bottom = source.includes("/panda/peeking.png") ? 74
      : source.includes("pixellab-walk-to-peeking-")
        ? [86, 80, 75, 73, 72][Number(source.match(/peeking-(\d+)/)[1]) - 1]
        : source.includes("pixellab-walk-to-sleep-")
          ? [88, 88, 85, 80, 80, 80, 80][Number(source.match(/sleep-(\d+)/)[1]) - 1] : 88;
    return (96 - bottom) * 40 / 96;
  }
  function sprite(character, motion, frame, manifest) {
    if (!["panda", "xiaobai"].includes(character) || !motions.has(motion)) {
      throw new Error("Unknown desktop character or motion");
    }
    if (character === "xiaobai") {
      if (motion === "grab") return "../public/static/xiaobai/grab.png?v=xiaobai-scruff-cute-3";
      if (motion === "stare") return "../public/static/xiaobai/transitions/to-idle/6.png";
      const count = motion === "walk" ? 8 : 4;
      return `../public/static/xiaobai/loops/${motion}/${1 + frame % count}.png`;
    }
    if (motion === "grab") return "../public/static/panda/grab.png";
    if (motion === "lying") return "../public/static/panda/peeking.png";
    if (motion === "stare") return "../public/static/panda/transitions/pixellab-walk-to-idle-5.png";
    const count = manifest.frameCountBySprite?.[motion] ?? manifest.frameCount;
    return frame === 0 ? `../public/static/panda/${motion}.png`
      : `../public/static/panda/frames/${motion}-${1 + (frame - 1) % count}.png`;
  }
  function advance(from, to, elapsedSeconds, character) {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const step = Math.min(distance, Math.max(0, Math.min(elapsedSeconds, .05)) * (character === "xiaobai" ? 25.5 : 30));
    return distance < .5 ? { point: { ...to }, arrived: true }
      : { point: { x: from.x + (to.x - from.x) / distance * step,
        y: from.y + (to.y - from.y) / distance * step }, arrived: step === distance };
  }
  function transition(character, from, to) {
    const framesFor = motion => {
      if (character === "xiaobai" && ["sleep", "grab", "lying", "stare"].includes(motion)) {
        return Array.from({ length: 6 }, (_, i) =>
          `../public/static/xiaobai/transitions/to-${motion === "stare" ? "idle" : motion}/${i + 1}.png${motion === "grab" ? "?v=xiaobai-scruff-cute-3" : ""}`);
      }
      if (character === "panda" && ["lying", "stare"].includes(motion)) return Array.from({ length: 5 }, (_, i) =>
        `../public/static/panda/transitions/pixellab-walk-to-${motion === "lying" ? "peeking" : "idle"}-${i + 1}.png`);
      if (character === "panda" && motion === "sleep") return Array.from({ length: 7 }, (_, i) =>
        `../public/static/panda/transitions/pixellab-walk-to-sleep-${i + 1}.png`);
      return [];
    };
    if (from === to) return [];
    return [...framesFor(from).reverse(), ...framesFor(to)];
  }
  return { sprite, spriteTop, advance, transition, quietRest, punchFrame,
    dirtyReturn, shakeFrame, finishShake, lostWorldFall, shakeFrameCount, shakeFrameIntervalMs };
});
