import type { Gift } from '@/lib/companion-types';
import '../../desktop/gift-drop.css';

export function GiftDrop({ gift, startedAt, onCollect }: {
  gift?: Gift; startedAt?: number; onCollect: (id: string) => void;
}) {
  if (!gift) return null;
  return (
    <div className="gift-drop-layer" aria-live="polite">
      <button className={`gift-drop${startedAt ? ' collecting' : ''}`} type="button"
        key={gift.id} disabled={Boolean(startedAt)} onClick={() => onCollect(gift.id)}
        aria-label={`收好小熊猫带回来的${gift.item}`} data-testid="button-collect-gift">
        <span className="gift-drop-object" aria-hidden="true">{gift.emoji}</span>
        <span className="gift-drop-hint">{startedAt ? '收好啦～' : `带给你的${gift.item} · 点一下收好`}</span>
      </button>
    </div>
  );
}
