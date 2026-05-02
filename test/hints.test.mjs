import assert from "node:assert/strict";
import { test, describe, mock, afterEach } from "node:test";
import fs from "node:fs";
import { buildStablePrompt } from "../src/inject.js";

function mockReadFile(returns) {
  mock.method(fs, "readFileSync", () => {
    if (returns === "ENOENT") {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    }
    return returns || "";
  });
}

describe("buildStablePrompt", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  test("剥掉 CODEBASE 段，保留动态行，追加稳定 HINTS", () => {
    mockReadFile("global: test hints\nproject: more hints");

    const input = [
      "system prompt start",
      "Current working directory: /fake/path",
      "Current date and time: 2025-01-01 12:00",
      "",
      "[SYSTEM CONTEXT — GSD]",
      "some context",
      "",
      "[PROJECT CODEBASE — 2025-01-01 12:00]",
      "this should be removed",
      "",
      "## Some Section",
      "end of prompt",
    ].join("\n");

    const result = buildStablePrompt(input);

    assert.ok(!result.systemPrompt.includes("PROJECT CODEBASE"), "CODEBASE block should be removed");
    assert.ok(!result.systemPrompt.includes("this should be removed"), "CODEBASE content should be removed");
    // Dynamic lines are now preserved (not stripped)
    assert.ok(result.systemPrompt.includes("Current working directory:"), "cwd line should be preserved");
    assert.ok(result.systemPrompt.includes("Current date and time:"), "date line should be preserved");
    assert.ok(result.systemPrompt.includes("[HINTS — Stable Guidance]"));
    assert.ok(!("dynamicLines" in result), "should not return dynamicLines");
  });

  test("无 CODEBASE 段时保留原内容并追加 HINTS", () => {
    mockReadFile("global only");

    const input = "# just a simple prompt\nsome content";

    const result = buildStablePrompt(input);

    assert.ok(result.systemPrompt.includes("# just a simple prompt"));
    assert.ok(result.systemPrompt.includes("some content"));
    assert.ok(result.systemPrompt.includes("[HINTS — Stable Guidance]"));
  });

  test("systemPrompt 为空字符串时正常处理", () => {
    mockReadFile("global only");

    const result = buildStablePrompt("");

    assert.ok(result.systemPrompt.includes("[HINTS — Stable Guidance]"));
  });

  test("幂等：已有 HINTS 时直接返回", () => {
    process.env.GSD_HOME = "/tmp/gsd-home";
    mockReadFile("hint content");

    const input = [
      "system prompt start",
      "Current working directory: /custom/path",
      "[SYSTEM CONTEXT — GSD]",
      "context body",
    ].join("\n");

    const first = buildStablePrompt(input);
    const second = buildStablePrompt(first.systemPrompt);

    // still has dynamic lines, has HINTS
    assert.ok(!first.systemPrompt.includes("PROJECT CODEBASE"));
    assert.ok(first.systemPrompt.includes("Current working directory: /custom/path"));
    assert.ok(first.systemPrompt.includes("[HINTS — Stable Guidance]"));
    // second call: HINTS already present, returns as-is
    assert.equal(first.systemPrompt, second.systemPrompt);
  });
});
