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

  test("剥掉 CODEBASE 段，追加稳定 HINTS，不追加 du listing", () => {
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

    const result = buildStablePrompt(input);

    assert.ok(!result.systemPrompt.includes("PROJECT CODEBASE"), "CODEBASE block should be removed");
    assert.ok(!result.systemPrompt.includes("this should be removed"), "CODEBASE content should be removed");
    assert.ok(result.systemPrompt.includes("[HINTS — Stable Guidance]"));
    assert.ok(!result.systemPrompt.includes("$ du -hxd1"));
  });

  test("从 Current working directory 行提取 cwd 用于 project HINTS", () => {
    const paths = [];
    mock.method(fs, "readFileSync", (p) => {
      paths.push(p);
      return "global content";
    });

    const input = [
      "# prompt",
      "Current working directory: /custom/path",
      "some content",
    ].join("\n");

    buildStablePrompt(input);
    assert.ok(paths.includes("/custom/path/.gsd/HINTS.md"));
  });

  test("无 CODEBASE 段时保留原内容并追加 HINTS", () => {
    mockReadFile("global only");

    const input = "# just a simple prompt\nsome content";

    const result = buildStablePrompt(input);

    assert.ok(result.systemPrompt.includes("# just a simple prompt"));
    assert.ok(result.systemPrompt.includes("some content"));
    assert.ok(result.systemPrompt.includes("[HINTS — Stable Guidance]"));
    assert.ok(!result.systemPrompt.includes("$ du -hxd1"));
  });

  test("worktree override 路径优先", () => {
    const paths = [];
    mock.method(fs, "readFileSync", (p) => {
      paths.push(p);
      return "global hints";
    });

    const input = [
      "# prompt",
      "Current working directory: /normal/path",
      "The actual current working directory is: /worktree/path",
      "content",
    ].join("\n");

    buildStablePrompt(input);
    assert.ok(paths.includes("/worktree/path/.gsd/HINTS.md"));
    assert.ok(!paths.includes("/normal/path/.gsd/HINTS.md"));
  });


  test("systemPrompt 为空字符串时正常处理", () => {
    mockReadFile("global only");

    const result = buildStablePrompt("");

    assert.ok(result.systemPrompt.includes("[HINTS — Stable Guidance]"));
  });

  test("幂等快照：同一输入连续执行两次输出一致", () => {
    process.env.GSD_HOME = "/tmp/gsd-home";
    mockReadFile("hint content");

    const input = [
      "system prompt start",
      "Current working directory: /custom/path",
      "[SYSTEM CONTEXT — GSD]",
      "context body",
    ].join("\n");

    const first = buildStablePrompt(input).systemPrompt;
    const second = buildStablePrompt(first).systemPrompt;

    const expected = [
      "system prompt start",
      "Current working directory: /custom/path",
      "[SYSTEM CONTEXT — GSD]",
      "context body",
      "[HINTS — Stable Guidance]",
      "",
      "These instructions come from HINTS.md files and are intentionally injected into the stable system prompt.",
      "",
      "## Global HINTS (/tmp/gsd-home/HINTS.md)",
      "",
      "hint content",
      "",
      "## Project HINTS (/custom/path/.gsd/HINTS.md)",
      "",
      "hint content",
    ].join("\n");

    assert.equal(first, expected);
    assert.equal(second, expected);
  });
});
