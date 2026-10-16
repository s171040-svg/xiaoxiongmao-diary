const test = require("node:test");
const assert = require("node:assert/strict");
const { classify } = require("./ai.cjs");

test("DeepSeek contract and normalized reply", async () => {
  process.env.DEEPSEEK_API_KEY = "synthetic-test-key";
  global.fetch = async (url, options) => {
    assert.equal(url, "https://api.deepseek.com/chat/completions");
    const body = JSON.parse(options.body);
    assert.equal(body.response_format.type, "json_object");
    assert.equal(body.messages[1].content, "测试文字");
    assert.match(body.messages[0].content, /不给解决办法或行动建议/);
    assert.equal(Object.hasOwn(body, "photo"), false);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
      category: "worry", hasActionableGoal: false, reply: "第一段\\n\\n第二段",
    }) } }] }) };
  };
  const result = await classify("测试文字");
  assert.equal(result.reply, "第一段\n\n第二段");
  assert.equal(result.category, "worry");
});
test("Missing key fails without calling provider", async () => {
  delete process.env.DEEPSEEK_API_KEY;
  global.fetch = async () => assert.fail("Provider must not be called");
  await assert.rejects(classify("测试文字"), /DEEPSEEK_API_KEY/);
});
test("Malformed or rejected upstream data fails explicitly", async () => {
  process.env.DEEPSEEK_API_KEY = "synthetic-test-key";
  global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: {
    content: '{"category":"invalid","hasActionableGoal":false,"reply":"测试"}',
  } }] }) });
  await assert.rejects(classify("测试文字"), /格式不完整/);
  global.fetch = async () => ({ ok: false, status: 401 });
  await assert.rejects(classify("测试文字"), /密钥未通过验证/);
  await assert.rejects(classify(" ".repeat(3)), /1–4000/);
  await assert.rejects(classify("字".repeat(4001)), /1–4000/);
});
