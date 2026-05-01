import assert from "node:assert/strict";
import { test, describe, mock, afterEach } from "node:test";
import fs from "node:fs";
import { buildStablePrompt } from "../src/inject.js";
import { _resetCache } from "../src/fs.js";

function mockReadFile(returns) {
  mock.method(fs, "readFileSync", (p, enc) => {
    if (returns === "ENOENT") {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    }
    return returns || "";
  });
}

function stubListing(dir) {
  return "   123.0M  src/\n     4.0K  package.json";
}

describe("buildStablePrompt", () => {
  afterEach(() => {
    mock.restoreAll();
    _resetCache();
  });

  test("剥掉 CODEBASE 段，追加 HINTS 和 listing", () => {
    mockReadFile("global: test hints\nproject: more hints");

    const input = [
      "system prompt start",
      "Current working directory: /fake/path",
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

    const result = buildStablePrompt(input, stubListing);

    assert.ok(!result.systemPrompt.includes("PROJECT CODEBASE"), "CODEBASE block should be removed");
    assert.ok(!result.systemPrompt.includes("this should be removed"), "CODEBASE content should be removed");
    assert.ok(result.systemPrompt.includes("[HINTS — Stable Guidance]"));
    assert.ok(result.systemPrompt.includes("$ du -hxd1"));
  });

  test("从 Current working directory 行提取 cwd", () => {
    mockReadFile("global content");

    let capturedDir;
    const tracker = (dir) => {
      capturedDir = dir;
      return stubListing(dir);
    };

    const input = [
      "# prompt",
      "Current working directory: /custom/path",
      "some content",
    ].join("\n");

    buildStablePrompt(input, tracker);
    assert.equal(capturedDir, "/custom/path");
  });

  test("无 CODEBASE 段时保留原内容并追加 HINTS", () => {
    mockReadFile("global only");

    const input = "# just a simple prompt\nsome content";

    const result = buildStablePrompt(input, () => "dummy listing");

    assert.ok(result.systemPrompt.includes("# just a simple prompt"));
    assert.ok(result.systemPrompt.includes("some content"));
    assert.ok(result.systemPrompt.includes("[HINTS — Stable Guidance]"));
    assert.ok(result.systemPrompt.includes("$ du -hxd1"));
  });

  test("worktree override 路径优先", () => {
    mockReadFile("global hints");

    let capturedDir;
    const tracker = (dir) => {
      capturedDir = dir;
      return stubListing(dir);
    };

    const input = [
      "# prompt",
      "Current working directory: /normal/path",
      "The actual current working directory is: /worktree/path",
      "content",
    ].join("\n");

    buildStablePrompt(input, tracker);
    assert.equal(capturedDir, "/worktree/path");
  });

  test("generateFileListing 未提供时不输出 $ du -hxd1", () => {
    mockReadFile("global content");

    const input = "# prompt only";
    const result = buildStablePrompt(input, undefined);

    assert.ok(result.systemPrompt.includes("[HINTS — Stable Guidance]"));
    assert.ok(!result.systemPrompt.includes("$ du -hxd1"));
  });

  test("generateFileListing 返回空时不输出 $ du -hxd1", () => {
    mockReadFile("global content");

    const input = "# prompt only";
    const result = buildStablePrompt(input, () => "");

    assert.ok(result.systemPrompt.includes("[HINTS — Stable Guidance]"));
    assert.ok(!result.systemPrompt.includes("$ du -hxd1"));
  });

  test("systemPrompt 为空字符串时正常处理", () => {
    mockReadFile("global only");

    const result = buildStablePrompt("", () => "");

    assert.ok(result.systemPrompt.includes("[HINTS — Stable Guidance]"));
  });
});
