import animationManifest from './panda-animation-manifest.json';
import { PIXELLAB_TRANSITION_FRAME_FILES } from './pixel-transition';
import type { PetCharacterId } from '@/hooks/use-pet-character';

const base = () => `${import.meta.env.BASE_URL}static/xiaobai/`;
export const xiaobaiAsset = (path: string) => {
  const version = path === 'jar.png' || path.startsWith('loops/jar/') || path.startsWith('transitions/to-jar/')
    ? 'xiaobai-jar-clear-2'
    : path === 'grab.png' || path.startsWith('transitions/to-grab/')
      ? 'xiaobai-scruff-cute-3' : 'xiaobai-1';
  return `${base()}${path}?v=${version}`;
};

/** Each alias names a Xiaobai redraw, never an original panda body. */
const aliases: Record<string, string> = {
  initial: 'idle', idle: 'idle', walk: 'walk', sleep: 'sleep', chew: 'eat',
  jump: 'jump', roll: 'back-pawing', 'room-roll': 'back-pawing', cuddle: 'cuddle',
  'cuddle-wriggle': 'cuddle', 'back-pawing': 'back-pawing', 'tail-chase': 'tail',
  lying: 'lying', peeking: 'peeking', grab: 'grab', startled: 'startled',
  'dirty-return': 'dirty', 'dirty-flee': 'dirty-flee', 'dirty-grab': 'dirty-grab',
  'dirty-grab-lift': 'dirty-grab', 'captured-dazed': 'dizzy', dizzy: 'dizzy',
  'captured-hug': 'captured-hug', 'captured-homecoming': 'captured-hug',
  'potion-comfort': 'sit', 'jar-peeking': 'jar', 'climb-up': 'climb', 'leaf-play': 'toy',
  'bored-over-dock': 'peeking', 'toy-teaser': 'toy', 'toy-laser': 'toy',
  'toy-curious': 'toy', 'toy-brake': 'toy', 'toy-wall-dizzy': 'dizzy',
  'eat-bamboo': 'eat', 'eat-banana': 'eat-banana', 'eat-carrot': 'eat-carrot',
  'eat-fish': 'eat-fish', 'eat-strawberry': 'eat-strawberry', 'eat-cookie': 'eat-cookie',
  'eat-candy': 'eat',
};
export const XIAOBAI_LOOP_COUNTS: Record<string, number> = {
  idle: 4, walk: 8, sleep: 4, lying: 4, climb: 8, 'back-pawing': 8,
  jump: 8, bath: 8, eat: 8, toy: 8, dizzy: 8, jar: 8, 'dirty-flee': 8,
  tail: 8, cuddle: 8, peeking: 4,
  'eat-banana': 8, 'eat-carrot': 8, 'eat-fish': 8, 'eat-strawberry': 8,
  'eat-cookie': 8,
};
const transitionTargets: Record<keyof typeof PIXELLAB_TRANSITION_FRAME_FILES, string> = {
  idle: 'idle', chew: 'eat', jump: 'jump', cuddle: 'lying', tail: 'idle',
  somersault: 'back-pawing', lying: 'lying', sleep: 'sleep', peeking: 'peeking',
  'captured-homecoming': 'captured-hug', 'climb-up': 'climb', 'leaf-play': 'toy',
};
export const XIAOBAI_TRANSITION_GROUPS = new Set([
  'sit', 'lying', 'sleep', 'startled', 'climb', 'back-pawing', 'grab', 'peeking',
  'eat', 'bath', 'dirty', 'wet', 'jar', 'captured-hug', 'dirty-grab', 'idle', 'toy',
]);
export type CharacterAsset = { src: string; group: string | null; explicitTransition?: boolean };
const sourceFrameCounts = animationManifest.frameCountBySprite as Record<string, number>;

