import type { Gift } from '@/lib/companion-types';
import { useState } from 'react';
import './GiftDrop.css';

export function GiftDrop({ gift, startedAt, onCollect }: {
  gift?: Gift; startedAt?: number; onCollect: (id: string) => void;
}) {
  const [openedGiftId, setOpenedGiftId] = useState<string>();
  if (!gift) return null;
  const opened = openedGiftId === gift.id;

  const handleClick = () => {
    if (!opened) {
      setOpenedGiftId(gift.id);
      return;
    }
    onCollect(gift.id);
  };

  return (
    <div className="gift-drop-layer" aria-live="polite">
      <button className={`gift-drop${opened ? ' opened' : ''}${startedAt ? ' collecting' : ''}`} type="button"
        key={gift.id} disabled={Boolean(startedAt)}
        aria-label={startedAt ? `正在收好小熊猫带回来的${gift.item}` : opened ? `收好小熊猫带回来的${gift.item}` : '打开小熊猫带回来的礼物盒'}
        data-testid="button-collect-gift" onClick={handleClick}>
        <span className="gift-drop-box-art" aria-hidden="true">
          <span className="gift-box-body"><i /></span>
          <span className="gift-box-lid" />
          <span className="gift-drop-object"><span className="gift-drop-emoji">{gift.emoji}</span></span>
        </span>
        <span className="gift-drop-hint">{startedAt ? '收好啦～' : opened ? `小熊猫带给你的${gift.item} · 再点一下收好` : '小熊猫带回来一个礼物 · 点开看看'}</span>
      </button>
    </div>
  );
}
