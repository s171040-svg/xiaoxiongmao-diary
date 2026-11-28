import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { choosePetDream, DREAM_CHANGE_MS, type PetDream } from './_pet-dreams';
import { PixelDreamCloud, PixelDreamScene } from './_PixelDreamArt';
import './_PetDreamBubble.css';

export function PetDreamBubble({ initialDream, side, petName }: {
  initialDream: PetDream; side: 'left' | 'right'; petName: string;
}) {
  const [dream, setDream] = useState(initialDream);
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState(0);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const cloud = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const offset = useRef(0);
  const id = useId();
  const nextDream = () => setDream(previous => choosePetDream(previous.id));
  const close = () => { setOpen(false); cloud.current?.focus({ preventScroll: true }); };
  useEffect(() => { setDream(initialDream); setOpen(false); }, [initialDream]);
  useEffect(() => {
    if (open) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') nextDream();
    }, DREAM_CHANGE_MS);
    return () => window.clearInterval(timer);
  }, [open]);
  useLayoutEffect(() => {
    const fit = () => {
      const box = cloud.current?.getBoundingClientRect();
      if (!box) return;
      const left = box.left - offset.current, right = box.right - offset.current;
      const dx = left < 8 ? 8 - left : right > window.innerWidth - 8 ? window.innerWidth - 8 - right : 0;
      offset.current = dx; setNudge(dx);
    };
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [side]);
  useLayoutEffect(() => {
    if (!open) return;
    const fit = () => {
      const anchor = cloud.current?.getBoundingClientRect(), box = panel.current?.getBoundingClientRect();
      if (!anchor || !box) return;
      setPosition({
        left: Math.max(8, Math.min(window.innerWidth - box.width - 8, anchor.left + anchor.width / 2 - box.width / 2)),
        top: Math.max(8, Math.min(window.innerHeight - box.height - 8,
          anchor.top > box.height + 16 ? anchor.top - box.height - 10 : anchor.bottom + 8)),
      });
    };
    fit(); window.addEventListener('resize', fit); window.addEventListener('scroll', fit, true);
    const outside = (event: PointerEvent) => {
      if (!cloud.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      window.removeEventListener('resize', fit); window.removeEventListener('scroll', fit, true);
      document.removeEventListener('pointerdown', outside);
    };
  }, [open, nudge]);
  return <>
    <button ref={cloud} type="button" className={`pd-dream pd-dream--${side}`}
      style={{ translate: `${nudge}px 0` }} data-testid="panda-dream-cloud"
      aria-label={`${open ? '收起' : '查看'}${petName}的梦`} aria-expanded={open} aria-controls={open ? id : undefined}
      title="点击看看它梦见了什么" onPointerDown={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); setOpen(value => !value); }}>
      <PixelDreamCloud dream={dream} />
    </button>
    {open && createPortal(<div ref={panel} id={id} className="pd-dream-panel" role="group"
      aria-label={`${petName}的梦境`} data-testid="panda-dream-popover" style={position}
      onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
      <header><span>{petName}的梦</span><button type="button" aria-label="关闭梦境" onClick={close}>
        <svg viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M2 1H4V3H6V5H8V3H10V1H12V3H10V5H8V7H10V9H12V11H10V9H8V7H6V9H4V11H2V9H4V7H6V5H4V3H2Z" /></svg>
      </button></header>
      <div className="pd-dream-picture" role="img" aria-label={dream.title}><PixelDreamScene dream={dream} /></div>
      <strong>{dream.title}</strong><p>{dream.text}</p>
      <button type="button" className="pd-dream-next" data-testid="button-next-dream" onClick={nextDream}>换个梦看看</button>
    </div>, document.body)}
  </>;
}
