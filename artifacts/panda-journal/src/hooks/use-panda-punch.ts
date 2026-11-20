import { useEffect, useState } from 'react';
import { punchFrameAt } from '@/lib/panda-punch';

/** Elapsed time, rather than frame counting, prevents a background tab getting stuck. */
export function usePandaPunch(active: boolean): number | null {
  const [frame, setFrame] = useState<number | null>(null);
  useEffect(() => {
    if (!active) { setFrame(null); return; }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const started = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      // A RAF timestamp can precede this effect's performance.now() in the same
      // browser frame. That tiny negative delta is not the end of the reaction.
      const next = punchFrameAt(Math.max(0, now - started), reduced);
      setFrame(next);
      if (next !== null) raf = window.requestAnimationFrame(tick);
    };
    tick(started);
    return () => window.cancelAnimationFrame(raf);
  }, [active]);
  return active ? frame : null;
}
