import fs from "node:fs";
import path from "node:path";

const MAX_DEPTH = 10;
const MAX_FILES = 10000;

let _listingCache = { dir: null, mtime: 0, count: 0, listing: "" };

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

/**
 * Format byte size to human-readable string (du -h style).
 */
function sizeStr(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + "G";
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + "M";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + "K";
  return bytes + "B";
}

/**
 * Recursively sum directory size.
 * Shared state.count is incremented across all visited entries.
 */
function dirSize(dir, depth, state) {
  if (depth > MAX_DEPTH) return 0;
  let total = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (state.count > MAX_FILES) break;
      state.count++;
      const full = path.join(dir, entry.name);
      try {
        const stat = fs.statSync(full);
        if (entry.isDirectory()) {
          total += dirSize(full, depth + 1, state);
        } else {
          total += stat.size;
        }
      } catch { /* skip unstatable entries */ }
    }
  } catch { /* skip unreadable dirs */ }
  return total;
}

/**
 * Generate `du -hxd1` style listing for a directory.
 * Cached by dir path, mtime, and entry count.
 */
export function generateFileListing(dir) {
  try {
    const stat = fs.statSync(dir);
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const mtimeMs = stat.mtimeMs;
    const count = entries.length;

    if (_listingCache.dir === dir && _listingCache.mtime === mtimeMs && _listingCache.count === count) {
      return _listingCache.listing;
    }

    const lines = entries.map(entry => {
      const name = entry.name;
      const isDir = entry.isDirectory();
      const full = path.join(dir, name);
      try {
        const size = isDir ? dirSize(full, 0, { count: 0 }) : fs.statSync(full).size;
        return sizeStr(size).padStart(8) + "  " + name + (isDir ? "/" : "");
      } catch {
        return "";
      }
    }).filter(Boolean);

    const listing = lines.join("\n");
    _listingCache = { dir, mtime: mtimeMs, count, listing };
    return listing;
  } catch {
    return "";
  }
}

/**
 * Reset internal cache (for testing).
 */
export function _resetCache() {
  _listingCache = { dir: null, mtime: 0, count: 0, listing: "" };
}
