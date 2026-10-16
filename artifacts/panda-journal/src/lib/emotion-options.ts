const negative = ['有点难过', '有点委屈', '有点气', '有点焦虑', '有点孤单', '有点失望', '有点想哭', '有点撑不住'];
const positive = ['有点开心', '有点兴奋', '有点感动', '有点幸福', '有点骄傲', '有点暖'];
const neutral = ['想说说', '想被听着', '想被抱着', '就是想说说', '说不清'];

const negativeSignals = /难过|委屈|生气|有点气|焦虑|担心|压力|孤单|失望|想哭|撑不住|不开心|烦恼|被骂|吵架|害怕|心累|辛苦|难受|伤心/;
const positiveSignals = /开心|高兴|兴奋|感动|幸福|骄傲|温暖|暖|喜欢|期待|成功|做到了|好消息|庆祝/;

export function emotionOptions(text: string, random = Math.random): string[] {
  const pool = negativeSignals.test(text) ? negative : positiveSignals.test(text) ? positive : neutral;
  const shuffled = [...pool].sort(() => random() - 0.5);
  return shuffled.slice(0, 3);
}
