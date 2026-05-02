import os from "node:os";
import path from "node:path";
import { readFile } from "./fs.js";

/**
 * Load global and project HINTS.md sources.
 */
export function loadHintSources(cwd) {
  const sources = [];
  const errors = [];

  // Global HINTS: $GSD_HOME/HINTS.md, default ~/.gsd/HINTS.md
  const gsdHome = process.env.GSD_HOME || path.join(os.homedir(), ".gsd");
  const globalPath = path.join(gsdHome, "HINTS.md");
  try {
    const content = readFile(globalPath);
    if (content) {
      sources.push({ label: "Global", path: globalPath, content });
    }
  } catch (err) {
    errors.push(`global HINTS (${globalPath}): ${err.message}`);
  }

  // Project HINTS: .gsd/HINTS.md or HINTS.md in cwd
  if (cwd) {
    const candidates = [path.join(cwd, ".gsd", "HINTS.md"), path.join(cwd, "HINTS.md")];
    for (const p of candidates) {
      try {
        const content = readFile(p);
        if (content) {
          sources.push({ label: "Project", path: p, content });
          break;
        }
      } catch (err) {
        errors.push(`project HINTS (${p}): ${err.message}`);
        break; // only try the next candidate if current doesn't exist
      }
    }
  }

  return { sources, errors };
}

/**
 * Build the [HINTS — Stable Guidance] block.
 */
export function buildHintsBlock(cwd) {
  const { sources, errors } = loadHintSources(cwd);

  const parts = [
    "[HINTS — Stable Guidance]",
    "",
    "These instructions come from HINTS.md files and are intentionally injected into the stable system prompt.",
  ];

  for (const s of sources) {
    parts.push("", `## ${s.label} HINTS (${s.path})`, "", s.content);
  }

  return { block: parts.join("\n"), errors };
}

/**
 * Extract and strip dynamic lines from system prompt.
 * Returns { cleaned, dynamicLines, cwd }.
 */
function extractDynamicContent(systemPrompt) {
  const lines = systemPrompt.split("\n");
  const dynamicLines = [];
  const kept = [];
  let cwd = process.cwd();

  for (const line of lines) {
    // Match dynamic patterns
    if (line.match(/^Current date and time:/)) {
      dynamicLines.push(line);
      continue;
    }
    if (line.match(/^Current working directory:/)) {
      dynamicLines.push(line);
      const m = line.match(/^Current working directory: (.+)/);
      if (m) cwd = m[1].trim();
      continue;
    }
    if (line.match(/^The actual current working directory is:/)) {
      dynamicLines.push(line);
      const m = line.match(/^The actual current working directory is: (.+)/);
      if (m) cwd = m[1].trim();
      continue;
    }
    kept.push(line);
  }

  return { cleaned: kept.join("\n"), dynamicLines, cwd };
}

/**
 * Rebuild system prompt: strip CODEBASE and dynamic content, inject stable HINTS.
 */
export function buildStablePrompt(systemPrompt) {
  const errors = [];

  // Phase 1: strip [PROJECT CODEBASE — ...] section
  const lines = systemPrompt.split("\n");
  const kept = [];
  let skipping = false;

  for (const line of lines) {
    if (line.startsWith("[PROJECT CODEBASE —")) {
      skipping = true;
      continue;
    }
    if (skipping && (line.startsWith("[") || line.startsWith("## "))) {
      skipping = false;
    }
    if (!skipping) {
      kept.push(line);
    }
  }

  let cleaned = kept.join("\n");

  if (cleaned.includes("[HINTS — Stable Guidance]")) {
    return { systemPrompt: cleaned, dynamicLines: [], errors };
  }

  // Phase 2: extract and strip dynamic content
  const { cleaned: stable, dynamicLines, cwd } = extractDynamicContent(cleaned);

  // Phase 3: append HINTS block
  const { block: hintsBlock, errors: hintsErrors } = buildHintsBlock(cwd);
  errors.push(...hintsErrors);

  let result = stable;
  if (result && !result.endsWith("\n")) result += "\n";
  result += hintsBlock;

  return { systemPrompt: result, dynamicLines, errors };
}
