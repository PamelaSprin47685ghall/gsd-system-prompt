import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStablePrompt, loadHintSources, buildHintsBlock } from "./src/inject.js";
import { generateFileListing } from "./src/fs.js";

/* ── self-injection into subagent env ── */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundled = process.env.GSD_BUNDLED_EXTENSION_PATHS || "";
if (!bundled.includes(__dirname)) {
  process.env.GSD_BUNDLED_EXTENSION_PATHS = bundled
    ? `${bundled}${path.delimiter}${__dirname}`
    : __dirname;
}

/* ── helpers ── */

/**
 * Extract model name from payload, lowercased.
 * Returns empty string if unavailable.
 */
function modelName(payload) {
  if (payload && typeof payload.model === "string") {
    return payload.model.toLowerCase();
  }
  return "";
}

/**
 * Check if a model string matches deepseek or k2.6.
 */
function isReasoningModel(model) {
  return model.includes("deepseek") || model.includes("k2.6");
}

/**
 * Clone a message and inject reasoning_content from its thinking block(s).
 * Skips if the message already has reasoning_content or is role===user.
 */
function injectReasoning(msg) {
  if (msg.role === "user") return msg;
  if ("reasoning_content" in msg) return msg;

  let reasoning = "";
  const content = msg.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === "thinking" && block.thinking) {
        reasoning = block.thinking;
        break;
      }
    }
  }

  return { ...msg, reasoning_content: reasoning };
}

/**
 * Process before_provider_request for Responses API: strip prompt_cache_key.
 */
function handleResponsesPayload(payload) {
  // strip prompt_cache_key only
  const { prompt_cache_key, ...rest } = payload;
  return rest;
}

/**
 * Process before_provider_request: inject reasoning_content for deepseek/k2.6.
 */
function handleReasoningPayload(payload) {
  const messagesKey = "input" in payload ? "input" : "messages" in payload ? "messages" : null;
  if (!messagesKey) return payload;

  const messages = payload[messagesKey];
  if (!Array.isArray(messages)) return payload;

  let modified = false;
  const patched = messages.map(msg => {
    const m = injectReasoning(msg);
    if (m !== msg) modified = true;
    return m;
  });

  if (!modified) return payload;
  return { ...payload, [messagesKey]: patched };
}

/* ── plugin entry ── */

export default function systemPromptPlugin(pi) {
  /* before_agent_start ── restructure system prompt */
  pi.on("before_agent_start", (event, ctx) => {
    const sp = event?.systemPrompt;
    if (typeof sp !== "string") return;

    const result = buildStablePrompt(sp, generateFileListing);
    if (result.systemPrompt === sp) return;

    if (result.errors.length > 0 && ctx?.ui) {
      ctx.ui.notify(`pruner: HINTS 加载警告 — ${result.errors.join("; ")}`, "warning");
    }

    return { systemPrompt: result.systemPrompt };
  });

  /* before_provider_request ── adapter fixes */
  pi.on("before_provider_request", (event) => {
    const p = event?.payload;
    if (!p) return undefined;

    let payload = p;
    let changed = false;

    // 1. Responses API: strip prompt_cache_key
    if ("input" in payload) {
      const handled = handleResponsesPayload(payload);
      if (handled !== payload) {
        payload = handled;
        changed = true;
      }
    }

    // 2. reasoning_content fix for deepseek / k2.6
    const model = modelName(payload);
    if (model && isReasoningModel(model)) {
      const handled = handleReasoningPayload(payload);
      if (handled !== payload) {
        payload = handled;
        changed = true;
      }
    }

    return changed ? payload : p;
  });
}

/* ── named exports ── */
export { generateFileListing } from "./src/fs.js";
export { loadHintSources, buildHintsBlock } from "./src/inject.js";
