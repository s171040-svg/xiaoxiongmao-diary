export interface BathSceneRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Align the base of the face above the water, independent of pet/tub size ratio. */
export function bathPetAnchor(tub: BathSceneRect, trackHeight: number) {
  return {
    x: tub.left + tub.width / 2,
    y: tub.top + tub.height * 46 / 96 + trackHeight * 0.34,
  };
}

// Front edge of the water opening in the existing 128×96 bathtub sprite.
// Mask the pet below this contour, revealing the tub's original front rim/wall.
const WATER_FRONT_EDGE = [
  [10, 38], [16, 41], [23, 43], [31, 45], [39, 46],
  [89, 46], [97, 45], [105, 43], [112, 41], [117, 38],
] as const;

export function bathPetClipPath(track: BathSceneRect, tub: BathSceneRect): string | null {
  const values = [track.left, track.top, track.width, track.height,
    tub.left, tub.top, tub.width, tub.height];
  if (!values.every(Number.isFinite) || track.width <= 0 || track.height <= 0
    || tub.width <= 0 || tub.height <= 0) return null;
  const x = (pixel: number) => tub.left + tub.width * pixel / 128 - track.left;
  const y = (pixel: number) => tub.top + tub.height * pixel / 96 - track.top;
  const top = Math.min(-track.height, tub.top - track.top - track.height);
  const points = [
    [x(0), top],
    [x(128), top],
    ...[...WATER_FRONT_EDGE].reverse().map(([px, py]) => [x(px), y(py)]),
  ];
  return `polygon(${points.map(([px, py]) => `${px.toFixed(3)}px ${py.toFixed(3)}px`).join(', ')})`;
}
