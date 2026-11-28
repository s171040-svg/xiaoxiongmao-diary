export const DREAM_CATALOGUE = [
  { id: 'boat', title: '萤火小船', text: '梦见自己坐着竹叶船顺河漂流，萤火虫一路替它照亮前方。' },
  { id: 'moon', title: '月亮竹笋山', text: '梦见月亮山长满了竹笋，月光闻起来像甜甜的蜂蜜。' },
  { id: 'icecream', title: '竹笋冰淇淋店', text: '梦见开了一家竹笋冰淇淋店，第一勺要留给你。' },
  { id: 'cloud', title: '软绵绵云枕', text: '梦见一朵胖云变成软枕头，托着它慢慢飘过星星。' },
  { id: 'bakery', title: '森林包子铺', text: '梦见竹林深处有间热乎乎的包子铺，蒸笼还会唱歌。' },
  { id: 'fish', title: '星河小鱼', text: '梦见和小鱼在星河里比赛，看谁先找到北极星。' },
  { id: 'star', title: '打呼噜的星星', text: '梦见一颗会打呼噜的星星，和它一起打出轻轻的节拍。' },
  { id: 'dewdrop', title: '露珠玻璃花园', text: '梦见把森林里的露珠收集起来，做成闪闪发亮的玻璃珠。' },
  { id: 'spaceship', title: '竹笋小飞船', text: '梦见自己成了小小飞船船长，载着竹笋去拜访月亮。' },
  { id: 'sea', title: '会发光的海', text: '梦见枕头长出翅膀，带它去看了一片会发光的海。' },
  { id: 'library', title: '树顶图书馆', text: '梦见和小鸟搭了一座树顶图书馆，每本书都藏着一片竹叶。' },
  { id: 'picnic', title: '云上野餐会', text: '梦见云上开野餐会，它给每一朵云都分了一粒糖。' },
] as const;

export type DreamId = typeof DREAM_CATALOGUE[number]['id'];
export type PetDream = { id: DreamId; title: string; text: string; seed: number };
export const DREAM_READY_MS = 2 * 60 * 1000;
export const DREAM_CHANGE_MS = 20000;

/** Pick a matching picture and story together; never immediately repeat a scene. */
export function choosePetDream(previous?: DreamId, random: () => number = Math.random): PetDream {
  const pool = DREAM_CATALOGUE.filter(dream => dream.id !== previous);
  const selected = pool[Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))];
  return { ...selected, seed: Math.floor(random() * 0xffffffff) >>> 0 };
}

/** Stable decorative variation: React rerenders must not scramble the picture. */
export function dreamRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
