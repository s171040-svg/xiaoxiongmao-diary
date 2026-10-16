"use strict";

module.exports = function createTrayIcon(nativeImage) {
  const size = 32;
  const bitmap = Buffer.alloc(size * size * 4);
  function circle(cx, cy, radius, rgb) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) continue;
      const offset = (y * size + x) * 4;
      bitmap[offset] = rgb[2]; bitmap[offset + 1] = rgb[1];
      bitmap[offset + 2] = rgb[0]; bitmap[offset + 3] = 255;
    }
  }
  circle(7, 7, 6, [35, 52, 42]);
  circle(25, 7, 6, [35, 52, 42]);
  circle(16, 18, 13, [244, 244, 230]);
  circle(10, 16, 4, [35, 52, 42]);
  circle(22, 16, 4, [35, 52, 42]);
  circle(10, 15, 1, [244, 244, 230]);
  circle(22, 15, 1, [244, 244, 230]);
  circle(16, 24, 2, [35, 52, 42]);
  return nativeImage.createFromBitmap(bitmap, { width: size, height: size }).resize({ width: 18, height: 18 });
};