export function characterAsset(source: string, characterId: PetCharacterId): CharacterAsset {
  if (characterId === 'panda') return { src: source, group: null };
  const file = source.split('static/panda/')[1]?.split('?')[0];
  if (!file) return { src: source, group: null };
  if (['snack.png', 'captured-time-portal.png', 'captured-time-portal.svg'].includes(file)) {
    return { src: source, group: null };
  }
  for (const [key, paths] of Object.entries(PIXELLAB_TRANSITION_FRAME_FILES)) {
    const index = (paths as readonly string[]).indexOf(file);
    if (index >= 0) {
      const target = transitionTargets[key as keyof typeof transitionTargets];
      // Five to seven real intermediate frames are sampled in chronological order.
      const n = 1 + Math.round(index * 5 / (paths.length - 1));
      return { src: xiaobaiAsset(`${target === 'jump' ? 'loops/jump' : `transitions/to-${target}`}/${n}.png`), group: target, explicitTransition: true };
    }
  }
  const archivedTransition = file.match(/^transitions\/(lying-to-stand-repair|pixellab-walk-to-roll|roll-to-lie-pose-2|walk-to-lie(?:-pose-2)?)-(\d+)\.png$/);
  const platformLanding = file.match(/^transitions\/platform-grab-to-idle-(\d+)\.png$/);
  if (platformLanding) {
    return { src: xiaobaiAsset(`transitions/to-grab/${7 - Number(platformLanding[1])}.png`), group: 'grab', explicitTransition: true };
  }
  if (archivedTransition) {
    const group = archivedTransition[1] === 'pixellab-walk-to-roll' ? 'back-pawing' : 'lying';
    const n = Math.min(6, Math.max(1, Number(archivedTransition[2])));
    const frame = archivedTransition[1] === 'lying-to-stand-repair' ? 7 - n : n;
    return { src: xiaobaiAsset(`transitions/to-${group}/${frame}.png`), group, explicitTransition: true };
  }
  if (/^frames\/potion-comfort-transition-\d+\.png$/.test(file)) {
    const n = Math.min(6, Number(file.match(/-(\d+)\.png$/)?.[1]) || 1);
    return { src: xiaobaiAsset(`transitions/to-sit/${n}.png`), group: 'sit', explicitTransition: true };
  }
  if (/^frames\/trash-can-(enter|exit)-\d+\.png$/.test(file)) {
    const n = Number(file.match(/-(\d+)\.png$/)?.[1]) || 1;
    const entering = file.includes('-enter-');
    const frame = entering ? Math.min(6, Math.ceil(n * 6 / 8)) : Math.max(1, 7 - n);
    return { src: xiaobaiAsset(`transitions/to-jar/${frame}.png`), group: 'jar', explicitTransition: true };
  }
  const folder = file.match(/^(bathing(?:-[\w-]+)?|bored-over-dock)\/(\d+)\.png$/);
  if (folder) {
    const group = folder[1] === 'bored-over-dock' ? 'peeking' : 'bath';
    return { src: xiaobaiAsset(`loops/${group}/${1 + Number(folder[2]) % XIAOBAI_LOOP_COUNTS[group]}.png`), group };
  }
  const frame = file.match(/^frames\/(.+)-(\d+)\.png$/);
  const name = frame?.[1] ?? file.replace(/\.png$/, '');
  const group = aliases[name];
  if (!group) throw new Error(`小白缺少已登记的角色素材映射：${file}`);
  if (frame && XIAOBAI_LOOP_COUNTS[group]) {
    const oldCount = sourceFrameCounts[name] ?? animationManifest.frameCount;
    const n = 1 + Math.floor((Number(frame[2]) - 1) % oldCount * XIAOBAI_LOOP_COUNTS[group] / oldCount);
    return { src: xiaobaiAsset(`loops/${group}/${n}.png`), group };
  }
  const staticName = ({ walk: 'idle', jump: 'idle', cuddle: 'lying', tail: 'idle', 'dirty-flee': 'dirty' } as Record<string, string>)[group] ?? group;
  return { src: xiaobaiAsset(`${staticName}.png`), group };
}

export const XIAOBAI_SHARED_ACTION_NOTE = '小白使用独立重绘素材；本批逗猫棒/激光笔/刹车共用扑玩动作，垃圾桶共用探头过渡，归家共用安慰姿势，糖果暂用通用咀嚼；并非每种特殊事件都已单独重画。';
