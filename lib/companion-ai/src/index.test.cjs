"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { chat, parseResponse, validateInput } = require("./index.cjs");
const input = { userName: "", memories: [], messages: [{ role: "user", content: "我叫小乐，唱歌唱了很久，明天想继续练习。" }] };
test("validates context, name, structured notes and actual performance signal", () => {
  validateInput(input);
  const result = parseResponse(JSON.stringify({ reply: "唔，小乐唱了这么久，小熊猫给你表演个节目好不好呀？（它轻轻靠过来）",
    userName: "小乐", memories: [{ kind: "action", text: "明天继续练习唱歌" }], action: "none" }), input);
  assert.equal(result.userName, "小乐"); assert.equal(result.action, "performance");
  assert.equal(result.memories[0].kind, "action");
});
test("does not change user name to someone merely mentioned", () => {
  const result = parseResponse(JSON.stringify({ reply: "唔，小熊猫陪你坐会儿呀。（它轻轻靠过来）", userName: "王明", memories: [], action: "none" }),
    { ...input, userName: "小乐", messages: [{ role: "user", content: "同事王明又批评了唱歌的事情。" }] });
  assert.equal(result.userName, "小乐"); assert.match(result.reply, /小乐/);
});
test("rejects lectures, malformed notes, too-long replies and non-user final messages", () => {
  const reply = (text) => JSON.stringify({ reply: text, userName: "", memories: [], action: "none" });
  assert.throws(() => parseResponse(reply("我理解你的感受"), input));
  assert.throws(() => parseResponse(reply("唔，你应该早点休息呀。"), input));
  assert.throws(() => parseResponse(reply("字".repeat(301)), input));
  assert.throws(() => validateInput({ ...input, messages: [{ role: "assistant", content: "hello" }] }));
  assert.throws(() => validateInput({ ...input, messages: Array(41).fill(input.messages[0]) }));
});
test("DeepSeek call sends bounded context, no image, with no fake response on failure", async () => {
  const originalFetch = global.fetch, originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-only-not-a-real-key";
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, "https://api.deepseek.com/chat/completions");
      const body = JSON.parse(options.body);
      assert.match(body.messages[0].content, /小熊猫信差/);
      assert.match(body.messages[0].content, /先接住用户刚说的具体细节/);
      assert.match(body.messages[0].content, /把具体行为和人格分开/);
      assert.match(body.messages[0].content, /用户逗你、开玩笑时配合轻松玩闹/);
      assert.match(body.messages[0].content, /用户选了哪个就接哪个/);
      assert.match(body.messages[0].content, /自称“小熊猫”而不自称“我”/);
      assert.equal(body.model, "deepseek-flash"); assert.equal(body.thinking.type, "disabled");
      assert.equal(body.messages.at(-1).content, input.messages[0].content);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({
        reply: "唔，小乐唱了这么久，小熊猫陪你坐会儿呀。（它轻轻靠过来）", userName: "小乐", memories: [], action: "none",
      }) } }] }) };
    };
    assert.equal((await chat(input)).userName, "小乐");
    global.fetch = async () => ({ ok: false, status: 402 });
    await assert.rejects(chat(input), /账户/);
    delete process.env.DEEPSEEK_API_KEY;
    await assert.rejects(chat(input), /DEEPSEEK_API_KEY/);
  } finally { global.fetch = originalFetch; if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = originalKey; }
});
test("continuous assistant history preserves JSON mode rather than sending plain replies", async () => {
  const originalFetch = global.fetch, originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-only";
  try {
    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      const previous = body.messages.find(m => m.role === "assistant");
      const envelope = JSON.parse(previous.content);
      assert.equal(envelope.reply, "唔，小熊猫陪小乐坐一会儿呀。（它轻轻靠过来）");
      assert.equal(envelope.userName, "小乐"); assert.deepEqual(envelope.memories, []);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({
        reply: "诶，小乐说的那个排练，小熊猫还记得呢。（它蹦了一下）", userName: "小乐", memories: [], action: "none",
      }) } }] }) };
    };
    const result = await chat({ userName: "小乐", memories: [], messages: [
      input.messages[0], { role: "assistant", content: "唔，小熊猫陪小乐坐一会儿呀。（它轻轻靠过来）" },
      { role: "user", content: "刚才说的排练。" },
    ] });
    assert.match(result.reply, /记得呢。/);
  } finally { global.fetch = originalFetch; if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = originalKey; }
});
test("clear-mind mode is opt-in, adds its system prompt, and permits the fuller grounded reply", async () => {
  const originalFetch = global.fetch, originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-only";
  const clearInput = {
    ...input,
    clearMindMode: true,
    messages: [{ role: "user", content: "我男朋友不理我，是不是我太烦了？" }],
  };
  const clearReply = "唔……被在意的人没回消息，小熊猫抱抱你。事实是他还没回复；“我太烦了”是你的担心，不是已经证实的事实。你愿意把不安说出来，说明你在认真面对这段关系。至于他没回的原因，可能是忙、没看到，或暂时需要时间，目前并没有证据说明是你的错。（它认真地靠近你）";
  const requests = [];
  try {
    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      const clear = body.messages.some(message => message.content.includes("清醒心理支持模式"));
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({
        reply: clear ? clearReply : "唔，小熊猫陪你坐一会儿呀。（它轻轻靠过来）",
        userName: "", memories: [], action: "none",
      }) } }] }) };
    };
    await chat(input);
    const normalPrompt = requests[0].messages;
    assert.equal(normalPrompt.some(message => message.content.includes("清醒心理支持模式")), false);
    assert.throws(() => validateInput({ ...clearInput, clearMindMode: "on" }));
    const result = await chat(clearInput);
    const clearPrompt = requests[1].messages.find(message => message.content.includes("清醒心理支持模式"))?.content;
    assert.ok(clearPrompt);
    assert.match(clearPrompt, /我太烦/);
    assert.match(result.reply, /事实是他还没回复/);
    assert.match(result.reply, /愿意把不安说出来/);
    assert.match(result.reply, /可能是忙/);
    assert.equal(result.action, "none");
    assert.throws(() => parseResponse(JSON.stringify({
      reply: clearReply, userName: "", memories: [], action: "none",
    }), { ...clearInput, clearMindMode: false }));
  } finally { global.fetch = originalFetch; if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = originalKey; }
});
test("refusal boundaries remain while disclosed details are no longer overwritten by canned replies", () => {
  const answer = (text, messages) => parseResponse(JSON.stringify({
    reply: text, userName: "小乐", memories: [{ kind: "worry", text: "有心事" }], action: "performance",
  }), { userName: "小乐", memories: [], messages });
  const question = { role: "assistant", content: "唔，小乐，最近有没有什么难过的事，愿意说说呀？（它安静地靠过来）" };
  const refuses = answer("唔，小熊猫陪着你呀。（它轻轻靠过来）", [question, { role: "user", content: "不想说，别问了。" }]);
  assert.ok(refuses.reply.startsWith("唔……好，不说也行。小熊猫在这儿陪着你呀。"));
  assert.match(refuses.reply, /靠近小乐/);
  assert.equal(refuses.action, "none"); assert.deepEqual(refuses.memories, []);
  assert.doesNotMatch(refuses.reply, /[？?]/);
  const shares = answer("（靠过来，抬头看你）唔，小乐，排练这么久还忘词，难免会自责。小熊猫陪你慢慢说，当时是在练哪一段呀？", [question, { role: "user", content: "排练很久，还是忘词了，挺难过的。" }]);
  assert.match(shares.reply, /排练这么久还忘词/);
  assert.match(shares.reply, /小熊猫陪你/);
  assert.doesNotMatch(shares.reply, /我/);
  assert.doesNotMatch(shares.reply, /你不用说得太清楚/);
});
test("preserves invitation endings and only allows one contextual sentence-end emoji on occasional turns", () => {
  const parse = (reply, previous = 0) => parseResponse(JSON.stringify({ reply, userName: "", memories: [], action: "none" }),
    { userName: "", memories: [], messages: [...Array(previous).fill({ role: "assistant", content: "唔，陪着你呀。" }), { role: "user", content: "想坐一会儿。" }] }).reply;
  assert.doesNotMatch(parse("唔，小熊猫陪你坐会儿呀。🐾❤️（它轻轻靠过来）"), /🐾|❤️/);
  const occasional = parse("唔，小熊猫🐾陪你坐会儿呀。❤️（它轻轻靠过来）", 2);
  assert.match(occasional, /）🐾$/); assert.doesNotMatch(occasional, /❤️/);
  assert.match(parse("唔，要不要小熊猫陪着坐会儿呢？（它轻轻靠过来）"), /呢？/);
  assert.throws(() => parse("唔，其实这也没什么呀。"));
  assert.throws(() => parse("唔，小熊猫建议你休息呀。"));
});
test("messenger style accepts grounded two-sentence replies with leading actions", () => {
  const text = "（微微皱眉）小乐，起晚需要承担一点责任，但一次失误不能概括你整个人。被当众说也容易难受，当时他是怎么说的呀？";
  const result = parseResponse(JSON.stringify({ reply: text, userName: "小乐", memories: [], action: "none" }),
    { ...input, userName: "小乐" });
  assert.equal(result.reply, text);
  const cold = "（看着你）那你当时怎么想的？";
  assert.throws(() => parseResponse(JSON.stringify({ reply: cold, userName: "", memories: [], action: "none" }), input));
  assert.throws(() => parseResponse(JSON.stringify({ reply: "唔，我觉得你应该休息呀。", userName: "", memories: [], action: "none" }), input));
  assert.throws(() => parseResponse(JSON.stringify({ reply: "唔，第一句。第二句。第三句呀。", userName: "", memories: [], action: "none" }), input));
});
