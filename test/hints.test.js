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

  test("剥掉 markdown Codebase Map 段", () => {
    mockReadFile("global only");

    const input = [
      "system prompt start",
      "## Codebase Map",
      "generated map should be removed",
      "## GSD Skill Preferences",
      "- keep this",
    ].join("\n");

    const result = buildStablePrompt(input);

    assert.ok(!result.systemPrompt.includes("generated map should be removed"));
    assert.ok(result.systemPrompt.includes("## GSD Skill Preferences"));
    assert.ok(result.systemPrompt.includes("- keep this"));
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

  test("uses the caller cwd when loading project HINTS", () => {
    const reads = [];
    mock.method(fs, "readFileSync", filePath => {
      reads.push(String(filePath));
      return String(filePath).includes("/project/.gsd/HINTS.md") ? "project cwd hint" : "";
    });

    const result = buildStablePrompt("prompt", "/tmp/project");

    assert.ok(reads.some(filePath => filePath === "/tmp/project/.gsd/HINTS.md"));
    assert.ok(result.systemPrompt.includes("project cwd hint"));
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

  test("CODEBASE 块后紧跟 ## 标题时应正确结束并保留该标题", () => {
    mockReadFile("global only");

    const input = [
      "[SYSTEM CONTEXT — GSD]",
      "Some content here.",
      "",
      "[PROJECT CODEBASE — File structure]",
      "# Codebase Map",
      "Generated: 2026-05-03T04:27:35Z",
      "This should be removed.",
      "",
      "## Subagent Model",
      "This should be kept.",
      "",
      "[NEXT SECTION]",
      "This should also be kept.",
    ].join("\n");

    const result = buildStablePrompt(input);

    assert.ok(!result.systemPrompt.includes("[PROJECT CODEBASE"));
    assert.ok(!result.systemPrompt.includes("This should be removed"));
    assert.ok(result.systemPrompt.includes("## Subagent Model"));
    assert.ok(result.systemPrompt.includes("This should be kept."));
    assert.ok(result.systemPrompt.includes("[NEXT SECTION]"));
    assert.ok(result.systemPrompt.includes("This should also be kept."));
  });

  test("剥掉多个 PROJECT CODEBASE 块及其内部的所有内容", () => {
    mockReadFile("global only");

    const input = [
      "[SYSTEM CONTEXT — GSD]",
      "Some content here.",
      "",
      "[PROJECT CODEBASE — File structure]",
      "# Codebase Map",
      "Generated: 2026-05-03T04:27:35Z",
      "This should be removed.",
      "",
      "### Some internal heading",
      "This should also be removed.",
      "",
      "[PROJECT CODEBASE — Old duplicate]",
      "# Codebase Map",
      "Old content that should be removed.",
      "",
      "### Another internal heading",
      "This should also be removed (duplicate).",
      "",
      "[NEXT SECTION]",
      "This should be kept.",
    ].join("\n");

    const result = buildStablePrompt(input);

    // 验证所有 CODEBASE 块都被剥离
    assert.ok(!result.systemPrompt.includes("[PROJECT CODEBASE"));
    assert.ok(!result.systemPrompt.includes("This should be removed"));
    assert.ok(!result.systemPrompt.includes("This should also be removed"));

    // 验证其他内容保留
    assert.ok(result.systemPrompt.includes("[SYSTEM CONTEXT — GSD]"));
    assert.ok(result.systemPrompt.includes("[NEXT SECTION]"));
    assert.ok(result.systemPrompt.includes("This should be kept."));
  });
});
