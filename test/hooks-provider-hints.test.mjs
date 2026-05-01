import assert from "node:assert/strict";
import { test, describe, mock, afterEach } from "node:test";
import fs from "node:fs";
import os from "node:os";
import { loadHintSources, buildHintsBlock } from "../src/inject.js";

describe("loadHintSources", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  test("加载 global + project HINTS", () => {
    // All HINTS files exist and have content
    mock.method(fs, "readFileSync", (p, enc) => {
      if (p.endsWith("HINTS.md")) return "hint content";
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const { sources, errors } = loadHintSources("/some/project");
    assert.equal(sources.length, 2);
    assert.equal(sources[0].label, "Global");
    assert.equal(errors.length, 0);
  });

  test("回退到 root HINTS.md", () => {
    // Global HINTS exists, project .gsd/HINTS.md ENOENT → falls back to root HINTS.md
    mock.method(fs, "readFileSync", (p, enc) => {
      // Global HINTS: inside home dir → exists
      if (p.endsWith(".gsd/HINTS.md") && p.startsWith(os.homedir())) {
        return "global hints";
      }
      // Project .gsd/HINTS.md: not in home dir → ENOENT
      if (p.endsWith(".gsd/HINTS.md")) {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      }
      // Project root HINTS.md → exists
      if (p.endsWith("HINTS.md")) {
        return "project root hints";
      }
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const { sources } = loadHintSources("/some/project");
    assert.equal(sources.length, 2);
    const projectSource = sources.find(s => s.label === "Project");
    assert.ok(projectSource);
    assert.equal(projectSource.content, "project root hints");
  });

  test("无 HINTS 时返回空 sources", () => {
    mock.method(fs, "readFileSync", () => {
      return ""; // all files exist but are empty
    });

    const { sources } = loadHintSources("/some/project");
    assert.equal(sources.length, 0);
  });

  test("cwd 为空时不查找 project HINTS", () => {
    mock.method(fs, "readFileSync", (p, enc) => {
      if (p.endsWith(".gsd/HINTS.md") && p.startsWith(os.homedir())) {
        return "global hints";
      }
      return "";
    });

    const { sources } = loadHintSources(undefined);
    assert.equal(sources.length, 1);
    assert.equal(sources[0].label, "Global");
  });
});

describe("buildHintsBlock", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  test("格式化 global + project HINTS", () => {
    mock.method(fs, "readFileSync", (p, enc) => {
      return "hint content";
    });

    const { block, errors } = buildHintsBlock("/some/project");
    assert.equal(errors.length, 0);
    assert.ok(block.includes("[HINTS — Stable Guidance]"));
    assert.ok(block.includes("These instructions come from HINTS.md files"));
    assert.ok(block.includes("## Global HINTS"));
    assert.ok(block.includes("## Project HINTS"));
  });
});
