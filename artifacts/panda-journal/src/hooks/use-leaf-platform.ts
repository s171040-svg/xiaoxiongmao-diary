import { useCallback, useEffect, useRef, useState } from 'react';
import { chooseLeafActivity, leafActivityDuration, type LeafPlatformActivity } from '@/lib/room-leaf-platform';

export function useLeafPlatform(running: boolean) {
  const [session, setSession] = useState<{ mode: LeafPlatformActivity } | null>(null);
  const heldRef = useRef<LeafPlatformActivity | null>(null);
  const enter = useCallback((forced?: LeafPlatformActivity) => {
    const mode = forced ?? chooseLeafActivity();
    heldRef.current = mode;
    setSession({ mode });
  }, []);
  const pickUp = useCallback(() => {
    heldRef.current = null;
    setSession(null);
  }, []);
  useEffect(() => {
    if (!session || !running) return;
    const timer = window.setTimeout(() => {
      if (!heldRef.current) return;
      const mode = chooseLeafActivity();
      heldRef.current = mode;
      // A repeated activity still schedules its next random event.
      setSession({ mode });
    }, leafActivityDuration(session.mode));
    return () => window.clearTimeout(timer);
  }, [running, session]);
  return { mode: session?.mode ?? null, heldRef, enter, pickUp };
}
