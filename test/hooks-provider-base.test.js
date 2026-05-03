import assert from "node:assert/strict";
import { test, describe } from "node:test";
import systemPromptPlugin from "../index.js";

function captureHandlers() {
  const handlers = {};
  const pi = {
    on: (name, fn) => {
      handlers[name] = fn;
    },
  };
  systemPromptPlugin(pi);
  return handlers;
}

describe("before_provider_request", () => {
  test("保留 Messages API payload 字段 — model, store 等不被修改", () => {
    const h = captureHandlers();
    const event = {
      payload: { model: "gpt-4", store: true, messages: [] },
    };
    const result = h.before_provider_request(event);
    assert.equal(result.model, "gpt-4");
    assert.equal(result.store, true);
    assert.ok(Array.isArray(result.messages));
  });

  test("deepseek-chat 不在补丁范围内", () => {
    const h = captureHandlers();
    const event = {
      payload: {
        model: "deepseek-chat",
        messages: [
          { role: "assistant", content: [{ type: "thinking", thinking: "x" }] },
        ],
      },
    };
    const result = h.before_provider_request(event);
    assert.equal("reasoning_content" in result.messages[0], false);
  });

  test("DeepSeek v4：从无 thinking block 的 assistant 消息不注入 reasoning_content", () => {
    const h = captureHandlers();
    const event = {
      payload: {
        model: "deepseek-v4-pro",
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: [{ type: "text", text: "hello" }] },
        ],
      },
    };
    const result = h.before_provider_request(event);
    assert.equal("reasoning_content" in result.messages[0], false);
    assert.equal("reasoning_content" in result.messages[1], false);
    assert.equal(result.thinking.type, "enabled");
  });

  test("DeepSeek v4：从 thinking block 提取 reasoning_content 并从 content 移除", () => {
    const h = captureHandlers();
    const event = {
      payload: {
        model: "deepseek-v4-pro",
        messages: [
          {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "我需要思考一下这个问题" },
              { type: "text", text: "答案是 42" },
            ],
          },
        ],
      },
    };
    const result = h.before_provider_request(event);
    assert.equal(result.messages[0].reasoning_content, "我需要思考一下这个问题");
    assert.equal(result.messages[0].content.length, 1);
    assert.equal(result.messages[0].content[0].type, "text");
    assert.equal(result.messages[0].content[0].text, "答案是 42");
    assert.equal(result.thinking.type, "enabled");
  });

  test("DeepSeek v4：跳过已有 reasoning_content 的消息", () => {
    const h = captureHandlers();
    const event = {
      payload: {
        model: "deepseek-v4-pro",
        messages: [
          { role: "assistant", content: [], reasoning_content: "已有思考" },
        ],
      },
    };
    const result = h.before_provider_request(event);
    assert.equal(result.messages[0].reasoning_content, "已有思考");
  });

  test("不修改原始 payload 数组", () => {
    const h = captureHandlers();
    const original = [
      { role: "user", content: "hi" },
      { role: "assistant", content: [{ type: "text", text: "hello" }] },
    ];
    const event = {
      payload: { model: "deepseek-v4-pro", messages: original },
    };
    h.before_provider_request(event);
    assert.equal("reasoning_content" in original[1], false);
  });

  test("非 deepseek-v4/kimi-k2.6 模型不注入 reasoning_content", () => {
    const h = captureHandlers();
    const event = {
      payload: {
        model: "gpt-4o",
        messages: [
          { role: "assistant", content: [{ type: "text", text: "hello" }] },
        ],
      },
    };
    const result = h.before_provider_request(event);
    assert.equal("reasoning_content" in result.messages[0], false);
  });

  test("GLM-5.1：提取 thinking block 并启用 clear_thinking: false", () => {
    const h = captureHandlers();
    const event = {
      payload: {
        model: "glm-5.1",
        messages: [
          {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "GLM 思考中" },
              { type: "text", text: "答案" },
            ],
          },
        ],
      },
    };
    const result = h.before_provider_request(event);
    assert.equal(result.messages[0].reasoning_content, "GLM 思考中");
    assert.equal(result.messages[0].content.length, 1);
    assert.equal(result.thinking.type, "enabled");
    assert.equal(result.thinking.clear_thinking, false);
  });

  test("GLM-5.1：无 thinking block 时仍启用 clear_thinking: false", () => {
    const h = captureHandlers();
    const event = {
      payload: {
        model: "glm-5.1",
        messages: [
          { role: "assistant", content: [{ type: "text", text: "直接回答" }] },
        ],
      },
    };
    const result = h.before_provider_request(event);
    assert.equal("reasoning_content" in result.messages[0], false);
    assert.equal(result.thinking.type, "enabled");
    assert.equal(result.thinking.clear_thinking, false);
  });

  test("GLM-4.5 不在补丁范围内", () => {
    const h = captureHandlers();
    const event = {
      payload: {
        model: "glm-4.5",
        messages: [
          { role: "assistant", content: [{ type: "thinking", thinking: "x" }] },
        ],
      },
    };
    const result = h.before_provider_request(event);
    assert.equal("reasoning_content" in result.messages[0], false);
  });

  test("payload 为 undefined 时返回 undefined", () => {
    const h = captureHandlers();
    const result = h.before_provider_request({});
    assert.equal(result, undefined);
  });

  test("payload 不含 messages 或 input 时不报错", () => {
    const h = captureHandlers();
    const event = { payload: { model: "deepseek-v4-pro" } };
    const result = h.before_provider_request(event);
    assert.equal(result.model, "deepseek-v4-pro");
  });

  test("Kimi K2.6：提取 thinking block 并添加 thinking 参数", () => {
    const h = captureHandlers();
    const event = {
      payload: {
        model: "kimi-k2.6",
        messages: [
          {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "Kimi 思考中" },
              { type: "text", text: "结果" },
            ],
          },
        ],
      },
    };
    const result = h.before_provider_request(event);
    assert.equal(result.messages[0].reasoning_content, "Kimi 思考中");
    assert.equal(result.messages[0].content.length, 1);
    assert.equal(result.thinking.type, "enabled");
  });

  test("Kimi K2.6：历史含 reasoning_content 时启用 keep: all", () => {
    const h = captureHandlers();
    const event = {
      payload: {
        model: "kimi-k2.6",
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "", reasoning_content: "之前的思考" },
        ],
      },
    };
    const result = h.before_provider_request(event);
    assert.equal(result.thinking.type, "enabled");
    assert.equal(result.thinking.keep, "all");
  });
});
