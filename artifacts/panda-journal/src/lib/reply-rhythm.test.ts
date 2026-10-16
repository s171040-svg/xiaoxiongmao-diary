import { strict as assert } from 'node:assert';
import { replyFrame, replyRhythm, splitReply } from './reply-rhythm';

assert.deepEqual(splitReply('呀👨‍👩‍👧‍👦🐾'), ['呀', '👨‍👩‍👧‍👦', '🐾']);
const text = '唔，你唱歌唱了这么久，小熊猫陪你坐一会儿呀。（轻轻靠过来）🐾';
const plan = replyRhythm(text, () => 0.4);
assert.ok(plan.pause >= 500 && plan.pause <= 1500);
assert.ok(plan.pause + plan.duration >= 1500 && plan.pause + plan.duration <= 3000);
assert.equal(plan.interval * plan.characters.length, plan.duration);
assert.equal(replyFrame(plan, 0), '');
for (let i = 0; i < plan.characters.length; i++) {
  assert.equal(replyFrame(plan, plan.interval * (i + 0.5)), plan.characters.slice(0, i).join(''));
  assert.equal(replyFrame(plan, plan.interval * (i + 1)), plan.characters.slice(0, i + 1).join(''));
}
assert.equal(replyFrame(plan, plan.duration), text);
for (let time = 0; time <= plan.duration; time += 25) {
  assert.ok(text.startsWith(replyFrame(plan, time)), 'Every frame contains only a real prefix, never random symbols');
}
assert.ok(replyRhythm('唔……', () => 0).interval > 0);
console.log('PASS reply rhythm: timing, plain gradual typing, no scrambled symbols, exceptions, emoji integrity');
