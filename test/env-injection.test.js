import assert from "node:assert/strict";
import path from "node:path";
import { test, describe } from "node:test";

const importPluginFromDirectory = async (directory) => {
  const baseUrl = `file://${directory.endsWith("/") ? directory : `${directory}/`}`;
  const url = new URL("index.js", baseUrl);
  url.search = `?t=${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return import(url.href);
};

describe("bundled extension path self-injection", () => {
  test("normalizes existing directory entry to this plugin entry file", async () => {
    const previous = process.env.GSD_BUNDLED_EXTENSION_PATHS;
    const entryFile = path.resolve("index.js");

    try {
      process.env.GSD_BUNDLED_EXTENSION_PATHS = process.cwd();
      await importPluginFromDirectory(process.cwd());

      assert.deepEqual(
        process.env.GSD_BUNDLED_EXTENSION_PATHS.split(path.delimiter).filter(Boolean),
        [entryFile],
      );
    } finally {
      if (previous === undefined) delete process.env.GSD_BUNDLED_EXTENSION_PATHS;
      else process.env.GSD_BUNDLED_EXTENSION_PATHS = previous;
    }
  });

  test("does not append duplicate entry file", async () => {
    const previous = process.env.GSD_BUNDLED_EXTENSION_PATHS;
    const entryFile = path.resolve("index.js");

    try {
      process.env.GSD_BUNDLED_EXTENSION_PATHS = entryFile;
      await importPluginFromDirectory(process.cwd());

      assert.deepEqual(
        process.env.GSD_BUNDLED_EXTENSION_PATHS.split(path.delimiter).filter(Boolean),
        [entryFile],
      );
    } finally {
      if (previous === undefined) delete process.env.GSD_BUNDLED_EXTENSION_PATHS;
      else process.env.GSD_BUNDLED_EXTENSION_PATHS = previous;
    }
  });
});
