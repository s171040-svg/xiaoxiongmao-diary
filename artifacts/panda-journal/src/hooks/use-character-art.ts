import { useEffect, useMemo, useRef, useState } from 'react';
import { usePetCharacter } from './use-pet-character';
import { characterAsset, xiaobaiAsset, XIAOBAI_TRANSITION_GROUPS, XIAOBAI_LOOP_COUNTS } from '@/lib/pet-character-assets';

const poseGroup = (group: string | null) => group?.startsWith('eat-') ? 'eat'
  : ({ cuddle: 'lying', tail: 'idle', dizzy: 'sit', walk: 'idle', 'dirty-flee': 'dirty' } as Record<string, string>)[group ?? ''] ?? group;

export function useCharacterAsset() {
  const { characterId } = usePetCharacter();
  return useMemo(() => (src: string) => characterAsset(src, characterId).src, [characterId]);
}

/** Redrawn pose changes, including dragging/bathing, use real intermediate frames. */
export function useCharacterBody(source: string, externalTransition: boolean) {
  const { characterId } = usePetCharacter();
  const asset = useMemo(() => characterAsset(source, characterId), [source, characterId]);
  const [loopFrame, setLoopFrame] = useState(0);
  useEffect(() => {
    setLoopFrame(0);
    if (characterId !== 'xiaobai' || !asset.group || asset.group === 'cuddle' || !XIAOBAI_LOOP_COUNTS[asset.group]) return;
    const interval = ({ idle: 420, sleep: 520, lying: 420, peeking: 320, walk: 140, climb: 120 } as Record<string, number>)[asset.group] ?? 140;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setLoopFrame(frame => frame + 1);
    }, interval);
    return () => window.clearInterval(timer);
  }, [characterId, asset.group]);
  const previous = useRef<{ characterId: string; group: string | null }>({ characterId, group: asset.group });
  const [transition, setTransition] = useState<{ src: string; target: string | null } | null>(null);
  useEffect(() => {
    const old = previous.current;
    previous.current = { characterId, group: asset.group };
    if (old.characterId !== characterId || characterId !== 'xiaobai' || externalTransition || asset.explicitTransition
      || old.group === asset.group || !old.group || !asset.group) {
      setTransition(null);
      return;
    }
    const frames: string[] = [];
    const from = poseGroup(old.group), to = poseGroup(asset.group);
    if (from === to) return;
    if (from && from !== 'idle' && XIAOBAI_TRANSITION_GROUPS.has(from)) {
      for (let n = 6; n >= 1; n--) frames.push(xiaobaiAsset(`transitions/to-${from}/${n}.png`));
    }
    if (to && to !== 'idle' && XIAOBAI_TRANSITION_GROUPS.has(to)) {
      for (let n = 1; n <= 6; n++) frames.push(xiaobaiAsset(`transitions/to-${to}/${n}.png`));
    }
    if (!frames.length) return;
    let i = 0;
    setTransition({ src: frames[0], target: asset.group });
    const timer = window.setInterval(() => {
      i++;
      if (i >= frames.length) { setTransition(null); window.clearInterval(timer); }
      else setTransition({ src: frames[i], target: asset.group });
    }, 75);
    return () => window.clearInterval(timer);
    // Deliberately follow semantic poses, not each frame of a running loop.
  }, [asset.group, asset.explicitTransition, characterId, externalTransition]);
  // Keep Xiaobai's accepted resting cuddle pose without the side-to-side loop.
  const body = characterId === 'xiaobai' && !asset.explicitTransition && asset.group === 'cuddle'
    ? xiaobaiAsset('loops/cuddle/2.png')
    : characterId === 'xiaobai' && !asset.explicitTransition && asset.group && XIAOBAI_LOOP_COUNTS[asset.group]
    ? xiaobaiAsset(`loops/${asset.group}/${1 + loopFrame % XIAOBAI_LOOP_COUNTS[asset.group]}.png`)
    : asset.src;
  return transition?.target === asset.group ? transition.src : body;
}
