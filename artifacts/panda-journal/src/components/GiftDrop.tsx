import { useEffect, useState, type CSSProperties } from 'react';
import type { Gift } from '@/lib/companion-types';
import type { RoomProjection } from '@/lib/room-plane';
import { usePetCharacter } from '@/hooks/use-pet-character';
import './GiftDrop.css';

const OPEN_FRAME_COUNT = 6;
const ROOM_ASSET_BASE = `${import.meta.env.BASE_URL}static/room/`;
const CLOSED_BOX_IMAGE = `${ROOM_ASSET_BASE}gift-arrival-box.png`;

type GiftDropProps = {
  gift?: Gift;
  startedAt?: number;
  onCollect: (id: string) => void;
  position?: Pick<RoomProjection, 'x' | 'y' | 'scale' | 'zIndex' | 'depth'>;
  storagePosition?: Pick<RoomProjection, 'x' | 'y'>;
};

export function GiftDrop({ gift, startedAt, onCollect, position, storagePosition }: GiftDropProps) {
  const { name: petName } = usePetCharacter();
  const [openedGiftId, setOpenedGiftId] = useState<string>();
  const [openFrame, setOpenFrame] = useState(0);
  const opened = Boolean(gift && (openedGiftId === gift.id || startedAt));

  useEffect(() => {
    if (!gift || !openedGiftId || openedGiftId !== gift.id || startedAt) {
      setOpenFrame(startedAt ? OPEN_FRAME_COUNT : 0);
      return;
    }

    let frame = 0;
    setOpenFrame(0);
    const timer = window.setInterval(() => {
      frame += 1;
      setOpenFrame(frame);
      if (frame >= OPEN_FRAME_COUNT) window.clearInterval(timer);
    }, 95);
    return () => window.clearInterval(timer);
  }, [gift?.id, openedGiftId, startedAt]);

  if (!gift || !position) return null;

  const storage = storagePosition ?? position;
  const collectDeltaX = ((storage.x - position.x) / 100) * window.innerWidth;
  const collectDeltaY = ((storage.y - position.y) / 100) * window.innerHeight;
  const openImage = openFrame > 0
    ? `${ROOM_ASSET_BASE}gift-arrival-open-${String(openFrame).padStart(2, '0')}.png`
    : CLOSED_BOX_IMAGE;

  return (
    <div className={`gift-drop${opened ? ' opened' : ''}${startedAt ? ' collecting' : ''}`}
      aria-live="polite" data-testid="gift-drop"
      data-room-depth={position.depth.toFixed(3)}
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        zIndex: position.zIndex,
        '--gift-scale': position.scale,
        '--gift-collect-x': `${collectDeltaX}px`,
        '--gift-collect-y': `${collectDeltaY}px`,
      } as CSSProperties}>
      <button className="gift-drop-box-button" type="button" disabled={opened || Boolean(startedAt)}
        aria-label={`打开${petName}带回来的礼物盒`} data-testid="button-open-gift-box"
        onClick={() => setOpenedGiftId(gift.id)}>
        <img src={opened ? openImage : CLOSED_BOX_IMAGE} alt="" draggable={false} />
      </button>
      {opened && (
        <button className="gift-drop-reward" type="button" disabled={Boolean(startedAt)}
          aria-label={`把${gift.item}收进礼物收纳盒`} data-testid="button-collect-gift"
          onClick={() => onCollect(gift.id)}>
          <span className="gift-drop-emoji" aria-hidden="true">{gift.emoji}</span>
          <small>{gift.item}</small>
        </button>
      )}
      <span className="gift-drop-hint">
        {startedAt ? '正在收进礼物收纳盒…' : opened ? '点礼物收进收纳盒' : `${petName}带回一个礼物 · 点盒子打开`}
      </span>
    </div>
  );
}
