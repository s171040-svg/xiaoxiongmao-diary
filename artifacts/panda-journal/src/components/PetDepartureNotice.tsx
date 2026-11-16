import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { projectRoomPoint, type RoomPoint } from '@/lib/room-plane';
import { PIXELLAB_TRANSITION_FRAME_FILES } from '@/lib/pixel-transition';
import './PetDepartureNotice.css';

const SIT_MS = 1400;
const SETTLE_MS = 500;
const RISE_MS = 500;
const WALK_MS = 2200;
const MESSAGE_MS = 4500;
const asset = (file: string) => `${import.meta.env.BASE_URL}static/panda/${file}?v=tail-left-3`;

/** The room event is decorative; only its final goodbye is announced. */
export function PetDepartureNotice({ point }: { point: RoomPoint }) {
  const [origin] = useState(point);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = performance.now();
    const timer = window.setInterval(() => {
      const next = performance.now() - started;
      setElapsed(next);
      if (next >= SETTLE_MS + SIT_MS + RISE_MS + WALK_MS + MESSAGE_MS) window.clearInterval(timer);
    }, 50);
    return () => window.clearInterval(timer);
  }, []);

  const riseStart = SETTLE_MS + SIT_MS;
  const walkStart = riseStart + RISE_MS;
  const messageStart = walkStart + WALK_MS;
  if (elapsed >= messageStart + MESSAGE_MS) return null;
  if (elapsed >= messageStart) return createPortal(
    <p className="pet-departure-goodbye" role="status" aria-live="polite"
      data-testid="panda-departure-notice">妈妈我出门玩啦</p>,
    document.body,
  );

  const phase = elapsed < SETTLE_MS ? 'settling' : elapsed < riseStart ? 'sitting' : elapsed < walkStart ? 'rising' : 'walking';
  const projected = projectRoomPoint(origin, window.innerWidth, window.innerHeight);
  const progress = Math.max(0, Math.min(1, (elapsed - walkStart) / WALK_MS));
  const transition = [...PIXELLAB_TRANSITION_FRAME_FILES.idle].reverse();
  const src = phase === 'settling'
    ? asset(PIXELLAB_TRANSITION_FRAME_FILES.idle[Math.min(4, Math.floor(elapsed / 100))])
    : phase === 'sitting'
    ? asset(`frames/idle-${1 + Math.floor(elapsed / 420) % 4}.png`)
    : phase === 'rising'
      ? asset(transition[Math.min(4, Math.floor((elapsed - riseStart) / 100))])
      : asset(`frames/walk-${1 + Math.floor((elapsed - walkStart) / 180) % 4}.png`);
  return (
    <div className="pet-departure-actor" data-testid="panda-departure-animation" data-phase={phase}
      aria-hidden="true" style={{
        left: `${projected.x}%`, top: `${projected.y}%`,
        width: 72 * projected.scale, height: 72 * projected.scale,
        '--departure-x': `${-progress * 150 * projected.scale}px`,
        opacity: progress < 0.35 ? 1 : (1 - progress) / 0.65,
      } as CSSProperties}>
      <img src={src} alt="" draggable={false} data-facing={phase === 'sitting' ? 'front' : 'left'} />
    </div>
  );
}
