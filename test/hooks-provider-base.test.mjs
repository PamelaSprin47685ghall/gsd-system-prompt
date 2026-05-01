import assert from "node:assert/strict";
import { test, describe } from "node:test";
import systemPromptPlugin from "../index.js";

/**
 * Helper: capture handlers from plugin registration.
 */
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

  test("Responses API 保留字段和消息 ID", () => {
    const h = captureHandlers();
    const event = {
      payload: { model: "gpt-4", input: [{ id: "msg1", role: "user", content: "hi" }] },
    };
    const result = h.before_provider_request(event);
    assert.ok(Array.isArray(result.input));
    assert.equal(result.input[0].id, "msg1");
    assert.equal(result.input[0].role, "user");
  });

  test("Responses API 剥离 prompt_cache_key", () => {
    const h = captureHandlers();
    const event = {
      payload: { model: "gpt-4", prompt_cache_key: "cache_abc", input: [] },
    };
    const result = h.before_provider_request(event);
    assert.equal("prompt_cache_key" in result, false);
    assert.ok(Array.isArray(result.input));
    assert.equal(result.model, "gpt-4");
  });

  test("Messages API 保留 prompt_cache_key", () => {
    const h = captureHandlers();
    const event = {
      payload: { model: "gpt-4", prompt_cache_key: "cache_abc", messages: [] },
    };
    const result = h.before_provider_request(event);
    assert.equal("prompt_cache_key" in result, true);
    assert.equal(result.prompt_cache_key, "cache_abc");
  });

  test("DeepSeek：为所有非 user 消息注入 reasoning_content", () => {
    const h = captureHandlers();
    const event = {
      payload: {
        model: "deepseek-chat",
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: [{ type: "text", text: "hello" }] },
        ],
      },
    };
    const result = h.before_provider_request(event);
    // user message should NOT have reasoning_content
    assert.equal("reasoning_content" in result.messages[0], false);
    // assistant message SHOULD have reasoning_content (empty string since no thinking block)
    assert.equal("reasoning_content" in result.messages[1], true);
    assert.equal(result.messages[1].reasoning_content, "");
  });

  test("DeepSeek：从 thinking block 提取 reasoning_content", () => {
    const h = captureHandlers();
    const event = {
      payload: {
        model: "deepseek-chat",
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
    assert.equal(result.messages[0].content[1].text, "答案是 42");
  });

  test("DeepSeek：无 thinking block 时 reasoning_content 为空", () => {
    const h = captureHandlers();
    const event = {
      payload: {
        model: "deepseek-chat",
        messages: [
          { role: "assistant", content: [{ type: "text", text: "直接回答" }] },
        ],
      },
    };
    const result = h.before_provider_request(event);
    assert.equal(result.messages[0].reasoning_content, "");
  });

  test("跳过已有 reasoning_content 的消息", () => {
    const h = captureHandlers();
    const event = {
      payload: {
        model: "deepseek-chat",
        messages: [
          { role: "assistant", content: [], reasoning_content: "已有思考" },
        ],
      },
    };
    const result = h.before_provider_request(event);
    // should preserve the original value
    assert.equal(result.messages[0].reasoning_content, "已有思考");
  });

  test("不修改原始 payload 数组", () => {
    const h = captureHandlers();
    const original = [
      { role: "user", content: "hi" },
      { role: "assistant", content: [{ type: "text", text: "hello" }] },
    ];
    const event = {
      payload: { model: "deepseek-chat", messages: original },
    };
    // call handler
    h.before_provider_request(event);
    // original[1] should NOT have reasoning_content
    assert.equal("reasoning_content" in original[1], false);
  });

  test("非 deepseek/k2.6 模型不注入 reasoning_content", () => {
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

  test("payload 为 undefined 时返回 undefined", () => {
    const h = captureHandlers();
    const result = h.before_provider_request({});
    assert.equal(result, undefined);
  });

  test("payload 不含 messages 或 input 时不报错", () => {
    const h = captureHandlers();
    const event = { payload: { model: "deepseek-chat" } };
    const result = h.before_provider_request(event);
    assert.equal(result.model, "deepseek-chat");
  });
});
