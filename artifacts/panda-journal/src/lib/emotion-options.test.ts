import { strict as assert } from 'node:assert';
import { emotionOptions } from './emotion-options';

const sadness = emotionOptions('今天被批评了，觉得很委屈。', () => 0.3);
assert.equal(sadness.length, 3);
assert.ok(sadness.every(option => ['有点难过', '有点委屈', '有点气', '有点焦虑', '有点孤单', '有点失望', '有点想哭', '有点撑不住'].includes(option)));
assert.ok(!sadness.includes('有点开心'));
assert.ok(emotionOptions('我终于完成演出了，特别开心！', () => 0.1).every(option => ['有点开心', '有点兴奋', '有点感动', '有点幸福', '有点骄傲', '有点暖'].includes(option)));
assert.ok(emotionOptions('今天发生了点事。', () => 0.5).every(option => ['想说说', '想被听着', '想被抱着', '就是想说说', '说不清'].includes(option)));
console.log('PASS emotion choices stay in a mood-appropriate pool');
