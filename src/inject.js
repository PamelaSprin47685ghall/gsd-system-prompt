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
 * Rebuild system prompt: strip CODEBASE section, inject stable HINTS.
 */
export function buildStablePrompt(systemPrompt, cwd = process.cwd()) {
  const errors = [];

  // Strip [PROJECT CODEBASE — ...] section
  const lines = systemPrompt.split("\n");
  const kept = [];

  let inCodebaseBlock = false;
  let inCodebaseMapSection = false;

  for (const line of lines) {
    // Track [PROJECT CODEBASE] blocks
    if (line.startsWith("[PROJECT CODEBASE —")) {
      inCodebaseBlock = true;
      continue;
    }
    if (inCodebaseBlock) {
      const isNextBlockOrHeading = (line.startsWith("[") && !line.startsWith("[PROJECT CODEBASE —")) || line.startsWith("## ");
      if (isNextBlockOrHeading) {
        inCodebaseBlock = false;
      } else {
        continue;
      }
    }

    // Track standalone ## Codebase Map sections
    if (!inCodebaseBlock && line === "## Codebase Map") {
      inCodebaseMapSection = true;
      continue;
    }
    if (inCodebaseMapSection && line.startsWith("## ") && line !== "## Codebase Map") {
      inCodebaseMapSection = false;
    }

    // Keep line if not in either skip zone
    if (!inCodebaseBlock && !inCodebaseMapSection) {
      kept.push(line);
    }
  }

  let cleaned = kept.join("\n");

  // If HINTS already injected, return as-is
  if (cleaned.includes("[HINTS — Stable Guidance]")) {
    return { systemPrompt: cleaned, errors };
  }

  // Append HINTS block
  const { block: hintsBlock, errors: hintsErrors } = buildHintsBlock(cwd);
  errors.push(...hintsErrors);

  let result = cleaned;
  if (result && !result.endsWith("\n")) result += "\n";
  result += hintsBlock;

  return { systemPrompt: result, errors };
}
