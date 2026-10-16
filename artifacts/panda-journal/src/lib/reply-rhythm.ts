const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });
export const splitReply = (text: string) => Array.from(segmenter.segment(text), part => part.segment);

export function replyRhythm(text: string, random = Math.random, initialPause?: number) {
  const characters = splitReply(text);
  const emotional = /委屈|难过|辛苦|自责|害怕|心疼|累|压力|陪着|抱抱/.test(text);
  const pause = initialPause ?? Math.round(500 + random() * 1000);
  const interval = Math.max(2, Math.min(emotional ? 120 : 100, (3000 - pause) / Math.max(1, characters.length)));
  return { characters, pause, duration: interval * characters.length, interval };
}

export function replyFrame(plan: ReturnType<typeof replyRhythm>, elapsed: number) {
  const stable = Math.min(plan.characters.length, Math.max(0,
    Math.floor(Math.max(0, elapsed) / Math.max(1, plan.interval) + 1e-6)));
  return plan.characters.slice(0, stable).join('');
}
