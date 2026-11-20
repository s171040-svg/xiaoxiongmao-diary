/* Geometry only: Windows top edges and the taskbar, never lines inside app content. */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PandaDesktopPlatforms = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const halfWidth = 20, petHeight = 40;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  function ground(width, height) {
    return { ownerId: "taskbar", left: Math.min(halfWidth, width / 2),
      right: Math.max(width / 2, width - halfWidth), y: height, sourceX: 0 };
  }
  function platforms(windows, width, height) {
    const valid = (Array.isArray(windows) ? windows : []).filter(w => w && typeof w.id === "string"
      && [w.x, w.y, w.width, w.height, w.z].every(Number.isFinite) && w.width > 0 && w.height > 0);
    const result = [ground(width, height)];
    for (const w of valid) {
      // A maximized window has no visible room above its top for a 40px pet.
      if (w.y < petHeight || w.y >= height) continue;
      let segments = [[Math.max(0, w.x), Math.min(width, w.x + w.width)]];
      for (const front of valid) {
        if (front.id === w.id || front.z >= w.z || front.y > w.y || front.y + front.height <= w.y) continue;
        segments = segments.flatMap(([left, right]) => {
          const a = Math.max(left, front.x), b = Math.min(right, front.x + front.width);
          return a >= b ? [[left, right]] : [[left, a], [b, right]];
        });
      }
      for (const [left, right] of segments) {
        if (right - left >= halfWidth * 2 + 2) result.push({
          ownerId: w.id, left: left + halfWidth, right: right - halfWidth, y: w.y, sourceX: w.x,
        });
      }
    }
    return result;
  }
  const contains = (surface, x) => x >= surface.left - .01 && x <= surface.right + .01;
  function supportAt(point, surfaces) {
    return surfaces.find(s => contains(s, point.x) && Math.abs(s.y - point.y) <= .5) || null;
  }
  function track(point, support, surfaces) {
    if (!support) return { point, support: null };
    const owner = surfaces.find(s => s.ownerId === support.ownerId);
    if (!owner) return { point, support: null };
    const x = point.x + owner.sourceX - support.sourceX;
    const next = surfaces.find(s => s.ownerId === support.ownerId && contains(s, x));
    return next ? { point: { x, y: next.y }, support: next } : { point, support: null };
  }
  function landingBelow(point, surfaces) {
    return surfaces.filter(s => contains(s, point.x) && s.y >= point.y - .5)
      .sort((a, b) => a.y - b.y)[0] || null;
  }
  function fall(point, velocity, seconds, surfaces, immediate = false) {
    const landing = landingBelow(point, surfaces);
    const dt = clamp(seconds, 0, .05), speed = Math.min(600, velocity + 980 * dt);
    const y = point.y + (velocity + speed) / 2 * dt;
    if (landing && (immediate || y >= landing.y)) {
      return { point: { x: point.x, y: landing.y }, velocity: 0, support: landing };
    }
    return { point: { x: point.x, y }, velocity: speed, support: null };
  }
  function walkTarget(point, support, random = Math.random) {
    if (!support || support.right - support.left < 2) return null;
    const distance = 45 + random() * 95;
    let x = clamp(point.x + (random() < .5 ? -distance : distance), support.left, support.right);
    if (Math.abs(x - point.x) < 2) {
      x = clamp(point.x + (x <= support.left + 1 ? distance : -distance), support.left, support.right);
    }
    return Math.abs(x - point.x) < 2 ? null : { x, y: support.y };
  }
  function constrain(point, width, height) {
    const base = ground(width, height);
    return { x: clamp(point.x, base.left, base.right), y: clamp(point.y, Math.min(petHeight, height), height) };
  }
  return { ground, platforms, supportAt, track, landingBelow, fall, walkTarget, constrain };
});
