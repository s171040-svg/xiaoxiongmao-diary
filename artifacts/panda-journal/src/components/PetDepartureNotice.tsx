import { useState } from 'react';
import { createPortal } from 'react-dom';
import './PetDepartureNotice.css';

/** Portaled outside the room so furniture and the toy dock cannot cover it. */
export function PetDepartureNotice() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return createPortal(
    <section className="pet-departure-notice" role="status" aria-live="polite"
      aria-label="小熊猫出门提示" data-testid="panda-departure-notice">
      <button type="button" className="pet-departure-notice-close"
        aria-label="收起出门提示" onClick={() => setDismissed(true)}>×</button>
      <p>小熊猫呆呆地，眼巴巴地看着你</p>
      <strong>出门玩啦！</strong>
    </section>,
    document.body,
  );
}
