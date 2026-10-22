export interface JarScreenBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export function isPandaCenterInsideJar(point: ScreenPoint, jar: JarScreenBounds): boolean {
  return point.x >= jar.left && point.x <= jar.right
    && point.y >= jar.top && point.y <= jar.bottom;
}
