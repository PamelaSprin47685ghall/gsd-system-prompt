import fs from "node:fs";

/**
 * Read a file synchronously. Returns trimmed content.
 * Returns "" if file does not exist. Other errors propagate.
 */
export function readFile(p) {
  try {
    return fs.readFileSync(p, "utf-8").trim();
  } catch (err) {
    if (err.code === "ENOENT") return "";
    throw err;
  }
}
