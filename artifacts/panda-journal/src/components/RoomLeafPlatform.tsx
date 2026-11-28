import { leafPlatformRect, type LeafPlatformActivity } from '@/lib/room-leaf-platform';
import { ROOM_IMAGE_HEIGHT, ROOM_IMAGE_WIDTH } from '@/lib/room-plane';
import './RoomLeafPlatform.css';

export function RoomLeafPlatform({ width, height, activity, dragging }: {
  width: number; height: number; activity: LeafPlatformActivity | null; dragging: boolean;
}) {
  const rect = leafPlatformRect(width, height);
  const scale = Math.min(width / ROOM_IMAGE_WIDTH, height / ROOM_IMAGE_HEIGHT);
  const left = (width - ROOM_IMAGE_WIDTH * scale) / 2;
  const top = (height - ROOM_IMAGE_HEIGHT * scale) / 2;
  return <>
    <div className="rlp-drop-zone" data-testid="room-leaf-platform" data-activity={activity ?? 'empty'}
      data-dragging={dragging || undefined} role="region" aria-label="猫爬架叶子平台"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />
    <div className="rlp-leaf" data-playing={activity === 'playing' || undefined}
      aria-hidden="true" style={{ left: left + 377 * scale, top: top + 166 * scale,
        width: 32 * scale, height: 40 * scale }}>
      <img className="rlp-wall" src={`${import.meta.env.BASE_URL}static/room/leaf-wall-patch.png?v=leaf-platform-1`} alt="" />
      <span className="rlp-rope" />
      <img className="rlp-toy" src={`${import.meta.env.BASE_URL}static/room/platform-leaf.png?v=leaf-platform-1`} alt="" />
    </div>
  </>;
}
