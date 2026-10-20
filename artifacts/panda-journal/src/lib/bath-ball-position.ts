export type BathTubRect = Pick<DOMRect, 'left' | 'right' | 'top' | 'width' | 'height'>;

const BALL_SIZE = 40;
const TUB_GAP = 4;
const EDGE_GAP = 8;

/** Put the ball just outside the tub and align its center with the tub feet. */
export function getBathBallSpawnPosition(
  tub: BathTubRect,
  viewport: { width: number; height: number },
) {
  const left = tub.left - BALL_SIZE - TUB_GAP;
  const right = tub.right + TUB_GAP;
  const canPlaceLeft = left >= EDGE_GAP;
  const canPlaceRight = right + BALL_SIZE <= viewport.width - EDGE_GAP;
  const desiredX = canPlaceLeft || !canPlaceRight ? left : right;
  const maxX = Math.max(EDGE_GAP, viewport.width - BALL_SIZE - EDGE_GAP);
  const maxY = Math.max(EDGE_GAP, viewport.height - BALL_SIZE - EDGE_GAP);
  return {
    x: Math.min(maxX, Math.max(EDGE_GAP, desiredX)),
    y: Math.min(maxY, Math.max(EDGE_GAP, tub.top + tub.height * (80.5 / 96) - BALL_SIZE / 2)),
  };
}
