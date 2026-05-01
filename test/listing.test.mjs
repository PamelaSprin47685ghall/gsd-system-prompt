import assert from "node:assert/strict";
import { test, describe, beforeEach, afterEach } from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { generateFileListing, _resetCache } from "../src/fs.js";

describe("generateFileListing", () => {
  let tmpDir;

  beforeEach(() => {
    _resetCache();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-listing-test-"));
    fs.writeFileSync(path.join(tmpDir, "a.txt"), "a".repeat(500));
    fs.writeFileSync(path.join(tmpDir, "b.txt"), "b".repeat(1500));
    fs.mkdirSync(path.join(tmpDir, "sub"));
    fs.writeFileSync(path.join(tmpDir, "sub", "c.txt"), "c".repeat(100));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    _resetCache();
  });

  test("返回 du -hxd1 格式", () => {
    const listing = generateFileListing(tmpDir);
    const lines = listing.split("\n").filter(Boolean);
    assert.equal(lines.length, 3);

    for (const line of lines) {
      assert.ok(/^\s{4,}\S+\s{2}\S+/.test(line), `line format wrong: ${JSON.stringify(line)}`);
    }

    const subLine = lines.find(l => l.includes("sub"));
    assert.ok(subLine.endsWith("/"), `dir line should end with /: ${subLine}`);

    const aLine = lines.find(l => l.includes("a.txt"));
    assert.ok(aLine && !aLine.endsWith("/"), `file line should not end with /: ${aLine}`);

    const aSize = aLine.trim().split(/\s+/)[0];
    assert.ok(aSize.endsWith("B"), `a.txt size should be in bytes: ${aSize}`);
  });

  test("无效目录返回空", () => {
    const listing = generateFileListing("/nonexistent/path/xyz123");
    assert.equal(listing, "");
  });

  test("缓存命中时返回相同结果", () => {
    const first = generateFileListing(tmpDir);
    const second = generateFileListing(tmpDir);
    assert.equal(first, second);
  });

  test("清空缓存后重新生成", () => {
    const first = generateFileListing(tmpDir);
    _resetCache();
    const second = generateFileListing(tmpDir);
    assert.equal(first, second);
  });
});
