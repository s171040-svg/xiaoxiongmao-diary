"use strict";

(function exposeRoamingGeometry(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PandaRoaming = api;
})(typeof window !== "undefined" ? window : globalThis, function createRoamingGeometry() {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function projectRoomPoint(point, width, height, fullDesktop) {
    const u = clamp(point.u, 0, 1);
    const v = clamp(point.v, 0, 1);
    if (fullDesktop) {
      return {
        x: 5 + u * 90,
        y: 15 + v * 76,
        scale: 0.62,
        shadowScale: 0.62,
        zIndex: 10 + Math.round(v * 100),
      };
    }
    const halfWidth = 28 + v * 18;
    return {
      x: 50 + (u - 0.5) * 2 * halfWidth,
      y: 14 + v * 62,
      scale: 0.62,
      shadowScale: 0.62 + v * 0.46,
      zIndex: 10 + Math.round(v * 100),
    };
  }

  function actorBounds(point, width, height, fullDesktop) {
    const projected = projectRoomPoint(point, width, height, fullDesktop);
    const centerX = width * projected.x / 100;
    const groundY = height * projected.y / 100;
    return { x: centerX - 36, y: groundY - 96, width: 72, height: 76 };
  }

  function intersectsWithMargin(a, b, margin = 12) {
    return a.x < b.x + b.width + margin
      && a.x + a.width > b.x - margin
      && a.y < b.y + b.height + margin
      && a.y + a.height > b.y - margin;
  }

  function validObstacles(obstacles) {
    return (Array.isArray(obstacles) ? obstacles : []).filter((rect) => rect
      && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
      && rect.width > 0 && rect.height > 0);
  }

  function isPointClear(point, obstacles, width, height, fullDesktop) {
    if (!fullDesktop) return true;
    const bounds = actorBounds(point, width, height, true);
    return !validObstacles(obstacles).some((obstacle) => intersectsWithMargin(bounds, obstacle));
  }

  function segmentIsClear(from, to, obstacles, width, height) {
    for (let index = 1; index <= 18; index += 1) {
      const progress = index / 18;
      const point = {
        u: from.u + (to.u - from.u) * progress,
        v: from.v + (to.v - from.v) * progress,
      };
      if (!isPointClear(point, obstacles, width, height, true)) return false;
    }
    return true;
  }

  function findSafePoint(from, obstacles, width, height, fullDesktop, random = Math.random) {
    if (!fullDesktop) {
      return { u: 0.08 + random() * 0.84, v: 0.08 + random() * 0.84 };
    }
    const blocks = validObstacles(obstacles);
    if (!blocks.length) {
      return { u: 0.02 + random() * 0.96, v: 0.04 + random() * 0.92 };
    }

    if (!isPointClear(from, blocks, width, height, true)) {
      let nearest = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let row = 0; row <= 18; row += 1) {
        for (let column = 0; column <= 24; column += 1) {
          const point = { u: column / 24, v: 0.04 + (row / 18) * 0.92 };
          if (!isPointClear(point, blocks, width, height, true)) continue;
          const distance = (point.u - from.u) ** 2 + (point.v - from.v) ** 2;
          if (distance < nearestDistance) {
            nearest = point;
            nearestDistance = distance;
          }
        }
      }
      return nearest;
    }

    const candidates = [];
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const point = { u: 0.02 + random() * 0.96, v: 0.04 + random() * 0.92 };
      const distance = (point.u - from.u) ** 2 + (point.v - from.v) ** 2;
      if (distance < 0.012
        || !isPointClear(point, blocks, width, height, true)
        || !segmentIsClear(from, point, blocks, width, height)) continue;
      candidates.push(point);
    }

    if (!candidates.length) {
      for (let row = 0; row <= 18; row += 1) {
        for (let column = 0; column <= 24; column += 1) {
          const point = { u: column / 24, v: 0.04 + (row / 18) * 0.92 };
          const distance = (point.u - from.u) ** 2 + (point.v - from.v) ** 2;
          if (distance < 0.012
            || !isPointClear(point, blocks, width, height, true)
            || !segmentIsClear(from, point, blocks, width, height)) continue;
          candidates.push(point);
        }
      }
    }

    if (!candidates.length) return null;
    return candidates[Math.floor(random() * candidates.length)];
  }

  // 把屏幕上的落脚点换算回房间坐标，拖动时用。百分比和 projectRoomPoint 互为逆运算。
  function roomPointFromAnchor(xPercent, yPercent, fullDesktop) {
    if (!fullDesktop) return null;
    return {
      u: clamp((xPercent - 5) / 90, 0, 1),
      v: clamp((yPercent - 15) / 76, 0, 1),
    };
  }

  return {
    projectRoomPoint,
    actorBounds,
    isPointClear,
    isSegmentClear: segmentIsClear,
    findSafePoint,
    roomPointFromAnchor,
  };
});
